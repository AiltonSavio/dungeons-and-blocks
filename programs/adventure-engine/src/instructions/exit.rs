use anchor_lang::prelude::*;
use hero_core::cpi::accounts::{AdventureWrite as HeroAdventureWriteCtx, UnlockCtx};
use hero_core::state::AdventureHeroStats;

use crate::errors::AdventureError;
use crate::instructions::support::{load_hero_lock, store_hero_lock};
use crate::state::{DungeonPoint, ItemSlot};
use crate::{constants::*, ExitAdventure};
use player_economy::constants::{ITEM_COUNT as ECON_ITEM_COUNT, PLAYER_ECONOMY_SEED};
use player_economy::state::{ItemKey, LootDepositItem, PlayerEconomy};

pub fn exit_adventure<'info>(ctx: Context<'_, '_, '_, 'info, ExitAdventure<'info>>) -> Result<()> {
    let adventure_ref = &ctx.accounts.adventure;
    let authority = ctx.accounts.authority.key();
    let owner = ctx.accounts.owner.key();

    // Authorization check: authority must be either the owner or a delegated authority
    let is_authorized = authority == owner || adventure_ref.delegate == Some(authority);
    require!(is_authorized, AdventureError::Unauthorized);

    require!(adventure_ref.is_active, AdventureError::AdventureNotActive);
    require!(
        adventure_ref.heroes_inside,
        AdventureError::AdventureNotActive
    );
    require!(!adventure_ref.in_combat, AdventureError::CombatNotResolved);

    let hero_count = adventure_ref.hero_count as usize;
    let mut portal_hit: Option<(usize, DungeonPoint)> = None;
    for (idx, portal) in adventure_ref.portals.iter().enumerate() {
        if adventure_ref.party_position == *portal {
            portal_hit = Some((idx, *portal));
            break;
        }
    }

    let (portal_index, portal_point) =
        portal_hit.ok_or_else(|| error!(AdventureError::NoPortalAtPosition))?;

    let now = Clock::get()?.unix_timestamp;
    let hero_mints: Vec<Pubkey> = adventure_ref.hero_mints[..hero_count]
        .iter()
        .copied()
        .collect();

    // Process remaining accounts (hero unlock) only if provided
    // During delegated exit from ephemeral, these accounts are readonly/omitted
    // to avoid "undelegated writable account" errors
    let hero_accounts_provided = ctx.remaining_accounts.len() >= hero_count * 2;
    if hero_accounts_provided {
        for (i, hero_mint) in hero_mints.iter().enumerate() {
            let hero_account_info = ctx.remaining_accounts[i * 2].clone();
            require_keys_eq!(
                *hero_account_info.key,
                *hero_mint,
                AdventureError::InvalidHeroLockAccount
            );

            let lock_info = ctx.remaining_accounts[i * 2 + 1].clone();
            let (expected_lock, _) =
                Pubkey::find_program_address(&[HERO_LOCK_SEED, hero_mint.as_ref()], ctx.program_id);
            require_keys_eq!(
                *lock_info.key,
                expected_lock,
                AdventureError::InvalidHeroLockAccount
            );

            // Only write to hero locks if they're writable (not during delegated exit)
            if lock_info.is_writable && hero_account_info.is_writable {
                let adventure_bump = adventure_ref.bump;
                let dungeon_mint = adventure_ref.dungeon_mint;
                let adventure_seeds = &[
                    ADVENTURE_SEED,
                    owner.as_ref(),
                    dungeon_mint.as_ref(),
                    &[adventure_bump],
                ];
                let signer_seeds = &[&adventure_seeds[..]];

                // Sync latest stats back to hero PDA before unlocking
                let snapshot = adventure_ref
                    .hero_snapshots
                    .get(i)
                    .copied()
                    .unwrap_or_default();
                let adventure_stats: AdventureHeroStats = snapshot.into();
                let write_accounts = HeroAdventureWriteCtx {
                    adventure_signer: ctx.accounts.adventure.to_account_info(),
                    hero_mint: hero_account_info.clone(),
                };
                let write_program = ctx.accounts.hero_program.to_account_info();
                let write_ctx =
                    CpiContext::new_with_signer(write_program, write_accounts, signer_seeds);
                hero_core::cpi::sync_stats_from_adventure(write_ctx, adventure_stats)?;

                let mut hero_lock = load_hero_lock(&lock_info)?;
                hero_lock.is_active = false;
                hero_lock.adventure = Pubkey::default();
                hero_lock.last_updated = now;
                store_hero_lock(&lock_info, &hero_lock)?;

                // Call hero-core to unlock the hero
                let cpi_accounts = UnlockCtx {
                    player: ctx.accounts.owner.to_account_info(),
                    hero_mint: hero_account_info,
                    adventure_signer: ctx.accounts.adventure.to_account_info(),
                };
                let cpi_program = ctx.accounts.hero_program.to_account_info();
                let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
                hero_core::cpi::unlock_from_adventure(cpi_ctx, ctx.accounts.adventure.key())?;
            }
        }
    }

    // Gather loot to transfer back to the player economy
    let mut total_gold: u64 = 0;
    let mut item_totals = [0u32; ECON_ITEM_COUNT];
    {
        let adventure = &mut ctx.accounts.adventure;
        for slot in adventure.items.iter_mut() {
            if slot.is_empty() {
                *slot = ItemSlot::empty();
                continue;
            }

            if slot.item_key == ITEM_POUCH_GOLD {
                let quantity = slot.quantity as u64;
                total_gold = total_gold
                    .checked_add(
                        quantity
                            .checked_mul(POUCH_GOLD_VALUE)
                            .ok_or(AdventureError::ItemStackOverflow)?,
                    )
                    .ok_or(AdventureError::ItemStackOverflow)?;
            } else if (slot.item_key as usize) < item_totals.len() {
                item_totals[slot.item_key as usize] =
                    item_totals[slot.item_key as usize].saturating_add(slot.quantity as u32);
            }

            *slot = ItemSlot::empty();
        }
        adventure.item_count = 0;
    }

    let mut item_deposits: Vec<LootDepositItem> = Vec::new();
    for (index, total) in item_totals.iter().enumerate() {
        if *total == 0 || index == ITEM_POUCH_GOLD as usize {
            continue;
        }

        let item_key = match index as u8 {
            1 => ItemKey::StressTonic,
            2 => ItemKey::MinorTorch,
            3 => ItemKey::HealingSalve,
            4 => ItemKey::MysteryRelic,
            5 => ItemKey::CalmingIncense,
            6 => ItemKey::PhoenixFeather,
            _ => continue,
        };

        let mut remaining = *total;
        while remaining > 0 {
            let chunk = remaining.min(u32::from(u16::MAX));
            item_deposits.push(LootDepositItem {
                item: item_key,
                quantity: chunk as u16,
            });
            remaining -= chunk;
        }
    }

    let dungeon_owner = ctx.accounts.dungeon.owner;
    let mut fee = if total_gold == 0 {
        0
    } else {
        ((total_gold as u128 * DUNGEON_FEE_BPS as u128) / BPS_DENOMINATOR as u128) as u64
    };

    if ctx.accounts.owner.key() == dungeon_owner {
        fee = 0;
    }

    let player_gold = total_gold.saturating_sub(fee);

    let adventure_signer_bump = ctx.accounts.adventure.bump;
    let owner_key = ctx.accounts.owner.key();
    let dungeon_key = ctx.accounts.dungeon.key();
    let adventure_seeds = [
        ADVENTURE_SEED,
        owner_key.as_ref(),
        dungeon_key.as_ref(),
        &[adventure_signer_bump],
    ];
    let signer_seeds = &[&adventure_seeds[..]];

    if player_gold > 0 || !item_deposits.is_empty() {
        let deposit_accounts = player_economy::cpi::accounts::DepositLoot {
            authority: ctx.accounts.adventure.to_account_info(),
            player_economy: ctx.accounts.player_economy.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.player_economy_program.to_account_info(),
            deposit_accounts,
            signer_seeds,
        );
        player_economy::cpi::deposit_loot(cpi_ctx, player_gold, item_deposits)?;
    }

    if fee > 0 {
        let owner_index = if hero_accounts_provided {
            hero_count * 2
        } else {
            0
        };
        let owner_account_info = ctx
            .remaining_accounts
            .get(owner_index)
            .ok_or(AdventureError::DungeonOwnerEconomyMissing)?
            .clone();

        let (expected_owner_pda, _) = Pubkey::find_program_address(
            &[PLAYER_ECONOMY_SEED, dungeon_owner.as_ref()],
            ctx.accounts.player_economy_program.key,
        );

        require_keys_eq!(
            *owner_account_info.key,
            expected_owner_pda,
            AdventureError::DungeonOwnerEconomyMissing
        );
        require!(
            owner_account_info.is_writable,
            AdventureError::DungeonOwnerEconomyMissing
        );
        require!(
            owner_account_info.data_len() >= PlayerEconomy::LEN,
            AdventureError::DungeonOwnerEconomyMissing
        );

        let deposit_accounts = player_economy::cpi::accounts::DepositLoot {
            authority: ctx.accounts.adventure.to_account_info(),
            player_economy: owner_account_info,
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.player_economy_program.to_account_info(),
            deposit_accounts,
            signer_seeds,
        );
        player_economy::cpi::deposit_loot(cpi_ctx, fee, Vec::<LootDepositItem>::new())?;
    }

    {
        let adventure = &mut ctx.accounts.adventure;
        if portal_index < adventure.used_portals.len() {
            adventure.used_portals[portal_index] = 1;
        }
        adventure.last_exit_portal = portal_index as u8;
        adventure.last_exit_position = portal_point;
        adventure.party_position = portal_point;
        adventure.is_active = false;
        adventure.heroes_inside = false;
        adventure.last_crew_timestamp = now;
        adventure.in_combat = false;
        adventure.combat_account = Pubkey::default();
        adventure.pending_encounter_seed = 0;
        adventure
            .pending_loot
            .iter_mut()
            .for_each(|slot| *slot = ItemSlot::empty());
        adventure.pending_loot_count = 0;
        adventure.pending_loot_source = u8::MAX;
    }

    Ok(())
}

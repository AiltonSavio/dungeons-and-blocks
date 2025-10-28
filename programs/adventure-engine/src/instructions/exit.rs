use anchor_lang::prelude::*;
use hero_core::cpi::accounts::{AdventureWrite as HeroAdventureWriteCtx, UnlockCtx};
use hero_core::state::AdventureHeroStats;

use crate::errors::AdventureError;
use crate::instructions::support::{load_hero_lock, store_hero_lock};
use crate::state::DungeonPoint;
use crate::{constants::*, ExitAdventure};

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
    if ctx.remaining_accounts.len() >= hero_count * 2 {
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
    }

    Ok(())
}

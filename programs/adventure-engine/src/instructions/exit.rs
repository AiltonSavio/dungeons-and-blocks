use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

use crate::errors::AdventureError;
use crate::instructions::support::{load_hero_lock, store_hero_lock, unlock_hero_from_adventure};
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
    let positions = &adventure_ref.hero_positions[..hero_count];

    let mut portal_hit: Option<(usize, DungeonPoint)> = None;
    for (idx, portal) in adventure_ref.portals.iter().enumerate() {
        if positions.iter().any(|pos| pos == portal) {
            portal_hit = Some((idx, *portal));
            break;
        }
    }

    let (portal_index, portal_point) =
        portal_hit.ok_or_else(|| error!(AdventureError::NoPortalAtPosition))?;

    require!(
        ctx.remaining_accounts.len() == hero_count * 2,
        AdventureError::InvalidHeroLockAccount
    );

    let now = Clock::get()?.unix_timestamp;
    let adventure_key = ctx.accounts.adventure.key();
    let adventure_player = adventure_ref.player;
    let dungeon_key = adventure_ref.dungeon_mint;
    let bump_seed = [ctx.accounts.adventure.bump];
    let adventure_signer_seeds: &[&[u8]] = &[
        ADVENTURE_SEED,
        adventure_player.as_ref(),
        dungeon_key.as_ref(),
        &bump_seed,
    ];
    let hero_core_program_info = ctx.accounts.hero_core_program.to_account_info();
    let owner_account_info = ctx.accounts.owner.to_account_info();
    let adventure_account_info = ctx.accounts.adventure.to_account_info();

    let hero_mints: Vec<Pubkey> = adventure_ref.hero_mints[..hero_count]
        .iter()
        .copied()
        .collect();

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

        unlock_hero_from_adventure(
            &hero_core_program_info,
            &owner_account_info,
            &hero_account_info,
            &adventure_account_info,
            &adventure_key,
            adventure_signer_seeds,
        )?;

        let mut hero_lock = load_hero_lock(&lock_info)?;
        hero_lock.is_active = false;
        hero_lock.adventure = Pubkey::default();
        hero_lock.last_updated = now;
        store_hero_lock(&lock_info, &hero_lock)?;
    }

    let adventure = &mut ctx.accounts.adventure;
    if portal_index < adventure.used_portals.len() {
        adventure.used_portals[portal_index] = 1;
    }
    adventure.last_exit_portal = portal_index as u8;
    adventure.last_exit_position = portal_point;
    adventure.is_active = false;
    adventure.heroes_inside = false;
    adventure.last_crew_timestamp = now;

    let payer_info = owner_account_info.clone();
    let adventure_info = adventure_account_info.clone();
    let magic_program_info = ctx.accounts.magic_program.to_account_info();

    commit_and_undelegate_accounts(
        &payer_info,
        vec![&adventure_info],
        &ctx.accounts.magic_context,
        &magic_program_info,
    )
    .map_err(Into::into)
}

use std::{collections::BTreeSet, mem};

use crate::instructions::support::{
    load_hero_lock, lock_hero_for_adventure, read_hero_summary, store_hero_lock,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};
use dungeon_nft::state::DungeonStatus;

use crate::errors::AdventureError;
use crate::logic::{generate_adventure, is_floor};
use crate::state::{DungeonPoint, HeroAdventureLock};
use crate::{constants::*, StartAdventure};

pub fn start_adventure<'info>(
    ctx: Context<'_, '_, '_, 'info, StartAdventure<'info>>,
    hero_mints: Vec<Pubkey>,
) -> Result<()> {
    let player_key = ctx.accounts.player.key();
    let dungeon_key = ctx.accounts.dungeon.key();
    let dungeon_seed = ctx.accounts.dungeon.seed;
    let dungeon_grid_width = ctx.accounts.dungeon.grid_width;
    let dungeon_grid_height = ctx.accounts.dungeon.grid_height;
    let dungeon_status = ctx.accounts.dungeon.status;
    let adventure_key = ctx.accounts.adventure.key();
    let adventure_player = ctx.accounts.adventure.player;
    let adventure_dungeon_mint = ctx.accounts.adventure.dungeon_mint;
    let adventure_heroes_inside = ctx.accounts.adventure.heroes_inside;
    let adventure_last_reset = ctx.accounts.adventure.last_reset_at;
    let adventure_last_exit_portal = ctx.accounts.adventure.last_exit_portal;
    let adventure_last_crew_count = ctx.accounts.adventure.last_crew_count;
    let adventure_last_crew = ctx.accounts.adventure.last_crew;
    let adventure_last_crew_timestamp = ctx.accounts.adventure.last_crew_timestamp;
    let adventure_last_exit_position = ctx.accounts.adventure.last_exit_position;

    let is_new = adventure_player == Pubkey::default();

    require!(
        !hero_mints.is_empty() && hero_mints.len() <= MAX_PARTY,
        AdventureError::InvalidHeroCount
    );
    require!(
        dungeon_status == DungeonStatus::Ready,
        AdventureError::DungeonNotReady
    );
    require!(dungeon_seed != 0, AdventureError::DungeonSeedMissing);

    let now = Clock::get()?.unix_timestamp;

    if !is_new {
        require!(
            adventure_player == player_key,
            AdventureError::AdventureOwnerMismatch
        );
        require!(
            adventure_dungeon_mint == dungeon_key,
            AdventureError::AdventureOwnerMismatch
        );
    }
    require!(
        !adventure_heroes_inside,
        AdventureError::AdventureAlreadyActive
    );

    // Sorted & unique hero list (enforce no dups)
    let mut sorted_unique: Vec<Pubkey> = hero_mints.clone();
    sorted_unique.sort();
    let mut set = BTreeSet::new();
    for key in &sorted_unique {
        require!(set.insert(*key), AdventureError::DuplicateHero);
    }

    // Expect pairs: [hero_account, hero_lock_pda] * N
    let expected_accounts = sorted_unique.len() * 2;
    require!(
        ctx.remaining_accounts.len() == expected_accounts,
        AdventureError::InvalidHeroLockAccount
    );

    let mut hero_array = [Pubkey::default(); MAX_PARTY];
    let mut position_array = [DungeonPoint::default(); MAX_PARTY];
    let adventure_bump = ctx.bumps.adventure;
    let bump_seed = [adventure_bump];
    let player_bytes = player_key.as_ref();
    let dungeon_bytes = dungeon_key.as_ref();
    let adventure_signer_seeds: &[&[u8]] =
        &[ADVENTURE_SEED, player_bytes, dungeon_bytes, &bump_seed];

    let player_account_info = ctx.accounts.player.to_account_info();
    let adventure_account_info = ctx.accounts.adventure.to_account_info();
    let hero_core_program_info = ctx.accounts.hero_core_program.to_account_info();

    for (idx, hero_key) in sorted_unique.iter().enumerate() {
        hero_array[idx] = *hero_key;

        let hero_account_info = ctx.remaining_accounts[idx * 2].clone();
        let hero_summary = read_hero_summary(&hero_account_info)?;
        require!(
            hero_summary.owner == player_key,
            AdventureError::HeroNotOwned
        );
        require!(!hero_summary.is_burned, AdventureError::HeroUnavailable);

        let (lock_pda, lock_bump) =
            Pubkey::find_program_address(&[HERO_LOCK_SEED, hero_key.as_ref()], ctx.program_id);

        let lock_account_info = ctx.remaining_accounts[idx * 2 + 1].clone();

        require_keys_eq!(
            *lock_account_info.key,
            lock_pda,
            AdventureError::InvalidHeroLockAccount
        );

        // Inline init of the lock PDA if missing
        if lock_account_info.data_len() == 0 {
            let rent = Rent::get()?.minimum_balance(HeroAdventureLock::LEN);
            let create_ix = build_create_account_instruction(
                ctx.accounts.player.key,
                lock_account_info.key,
                rent,
                HeroAdventureLock::LEN as u64,
                ctx.program_id,
            );
            let signer_seeds: &[&[&[u8]]] = &[&[HERO_LOCK_SEED, hero_key.as_ref(), &[lock_bump]]];
            let accounts = [
                ctx.accounts.player.to_account_info(),
                lock_account_info.clone(),
                ctx.accounts.system_program.to_account_info(),
            ];
            invoke_signed(&create_ix, &accounts, signer_seeds)?;
        }

        // Enforce & store lock state
        let mut hero_lock = load_hero_lock(&lock_account_info)?;
        store_hero_lock(&lock_account_info, &hero_lock)?;
        require!(
            hero_lock.owner == Pubkey::default() || hero_lock.owner == player_key,
            AdventureError::HeroLockOwnerMismatch
        );
        require!(
            !hero_lock.is_active || hero_lock.adventure == adventure_key,
            AdventureError::HeroAlreadyActive
        );

        hero_lock.hero_mint = *hero_key;
        hero_lock.owner = player_key;
        hero_lock.adventure = adventure_key;
        hero_lock.bump = lock_bump;
        hero_lock.is_active = true;
        hero_lock.last_updated = now;
        store_hero_lock(&lock_account_info, &hero_lock)?;

        // CPI: lock hero in hero-core (uses adventure PDA as signer)
        lock_hero_for_adventure(
            &hero_core_program_info,
            &player_account_info,
            &hero_account_info,
            &adventure_account_info,
            &adventure_key,
            adventure_signer_seeds,
        )?;
    }

    // Reset logic / map generation
    let should_reset = !adventure_heroes_inside
        && now.saturating_sub(adventure_last_reset) >= RESET_INTERVAL_SECONDS;

    let adventure = &mut ctx.accounts.adventure;

    if is_new {
        adventure.player = player_key;
        adventure.dungeon_mint = dungeon_key;
        adventure.bump = ctx.bumps.adventure;
        adventure.created_at = now;
        adventure.last_reset_at = now;
        adventure.delegate = None;
    }

    let generated = generate_adventure(dungeon_seed, dungeon_grid_width, dungeon_grid_height);

    let previous_opened = mem::take(&mut adventure.opened_chests);
    let previous_used = mem::take(&mut adventure.used_portals);

    adventure.grid = generated.grid;
    adventure.rooms = generated.rooms;
    adventure.doors = generated.doors;
    adventure.chests = generated.chests;
    adventure.portals = generated.portals;

    let chests_len = adventure.chests.len();
    let portals_len = adventure.portals.len();
    adventure.opened_chests = previous_opened;
    ensure_u8_vector_length(&mut adventure.opened_chests, chests_len);
    adventure.used_portals = previous_used;
    ensure_u8_vector_length(&mut adventure.used_portals, portals_len);

    adventure.seed = dungeon_seed;
    adventure.width = dungeon_grid_width;
    adventure.height = dungeon_grid_height;

    if should_reset {
        adventure.opened_chests.fill(0);
        adventure.used_portals.fill(0);
        adventure.last_exit_portal = PORTAL_NONE;
        adventure.last_exit_position = adventure
            .rooms
            .first()
            .map(|room| room.center())
            .unwrap_or(DungeonPoint { x: 1, y: 1 });
        adventure.last_reset_at = now;
    } else if adventure.last_exit_portal as usize >= adventure.portals.len() {
        adventure.last_exit_portal = PORTAL_NONE;
    }

    let same_party = adventure_last_crew_count as usize == sorted_unique.len()
        && adventure_last_crew[..sorted_unique.len()] == hero_array[..sorted_unique.len()]
        && now.saturating_sub(adventure_last_crew_timestamp) <= CREW_EXPIRY_SECONDS
        && adventure_last_exit_portal != PORTAL_NONE;

    let fallback_point = adventure
        .rooms
        .first()
        .map(|room| room.center())
        .unwrap_or(DungeonPoint { x: 1, y: 1 });

    let start_point = if same_party {
        adventure_last_exit_position
    } else {
        fallback_point
    };

    if !same_party {
        adventure.last_exit_portal = PORTAL_NONE;
        adventure.last_exit_position = fallback_point;
    }

    if !is_floor(
        &adventure.grid,
        adventure.width,
        start_point.x,
        start_point.y,
    ) {
        adventure.last_exit_portal = PORTAL_NONE;
    }

    for pos in position_array.iter_mut().take(sorted_unique.len()) {
        *pos = start_point;
    }

    adventure.hero_mints = hero_array;
    adventure.hero_positions = position_array;
    adventure.hero_count = sorted_unique.len() as u8;
    adventure.item_count = 0;
    adventure.item_mints = [Pubkey::default(); MAX_ITEMS];
    adventure.is_active = true;
    adventure.heroes_inside = true;
    adventure.last_started_at = now;
    adventure.last_crew = hero_array;
    adventure.last_crew_count = adventure.hero_count;
    adventure.last_crew_timestamp = now;

    Ok(())
}

fn build_create_account_instruction(
    payer: &Pubkey,
    new_account: &Pubkey,
    lamports: u64,
    space: u64,
    owner: &Pubkey,
) -> Instruction {
    #[allow(deprecated)]
    {
        anchor_lang::solana_program::system_instruction::create_account(
            payer,
            new_account,
            lamports,
            space,
            owner,
        )
    }
}

fn ensure_u8_vector_length(vec: &mut Vec<u8>, new_len: usize) {
    if vec.len() < new_len {
        vec.resize(new_len, 0);
    } else if vec.len() > new_len {
        vec.truncate(new_len);
    }
}

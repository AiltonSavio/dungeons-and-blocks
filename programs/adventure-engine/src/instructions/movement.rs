use anchor_lang::prelude::*;

use crate::constants::{
    ENCOUNTER_BASE_BPS, ENCOUNTER_MAX_TORCH, ENCOUNTER_MIN_TORCH, ENCOUNTER_TORCH_SLOPE_BPS,
};
use crate::errors::AdventureError;
use crate::logic::{is_floor, Mulberry32};
use crate::state::{AdventureSession, DungeonPoint};
use crate::{Direction, MoveHero};

impl Direction {
    fn delta(self) -> (i16, i16) {
        match self {
            Direction::North => (0, -1),
            Direction::NorthEast => (1, -1),
            Direction::East => (1, 0),
            Direction::SouthEast => (1, 1),
            Direction::South => (0, 1),
            Direction::SouthWest => (-1, 1),
            Direction::West => (-1, 0),
            Direction::NorthWest => (-1, -1),
        }
    }
}

pub fn move_hero(ctx: Context<MoveHero>, direction: Direction) -> Result<()> {
    let adventure = &mut ctx.accounts.adventure;
    let authority = ctx.accounts.authority.key();
    let owner = ctx.accounts.owner.key();

    // Authorization check: authority must be either the owner or a delegated authority
    let is_authorized = authority == owner || adventure.delegate == Some(authority);
    require!(is_authorized, AdventureError::Unauthorized);

    require!(adventure.is_active, AdventureError::AdventureNotActive);
    require!(adventure.heroes_inside, AdventureError::AdventureNotActive);
    require!(
        !adventure.in_combat,
        AdventureError::MovementBlockedInCombat
    );

    let (dx, dy) = direction.delta();
    let current = adventure.party_position;
    let next_x = current.x as i32 + dx as i32;
    let next_y = current.y as i32 + dy as i32;

    require!(
        next_x >= 0 && next_y >= 0,
        AdventureError::MovementOutOfBounds
    );
    require!(
        next_x < adventure.width as i32 && next_y < adventure.height as i32,
        AdventureError::MovementOutOfBounds
    );

    let next_x_u16 = next_x as u16;
    let next_y_u16 = next_y as u16;

    require!(
        is_floor(&adventure.grid, adventure.width, next_x_u16, next_y_u16),
        AdventureError::MovementIntoWall
    );

    adventure.party_position = DungeonPoint {
        x: next_x_u16,
        y: next_y_u16,
    };

    // Decrement torch by 1 on each move, but don't go below 0
    adventure.torch = adventure.torch.saturating_sub(1);

    maybe_trigger_encounter(adventure)?;

    Ok(())
}

fn maybe_trigger_encounter(adventure: &mut AdventureSession) -> Result<()> {
    let clock = Clock::get()?;
    let torch = adventure.torch;
    let encounter_bps = encounter_chance_bps(torch);

    if encounter_bps == 0 {
        return Ok(());
    }

    let mut seed_mix = (adventure.seed as u64)
        ^ ((clock.slot as u64) << 16)
        ^ ((clock.unix_timestamp as u64) << 1)
        ^ ((adventure.party_position.x as u64) << 40)
        ^ ((adventure.party_position.y as u64) << 24);

    if seed_mix == 0 {
        seed_mix = 1;
    }

    let folded = (seed_mix as u32) ^ ((seed_mix >> 32) as u32);
    let mut rng = Mulberry32::new(folded);
    let roll = rng.next_u32() % 10_000;

    if roll < encounter_bps as u32 {
        let mut encounter_seed = seed_mix ^ ((rng.next_u32() as u64) << 8);
        if encounter_seed == 0 {
            encounter_seed = seed_mix | 1;
        }
        adventure.pending_encounter_seed = encounter_seed;
        // Note: in_combat is set to true only when player accepts (via begin_encounter)
        // This allows the frontend to show an encounter modal without blocking movement on-chain
    }

    Ok(())
}

fn encounter_chance_bps(torch: u8) -> u16 {
    let clamped = torch.max(ENCOUNTER_MIN_TORCH).min(ENCOUNTER_MAX_TORCH);
    let delta = (ENCOUNTER_MAX_TORCH as i16) - (clamped as i16);
    let mut chance =
        ENCOUNTER_BASE_BPS as i32 + (delta as i32) * (ENCOUNTER_TORCH_SLOPE_BPS as i32);
    if chance < ENCOUNTER_BASE_BPS as i32 {
        chance = ENCOUNTER_BASE_BPS as i32;
    }
    if chance > 9_500 {
        chance = 9_500;
    }
    chance as u16
}

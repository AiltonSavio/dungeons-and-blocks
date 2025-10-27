use anchor_lang::prelude::*;

use crate::errors::AdventureError;
use crate::logic::is_floor;
use crate::state::DungeonPoint;
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

    Ok(())
}

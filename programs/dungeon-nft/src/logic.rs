use anchor_lang::prelude::*;

use crate::errors::DungeonError;

pub fn validate_grid_dimensions(grid_width: u16, grid_height: u16) -> Result<()> {
    require!(grid_width > 4 && grid_height > 4, DungeonError::InvalidGrid);
    let cell_count = (grid_width as usize)
        .checked_mul(grid_height as usize)
        .ok_or(DungeonError::MathOverflow)?;
    require!(cell_count <= 10_000, DungeonError::GridTooLarge);
    Ok(())
}

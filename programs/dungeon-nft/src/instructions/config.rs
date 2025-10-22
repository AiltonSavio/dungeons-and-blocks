use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, MAX_NAME_LEN, MAX_SUPPLY, MAX_SYMBOL_LEN, MAX_URI_LEN};
use crate::errors::DungeonError;
use crate::logic::validate_grid_dimensions;
use crate::state::{ConfigGridUpdated, ConfigInitialized, ConfigMetadataUpdated, DungeonConfig};

pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    collection_name: String,
    symbol: String,
    base_uri: String,
    grid_width: u16,
    grid_height: u16,
) -> Result<()> {
    let authority = &ctx.accounts.authority;
    let config = &mut ctx.accounts.config;

    validate_grid_dimensions(grid_width, grid_height)?;

    let name = collection_name.trim();
    let symbol_trimmed = symbol.trim();
    let uri = base_uri.trim();

    require!(
        !name.is_empty() && name.len() <= MAX_NAME_LEN,
        DungeonError::InvalidCollectionName
    );
    require!(
        !symbol_trimmed.is_empty() && symbol_trimmed.len() <= MAX_SYMBOL_LEN,
        DungeonError::InvalidSymbol
    );
    require!(
        !uri.is_empty() && uri.len() <= MAX_URI_LEN,
        DungeonError::InvalidUri
    );

    config.authority = authority.key();
    config.bump = ctx.bumps.config;
    config.max_supply = MAX_SUPPLY;
    config.next_mint_id = 0;
    config.completed_mints = 0;
    config.grid_width = grid_width;
    config.grid_height = grid_height;
    config.collection_name = name.to_string();
    config.collection_symbol = symbol_trimmed.to_string();
    config.base_uri = uri.to_string();

    emit!(ConfigInitialized {
        authority: authority.key(),
        grid_width,
        grid_height,
    });

    Ok(())
}

pub fn update_config_metadata(
    ctx: Context<UpdateConfig>,
    collection_name: String,
    symbol: String,
    base_uri: String,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    let name = collection_name.trim();
    let symbol_trimmed = symbol.trim();
    let uri = base_uri.trim();

    require!(
        !name.is_empty() && name.len() <= MAX_NAME_LEN,
        DungeonError::InvalidCollectionName
    );
    require!(
        !symbol_trimmed.is_empty() && symbol_trimmed.len() <= MAX_SYMBOL_LEN,
        DungeonError::InvalidSymbol
    );
    require!(
        !uri.is_empty() && uri.len() <= MAX_URI_LEN,
        DungeonError::InvalidUri
    );

    config.collection_name = name.to_string();
    config.collection_symbol = symbol_trimmed.to_string();
    config.base_uri = uri.to_string();

    emit!(ConfigMetadataUpdated {
        authority: ctx.accounts.authority.key(),
    });

    Ok(())
}

pub fn update_config_grid(
    ctx: Context<UpdateConfig>,
    grid_width: u16,
    grid_height: u16,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(
        config.completed_mints == 0,
        DungeonError::GridImmutableAfterMint
    );

    validate_grid_dimensions(grid_width, grid_height)?;

    config.grid_width = grid_width;
    config.grid_height = grid_height;

    emit!(ConfigGridUpdated {
        authority: ctx.accounts.authority.key(),
        grid_width,
        grid_height,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = DungeonConfig::space(),
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, DungeonConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, constraint = authority.key() == config.authority @ DungeonError::Unauthorized)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, DungeonConfig>,
}

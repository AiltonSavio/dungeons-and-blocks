use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod helpers;
pub mod instructions;
pub mod logic;
pub mod state;

pub use errors::DungeonError;
pub(crate) use instructions::config::{
    __client_accounts_initialize_config, __client_accounts_update_config,
};
pub(crate) use instructions::mint::{
    __client_accounts_callback_mint_dungeon, __client_accounts_mint_dungeon,
};
pub use instructions::{
    config::{InitializeConfig, UpdateConfig},
    mint::{CallbackMintDungeon, MintDungeon},
};

declare_id!("EXpvktpk2rhQQe38yaq1DaRhTwRUofKzZtE1gZ4Z2JAt");

#[program]
pub mod dungeon_nft {
    use super::*;
    use instructions::{
        config::{InitializeConfig, UpdateConfig},
        mint::{CallbackMintDungeon, MintDungeon},
    };

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        collection_name: String,
        symbol: String,
        base_uri: String,
        grid_width: u16,
        grid_height: u16,
    ) -> Result<()> {
        instructions::config::initialize_config(
            ctx,
            collection_name,
            symbol,
            base_uri,
            grid_width,
            grid_height,
        )
    }

    pub fn update_config_metadata(
        ctx: Context<UpdateConfig>,
        collection_name: String,
        symbol: String,
        base_uri: String,
    ) -> Result<()> {
        instructions::config::update_config_metadata(ctx, collection_name, symbol, base_uri)
    }

    pub fn update_config_grid(
        ctx: Context<UpdateConfig>,
        grid_width: u16,
        grid_height: u16,
    ) -> Result<()> {
        instructions::config::update_config_grid(ctx, grid_width, grid_height)
    }

    pub fn mint_dungeon(ctx: Context<MintDungeon>) -> Result<()> {
        instructions::mint::mint_dungeon(ctx)
    }

    pub fn callback_mint_dungeon(
        ctx: Context<CallbackMintDungeon>,
        randomness: [u8; 32],
    ) -> Result<()> {
        instructions::mint::callback_mint_dungeon(ctx, randomness)
    }
}

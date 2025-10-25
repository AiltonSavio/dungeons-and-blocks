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
    __client_accounts_mint_dungeon_with_seed,
};
pub use instructions::{
    config::{InitializeConfig, UpdateConfig},
    mint::{CallbackMintDungeon, MintDungeon, MintDungeonWithSeed},
};

declare_id!("3qfE22hKoyPcDvtuYEAkCj9kuFHJVdXRkN6Qpp4UZhuw");

#[program]
pub mod dungeon_nft {
    use super::*;
    use instructions::{
        config::{InitializeConfig, UpdateConfig},
        mint::{CallbackMintDungeon, MintDungeon, MintDungeonWithSeed},
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

    pub fn mint_dungeon_with_seed(
        ctx: Context<MintDungeonWithSeed>,
        owner: Pubkey,
        seed: u32,
    ) -> Result<()> {
        instructions::mint::mint_dungeon_with_seed(ctx, owner, seed)
    }
}

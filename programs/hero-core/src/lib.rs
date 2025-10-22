use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod helpers;
pub mod instructions;
pub mod logic;
pub mod state;

pub use errors::HeroError;
pub use instructions::{
    burn::BurnHero,
    initialize::InitializePlayer,
    level_up::{CallbackLevelUpHero, LevelUpHero},
    mint::{CallbackMintHeroFree, CallbackMintHeroPaid, MintHeroFree, MintHeroPaid},
    status::ModifyStatusEffect,
};
pub(crate) use instructions::burn::__client_accounts_burn_hero;
pub(crate) use instructions::initialize::__client_accounts_initialize_player;
pub(crate) use instructions::level_up::{
    __client_accounts_callback_level_up_hero, __client_accounts_level_up_hero,
};
pub(crate) use instructions::mint::{
    __client_accounts_callback_mint_hero_free, __client_accounts_callback_mint_hero_paid,
    __client_accounts_mint_hero_free, __client_accounts_mint_hero_paid,
};
pub(crate) use instructions::status::__client_accounts_modify_status_effect;

declare_id!("27hg9oCnyUUeAQfU8H3zwFfHaq7sX5PEwZHit7yVx1nJ");

#[program]
pub mod hero_core {
    use super::*;
    use instructions::{
        burn::BurnHero,
        initialize::InitializePlayer,
        level_up::{CallbackLevelUpHero, LevelUpHero},
        mint::{CallbackMintHeroFree, CallbackMintHeroPaid, MintHeroFree, MintHeroPaid},
        status::ModifyStatusEffect,
    };

    pub fn initialize_player(ctx: Context<InitializePlayer>) -> Result<()> {
        instructions::initialize::initialize_player(ctx)
    }

    pub fn mint_hero_free(ctx: Context<MintHeroFree>) -> Result<()> {
        instructions::mint::mint_hero_free(ctx)
    }

    pub fn callback_mint_hero_free(
        ctx: Context<CallbackMintHeroFree>,
        randomness: [u8; 32],
    ) -> Result<()> {
        instructions::mint::callback_mint_hero_free(ctx, randomness)
    }

    pub fn mint_hero_paid(ctx: Context<MintHeroPaid>) -> Result<()> {
        instructions::mint::mint_hero_paid(ctx)
    }

    pub fn callback_mint_hero_paid(
        ctx: Context<CallbackMintHeroPaid>,
        randomness: [u8; 32],
    ) -> Result<()> {
        instructions::mint::callback_mint_hero_paid(ctx, randomness)
    }

    pub fn level_up_hero(
        ctx: Context<LevelUpHero>,
        hero_id: u64,
    ) -> Result<()> {
        instructions::level_up::level_up_hero(ctx, hero_id)
    }

    pub fn callback_level_up_hero(
        ctx: Context<CallbackLevelUpHero>,
        randomness: [u8; 32],
    ) -> Result<()> {
        instructions::level_up::callback_level_up_hero(ctx, randomness)
    }

    pub fn apply_status_effect(
        ctx: Context<ModifyStatusEffect>,
        hero_id: u64,
        effect_type: u8,
    ) -> Result<()> {
        instructions::status::apply_status_effect(ctx, hero_id, effect_type)
    }

    pub fn remove_status_effect(
        ctx: Context<ModifyStatusEffect>,
        hero_id: u64,
        effect_type: u8,
    ) -> Result<()> {
        instructions::status::remove_status_effect(ctx, hero_id, effect_type)
    }

    pub fn burn_hero(
        ctx: Context<BurnHero>,
        hero_id: u64,
    ) -> Result<()> {
        instructions::burn::burn_hero(ctx, hero_id)
    }
}

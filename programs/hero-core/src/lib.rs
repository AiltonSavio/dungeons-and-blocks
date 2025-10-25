use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod helpers;
pub mod instructions;
pub mod logic;
pub mod state;

pub use errors::HeroError;
pub(crate) use instructions::adventure::{
    __client_accounts_adventure_write, __client_accounts_lock_ctx, __client_accounts_unlock_ctx,
};
#[cfg(feature = "cpi")]
pub(crate) use instructions::adventure::{
    __cpi_client_accounts_adventure_write, __cpi_client_accounts_lock_ctx,
    __cpi_client_accounts_unlock_ctx,
};
pub(crate) use instructions::burn::__client_accounts_burn_hero;
#[cfg(feature = "cpi")]
pub(crate) use instructions::burn::__cpi_client_accounts_burn_hero;
pub(crate) use instructions::initialize::__client_accounts_initialize_player;
#[cfg(feature = "cpi")]
pub(crate) use instructions::initialize::__cpi_client_accounts_initialize_player;
pub(crate) use instructions::level_up::{
    __client_accounts_callback_level_up_hero, __client_accounts_level_up_hero,
};
#[cfg(feature = "cpi")]
pub(crate) use instructions::level_up::{
    __cpi_client_accounts_callback_level_up_hero, __cpi_client_accounts_level_up_hero,
};
pub(crate) use instructions::mint::{
    __client_accounts_callback_mint_hero_free, __client_accounts_callback_mint_hero_paid,
    __client_accounts_mint_hero_free, __client_accounts_mint_hero_paid,
    __client_accounts_mint_hero_with_seed,
};
#[cfg(feature = "cpi")]
pub(crate) use instructions::mint::{
    __cpi_client_accounts_callback_mint_hero_free, __cpi_client_accounts_callback_mint_hero_paid,
    __cpi_client_accounts_mint_hero_free, __cpi_client_accounts_mint_hero_paid,
    __cpi_client_accounts_mint_hero_with_seed,
};
pub(crate) use instructions::status::__client_accounts_modify_status_effect;
#[cfg(feature = "cpi")]
pub(crate) use instructions::status::__cpi_client_accounts_modify_status_effect;
pub use instructions::{
    adventure::{AdventureWrite, LockCtx, UnlockCtx},
    burn::BurnHero,
    initialize::InitializePlayer,
    level_up::{CallbackLevelUpHero, LevelUpHero},
    mint::MintHeroWithSeed,
    mint::{CallbackMintHeroFree, CallbackMintHeroPaid, MintHeroFree, MintHeroPaid},
    status::ModifyStatusEffect,
};

declare_id!("B4aW9eJbVnTrTTR9SYqVRodYt13TAQEmkhJ2JNMaVM7v");

#[program]
pub mod hero_core {
    use super::*;
    use instructions::{
        adventure::{AdventureWrite, LockCtx, UnlockCtx},
        burn::BurnHero,
        initialize::InitializePlayer,
        level_up::{CallbackLevelUpHero, LevelUpHero},
        mint::{
            CallbackMintHeroFree, CallbackMintHeroPaid, MintHeroFree, MintHeroPaid,
            MintHeroWithSeed,
        },
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

    pub fn level_up_hero(ctx: Context<LevelUpHero>, hero_id: u64) -> Result<()> {
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

    pub fn burn_hero(ctx: Context<BurnHero>, hero_id: u64) -> Result<()> {
        instructions::burn::burn_hero(ctx, hero_id)
    }

    pub fn mint_hero_with_seed(
        ctx: Context<MintHeroWithSeed>,
        owner: Pubkey,
        seed: [u8; 32],
        is_soulbound: bool,
    ) -> Result<()> {
        instructions::mint::mint_hero_with_seed(ctx, owner, seed, is_soulbound)
    }

    pub fn lock_for_adventure(ctx: Context<LockCtx>, adventure_pda: Pubkey) -> Result<()> {
        instructions::adventure::lock_for_adventure(ctx, adventure_pda)
    }

    pub fn unlock_from_adventure(ctx: Context<UnlockCtx>, adventure_pda: Pubkey) -> Result<()> {
        instructions::adventure::unlock_from_adventure(ctx, adventure_pda)
    }

    pub fn update_hp_from_adventure(
        ctx: Context<AdventureWrite>,
        hero_id: u64,
        new_hp: u8,
    ) -> Result<()> {
        instructions::adventure::update_hp_from_adventure(ctx, hero_id, new_hp)
    }

    pub fn update_xp_from_adventure(
        ctx: Context<AdventureWrite>,
        hero_id: u64,
        xp_delta: u64,
    ) -> Result<()> {
        instructions::adventure::update_xp_from_adventure(ctx, hero_id, xp_delta)
    }
}

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod helpers;
pub mod instructions;
pub mod logic;
pub mod state;

use crate::state::AdventureHeroStats;
pub use errors::HeroError;
pub(crate) use instructions::abbey::__client_accounts_abbey_service;
#[cfg(feature = "cpi")]
pub(crate) use instructions::abbey::__cpi_client_accounts_abbey_service;
pub(crate) use instructions::adventure::{
    __client_accounts_adventure_write, __client_accounts_lock_ctx, __client_accounts_unlock_ctx,
};
#[cfg(feature = "cpi")]
pub(crate) use instructions::adventure::{
    __cpi_client_accounts_adventure_write, __cpi_client_accounts_lock_ctx,
    __cpi_client_accounts_unlock_ctx,
};
pub(crate) use instructions::blacksmith::__client_accounts_blacksmith_service;
#[cfg(feature = "cpi")]
pub(crate) use instructions::blacksmith::__cpi_client_accounts_blacksmith_service;
pub(crate) use instructions::burn::__client_accounts_burn_hero;
#[cfg(feature = "cpi")]
pub(crate) use instructions::burn::__cpi_client_accounts_burn_hero;
pub(crate) use instructions::devtools::__client_accounts_hero_dev_tools;
#[cfg(feature = "cpi")]
pub(crate) use instructions::devtools::__cpi_client_accounts_hero_dev_tools;
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
pub(crate) use instructions::sanitarium::__client_accounts_sanitarium_treatment;
#[cfg(feature = "cpi")]
pub(crate) use instructions::sanitarium::__cpi_client_accounts_sanitarium_treatment;
pub(crate) use instructions::status::__client_accounts_modify_status_effect;
#[cfg(feature = "cpi")]
pub(crate) use instructions::status::__cpi_client_accounts_modify_status_effect;
pub(crate) use instructions::tavern::__client_accounts_tavern_service;
#[cfg(feature = "cpi")]
pub(crate) use instructions::tavern::__cpi_client_accounts_tavern_service;
pub use instructions::{
    abbey::AbbeyService,
    adventure::{AdventureWrite, LockCtx, UnlockCtx},
    blacksmith::BlacksmithService,
    burn::BurnHero,
    devtools::HeroDevTools,
    initialize::InitializePlayer,
    level_up::{CallbackLevelUpHero, LevelUpHero},
    mint::MintHeroWithSeed,
    mint::{CallbackMintHeroFree, CallbackMintHeroPaid, MintHeroFree, MintHeroPaid},
    sanitarium::SanitariumTreatment,
    status::ModifyStatusEffect,
    tavern::TavernService,
};

declare_id!("B4aW9eJbVnTrTTR9SYqVRodYt13TAQEmkhJ2JNMaVM7v");

#[program]
pub mod hero_core {
    use super::*;
    use instructions::{
        abbey::AbbeyService,
        adventure::{AdventureWrite, LockCtx, UnlockCtx},
        blacksmith::BlacksmithService,
        burn::BurnHero,
        devtools::HeroDevTools,
        initialize::InitializePlayer,
        level_up::{CallbackLevelUpHero, LevelUpHero},
        mint::{
            CallbackMintHeroFree, CallbackMintHeroPaid, MintHeroFree, MintHeroPaid,
            MintHeroWithSeed,
        },
        sanitarium::SanitariumTreatment,
        status::ModifyStatusEffect,
        tavern::TavernService,
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

    pub fn sync_stats_from_adventure(
        ctx: Context<AdventureWrite>,
        hero_state: AdventureHeroStats,
    ) -> Result<()> {
        instructions::adventure::sync_stats_from_adventure(ctx, hero_state)
    }

    pub fn cure_status_effect(
        ctx: Context<SanitariumTreatment>,
        hero_id: u64,
        effect_type: u8,
    ) -> Result<()> {
        instructions::sanitarium::cure_status_effect(ctx, hero_id, effect_type)
    }

    pub fn cure_negative_trait(
        ctx: Context<SanitariumTreatment>,
        hero_id: u64,
        trait_index: u8,
    ) -> Result<()> {
        instructions::sanitarium::cure_negative_trait(ctx, hero_id, trait_index)
    }

    pub fn reroll_stats(ctx: Context<BlacksmithService>, hero_id: u64) -> Result<()> {
        instructions::blacksmith::reroll_stats(ctx, hero_id)
    }

    pub fn relieve_stress(ctx: Context<AbbeyService>, hero_id: u64) -> Result<()> {
        instructions::abbey::relieve_stress(ctx, hero_id)
    }

    pub fn apply_blessing(ctx: Context<AbbeyService>, hero_id: u64) -> Result<()> {
        instructions::abbey::apply_blessing(ctx, hero_id)
    }

    pub fn heal_hero(ctx: Context<TavernService>, hero_id: u64, amount: u8) -> Result<()> {
        instructions::tavern::heal_hero(ctx, hero_id, amount)
    }

    pub fn damage_hero(ctx: Context<HeroDevTools>, hero_id: u64, amount: u8) -> Result<()> {
        instructions::devtools::damage_hero(ctx, hero_id, amount)
    }

    pub fn grant_negative_trait(
        ctx: Context<HeroDevTools>,
        hero_id: u64,
        trait_id: u8,
    ) -> Result<()> {
        instructions::devtools::grant_negative_trait(ctx, hero_id, trait_id)
    }

    pub fn grant_status_effect(
        ctx: Context<HeroDevTools>,
        hero_id: u64,
        effect_type: u8,
    ) -> Result<()> {
        instructions::devtools::grant_status_effect(ctx, hero_id, effect_type)
    }

    pub fn grant_experience(ctx: Context<HeroDevTools>, hero_id: u64, amount: u64) -> Result<()> {
        instructions::devtools::grant_experience(ctx, hero_id, amount)
    }
}

use anchor_lang::prelude::*;

use crate::constants::{
    HERO_SEED, NEGATIVE_TRAIT_CURE_COST, STATUS_EFFECT_CURE_COST, TRAIT_SLOT_COUNT,
};
use crate::errors::HeroError;
use crate::state::HeroMint;

/// Cure a single status effect for 10 gold
pub fn cure_status_effect(
    ctx: Context<SanitariumTreatment>,
    hero_id: u64,
    effect_type: u8,
) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
    require!(!hero.locked, HeroError::HeroLocked);
    require!(!hero.is_burned, HeroError::HeroBurned);
    require!(hero.status_effects != 0, HeroError::NoStatusEffects);

    // Check if the status effect is actually active
    let mask = 1 << effect_type;
    require!(
        (hero.status_effects & mask) != 0,
        HeroError::InvalidStatusEffect
    );

    // Spend gold via CPI to player-economy program
    let cpi_program = ctx.accounts.player_economy_program.to_account_info();
    let cpi_accounts = player_economy::cpi::accounts::SpendGold {
        owner: ctx.accounts.owner.to_account_info(),
        player_economy: ctx.accounts.player_economy.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    player_economy::cpi::spend_gold(cpi_ctx, STATUS_EFFECT_CURE_COST)?;

    // Remove the status effect
    hero.status_effects &= !mask;

    emit!(crate::state::StatusEffectRemoved {
        player: ctx.accounts.owner.key(),
        hero_id: hero.id,
        effect_type,
    });

    Ok(())
}

/// Cure a single negative trait for 25 gold
pub fn cure_negative_trait(
    ctx: Context<SanitariumTreatment>,
    hero_id: u64,
    trait_index: u8,
) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
    require!(!hero.locked, HeroError::HeroLocked);
    require!(!hero.is_burned, HeroError::HeroBurned);

    // Check if trait_index is valid
    require!(
        (trait_index as usize) < TRAIT_SLOT_COUNT,
        HeroError::InvalidStatusEffect
    );

    // Check if there's actually a negative trait in that slot
    require!(
        hero.negative_traits[trait_index as usize].is_some(),
        HeroError::NoNegativeTraits
    );

    // Spend gold via CPI to player-economy program
    let cpi_program = ctx.accounts.player_economy_program.to_account_info();
    let cpi_accounts = player_economy::cpi::accounts::SpendGold {
        owner: ctx.accounts.owner.to_account_info(),
        player_economy: ctx.accounts.player_economy.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    player_economy::cpi::spend_gold(cpi_ctx, NEGATIVE_TRAIT_CURE_COST)?;

    // Remove the negative trait
    hero.negative_traits[trait_index as usize] = None;

    Ok(())
}

#[derive(Accounts)]
#[instruction(hero_id: u64)]
pub struct SanitariumTreatment<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [HERO_SEED, owner.key().as_ref(), &hero_id.to_le_bytes()],
        bump = hero_mint.bump,
        constraint = hero_mint.owner == owner.key() @ HeroError::UnauthorizedOwner
    )]
    pub hero_mint: Account<'info, HeroMint>,
    /// CHECK: player_economy PDA verified by player-economy program
    #[account(mut)]
    pub player_economy: AccountInfo<'info>,
    pub player_economy_program: Program<'info, player_economy::program::PlayerEconomy>,
    pub system_program: Program<'info, System>,
}

use anchor_lang::prelude::*;

use crate::constants::{HERO_SEED, STATUS_EFFECTS_COUNT};
use crate::errors::HeroError;
use crate::state::HeroMint;

pub fn apply_status_effect(
    ctx: Context<ModifyStatusEffect>,
    hero_id: u64,
    effect_type: u8,
) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
    require!(!hero.is_burned, HeroError::HeroBurned);
    require!(
        effect_type < STATUS_EFFECTS_COUNT,
        HeroError::InvalidStatusEffect
    );

    hero.status_effects |= 1 << effect_type;

    emit!(crate::state::StatusEffectApplied {
        player: ctx.accounts.payer.key(),
        hero_id: hero.id,
        effect_type,
    });

    Ok(())
}

pub fn remove_status_effect(
    ctx: Context<ModifyStatusEffect>,
    hero_id: u64,
    effect_type: u8,
) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
    require!(!hero.is_burned, HeroError::HeroBurned);
    require!(
        effect_type < STATUS_EFFECTS_COUNT,
        HeroError::InvalidStatusEffect
    );

    hero.status_effects &= !(1 << effect_type);

    emit!(crate::state::StatusEffectRemoved {
        player: ctx.accounts.payer.key(),
        hero_id: hero.id,
        effect_type,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(hero_id: u64)]
pub struct ModifyStatusEffect<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [HERO_SEED, payer.key().as_ref(), &hero_id.to_le_bytes()],
        bump = hero_mint.bump,
        constraint = hero_mint.owner == payer.key() @ HeroError::UnauthorizedOwner
    )]
    pub hero_mint: Account<'info, HeroMint>,
}

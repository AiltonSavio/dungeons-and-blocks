// NOTE: This module is for local testing and development only.
// These instructions will be removed before the official production launch.
// They provide convenient ways to manipulate hero state for testing purposes
// but should not be exposed in a production environment.

use anchor_lang::prelude::*;

use crate::constants::{HERO_SEED, NEGATIVE_TRAIT_COUNT, STATUS_EFFECTS_COUNT};
use crate::errors::HeroError;
use crate::state::HeroMint;

pub fn damage_hero(ctx: Context<HeroDevTools>, hero_id: u64, amount: u8) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
    require!(!hero.is_burned, HeroError::HeroBurned);

    let new_hp = hero.current_hp.saturating_sub(amount);
    hero.current_hp = new_hp;

    emit!(HeroDamaged {
        player: ctx.accounts.owner.key(),
        hero_id,
        amount,
        remaining_hp: hero.current_hp,
    });

    Ok(())
}

pub fn grant_negative_trait(ctx: Context<HeroDevTools>, hero_id: u64, trait_id: u8) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
    require!(!hero.is_burned, HeroError::HeroBurned);
    require!(
        (trait_id as usize) < NEGATIVE_TRAIT_COUNT as usize,
        HeroError::InvalidNegativeTrait
    );

    let mut inserted = false;
    for slot in hero.negative_traits.iter_mut() {
        if slot.is_none() {
            *slot = Some(trait_id);
            inserted = true;
            break;
        }
    }

    require!(inserted, HeroError::NegativeTraitSlotsFull);

    emit!(NegativeTraitGranted {
        player: ctx.accounts.owner.key(),
        hero_id,
        trait_id,
    });

    Ok(())
}

pub fn grant_status_effect(
    ctx: Context<HeroDevTools>,
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

    emit!(StatusEffectGranted {
        player: ctx.accounts.owner.key(),
        hero_id,
        effect_type,
    });

    Ok(())
}

pub fn grant_experience(ctx: Context<HeroDevTools>, hero_id: u64, amount: u64) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
    require!(!hero.is_burned, HeroError::HeroBurned);

    hero.experience = hero
        .experience
        .checked_add(amount)
        .ok_or(HeroError::MathOverflow)?;

    emit!(ExperienceGranted {
        player: ctx.accounts.owner.key(),
        hero_id,
        amount,
        total_experience: hero.experience,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(hero_id: u64)]
pub struct HeroDevTools<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [HERO_SEED, owner.key().as_ref(), &hero_id.to_le_bytes()],
        bump = hero_mint.bump,
        constraint = hero_mint.owner == owner.key() @ HeroError::UnauthorizedOwner
    )]
    pub hero_mint: Account<'info, HeroMint>,
}

#[event]
pub struct HeroDamaged {
    pub player: Pubkey,
    pub hero_id: u64,
    pub amount: u8,
    pub remaining_hp: u8,
}

#[event]
pub struct NegativeTraitGranted {
    pub player: Pubkey,
    pub hero_id: u64,
    pub trait_id: u8,
}

#[event]
pub struct StatusEffectGranted {
    pub player: Pubkey,
    pub hero_id: u64,
    pub effect_type: u8,
}

#[event]
pub struct ExperienceGranted {
    pub player: Pubkey,
    pub hero_id: u64,
    pub amount: u64,
    pub total_experience: u64,
}

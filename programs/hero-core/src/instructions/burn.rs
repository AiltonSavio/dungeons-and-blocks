use anchor_lang::prelude::*;

use crate::constants::{HERO_SEED, PLAYER_PROFILE_SEED};
use crate::errors::HeroError;
use crate::logic::unregister_soulbound;
use crate::state::{HeroBurned, HeroMint, PlayerProfile};

pub fn burn_hero(ctx: Context<BurnHero>, hero_id: u64) -> Result<()> {
    let profile = &mut ctx.accounts.player_profile;
    let hero = &mut ctx.accounts.hero_mint;

    require_keys_eq!(
        profile.owner,
        ctx.accounts.payer.key(),
        HeroError::UnauthorizedOwner
    );
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);

    require!(!hero.locked, HeroError::HeroLocked);
    require!(!hero.is_burned, HeroError::HeroBurned);
    require!(
        hero.owner == ctx.accounts.payer.key(),
        HeroError::UnauthorizedOwner
    );

    hero.is_burned = true;
    hero.status_effects = 0;

    if profile.hero_count > 0 {
        profile.hero_count -= 1;
    }

    if hero.is_soulbound {
        unregister_soulbound(&mut *profile, hero.id);
    }

    emit!(HeroBurned {
        player: ctx.accounts.payer.key(),
        hero_id: hero.id,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(hero_id: u64)]
pub struct BurnHero<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_PROFILE_SEED, payer.key().as_ref()],
        bump = player_profile.bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    #[account(
        mut,
        seeds = [HERO_SEED, payer.key().as_ref(), &hero_id.to_le_bytes()],
        bump = hero_mint.bump,
        constraint = hero_mint.owner == payer.key() @ HeroError::UnauthorizedOwner
    )]
    pub hero_mint: Account<'info, HeroMint>,
}

use anchor_lang::prelude::*;

use crate::constants::{adventure_engine_program_id, HERO_SEED};
use crate::errors::HeroError;
use crate::state::{HeroLockedEvent, HeroMint, HeroUnlockedEvent};

pub fn lock_for_adventure(ctx: Context<LockCtx>, adventure_pda: Pubkey) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;

    require!(!hero.is_burned, HeroError::HeroBurned);
    require!(!hero.locked, HeroError::AlreadyLocked);
    require_keys_eq!(
        hero.owner,
        ctx.accounts.player.key(),
        HeroError::UnauthorizedOwner
    );
    require_keys_eq!(
        ctx.accounts.adventure_signer.key(),
        adventure_pda,
        HeroError::WrongAdventure
    );

    hero.locked = true;
    hero.locked_adventure = adventure_pda;
    hero.locked_program = adventure_engine_program_id();
    hero.locked_since = Clock::get()?.unix_timestamp;

    emit!(HeroLockedEvent {
        player: ctx.accounts.player.key(),
        hero_id: hero.id,
        adventure: adventure_pda,
    });

    Ok(())
}

pub fn unlock_from_adventure(ctx: Context<UnlockCtx>, adventure_pda: Pubkey) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;

    require!(hero.locked, HeroError::NotLocked);
    require_keys_eq!(
        hero.locked_adventure,
        ctx.accounts.adventure_signer.key(),
        HeroError::WrongAdventure
    );
    require_keys_eq!(
        hero.locked_program,
        adventure_engine_program_id(),
        HeroError::WrongProgram
    );
    require_keys_eq!(
        hero.locked_adventure,
        adventure_pda,
        HeroError::WrongAdventure
    );

    hero.locked = false;
    hero.locked_adventure = Pubkey::default();
    hero.locked_program = Pubkey::default();
    hero.locked_since = 0;

    emit!(HeroUnlockedEvent {
        player: ctx.accounts.player.key(),
        hero_id: hero.id,
        adventure: ctx.accounts.adventure_signer.key(),
    });

    Ok(())
}

pub fn update_hp_from_adventure(
    ctx: Context<AdventureWrite>,
    hero_id: u64,
    new_hp: u8,
) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;

    require!(hero.locked, HeroError::NotLocked);
    require_keys_eq!(
        hero.locked_adventure,
        ctx.accounts.adventure_signer.key(),
        HeroError::WrongAdventure
    );
    require_keys_eq!(
        hero.locked_program,
        adventure_engine_program_id(),
        HeroError::WrongProgram
    );
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);

    hero.current_hp = new_hp.min(hero.max_hp);

    Ok(())
}

pub fn update_xp_from_adventure(
    ctx: Context<AdventureWrite>,
    hero_id: u64,
    xp_delta: u64,
) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;

    require!(hero.locked, HeroError::NotLocked);
    require_keys_eq!(
        hero.locked_adventure,
        ctx.accounts.adventure_signer.key(),
        HeroError::WrongAdventure
    );
    require_keys_eq!(
        hero.locked_program,
        adventure_engine_program_id(),
        HeroError::WrongProgram
    );
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);

    hero.experience = hero
        .experience
        .checked_add(xp_delta)
        .ok_or(HeroError::MathOverflow)?;

    Ok(())
}

#[derive(Accounts)]
pub struct LockCtx<'info> {
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [HERO_SEED, hero_mint.owner.as_ref(), &hero_mint.id.to_le_bytes()],
        bump = hero_mint.bump,
        constraint = hero_mint.owner == player.key() @ HeroError::UnauthorizedOwner
    )]
    pub hero_mint: Account<'info, HeroMint>,
    /// CHECK: Verified as a PDA by adventure_engine during CPI invocation.
    pub adventure_signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct UnlockCtx<'info> {
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [HERO_SEED, hero_mint.owner.as_ref(), &hero_mint.id.to_le_bytes()],
        bump = hero_mint.bump,
        constraint = hero_mint.owner == player.key() @ HeroError::UnauthorizedOwner
    )]
    pub hero_mint: Account<'info, HeroMint>,
    /// CHECK: Verified as a PDA by adventure_engine during CPI invocation.
    pub adventure_signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdventureWrite<'info> {
    /// CHECK: Verified as a PDA by adventure_engine during CPI invocation.
    pub adventure_signer: Signer<'info>,
    #[account(
        mut,
        seeds = [HERO_SEED, hero_mint.owner.as_ref(), &hero_mint.id.to_le_bytes()],
        bump = hero_mint.bump
    )]
    pub hero_mint: Account<'info, HeroMint>,
}

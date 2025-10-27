use anchor_lang::prelude::*;

use crate::constants::{
    adventure_engine_program_id, HERO_SEED, MAX_STAT_VALUE, MAX_STRESS_MAX, MIN_STRESS_MAX,
    STATUS_EFFECTS_COUNT,
};
use crate::errors::HeroError;
use crate::state::{
    decode_trait_slots, AdventureHeroStats, HeroLockedEvent, HeroMint, HeroUnlockedEvent,
};

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

pub fn sync_stats_from_adventure(
    ctx: Context<AdventureWrite>,
    hero_state: AdventureHeroStats,
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
    require_eq!(hero.id, hero_state.hero_id, HeroError::HeroMismatch);
    require_eq!(
        hero.hero_type,
        hero_state.hero_type,
        HeroError::HeroMismatch
    );

    hero.level = hero_state.level;
    hero.experience = hero_state.experience;
    hero.max_hp = hero_state.max_hp.min(MAX_STAT_VALUE);
    hero.current_hp = hero_state.current_hp.min(hero.max_hp);
    hero.attack = hero_state.attack.min(MAX_STAT_VALUE);
    hero.defense = hero_state.defense.min(MAX_STAT_VALUE);
    hero.magic = hero_state.magic.min(MAX_STAT_VALUE);
    hero.resistance = hero_state.resistance.min(MAX_STAT_VALUE);
    hero.speed = hero_state.speed.min(MAX_STAT_VALUE);
    hero.luck = hero_state.luck.min(MAX_STAT_VALUE);

    let status_mask = if STATUS_EFFECTS_COUNT >= 8 {
        u8::MAX
    } else {
        (1u8 << STATUS_EFFECTS_COUNT) - 1
    };
    hero.status_effects = hero_state.status_effects & status_mask;

    let stress_cap = hero_state
        .stress_max
        .max(MIN_STRESS_MAX)
        .min(MAX_STRESS_MAX);
    hero.stress_max = stress_cap;
    hero.stress = hero_state.stress.min(stress_cap);

    hero.positive_traits = decode_trait_slots(&hero_state.positive_traits);
    hero.negative_traits = decode_trait_slots(&hero_state.negative_traits);

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

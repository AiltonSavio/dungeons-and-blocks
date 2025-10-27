use anchor_lang::prelude::*;

use crate::constants::{HERO_SEED, STRESS_RELIEF_COST};
use crate::errors::HeroError;
use crate::state::HeroMint;

/// Remove a hero's accumulated stress.
pub fn relieve_stress(ctx: Context<AbbeyService>, hero_id: u64) -> Result<()> {
    {
        let hero = &ctx.accounts.hero_mint;
        require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
        require!(!hero.locked, HeroError::HeroLocked);
        require!(!hero.is_burned, HeroError::HeroBurned);
        require!(hero.stress > 0, HeroError::NoStressToRelieve);
    }

    pay_abbey_tithe(&ctx)?;

    let hero = &mut ctx.accounts.hero_mint;
    hero.stress = 0;

    emit!(StressRelieved {
        player: ctx.accounts.owner.key(),
        hero_id: hero.id,
    });

    Ok(())
}

/// Apply a blessing to the hero, granting them stress resistance for the next run.
pub fn apply_blessing(ctx: Context<AbbeyService>, hero_id: u64) -> Result<()> {
    {
        let hero = &ctx.accounts.hero_mint;
        require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
        require!(!hero.locked, HeroError::HeroLocked);
        require!(!hero.is_burned, HeroError::HeroBurned);
        require!(!hero.blessed, HeroError::AlreadyBlessed);
    }

    pay_abbey_tithe(&ctx)?;

    let hero = &mut ctx.accounts.hero_mint;
    hero.blessed = true;

    emit!(HeroBlessed {
        player: ctx.accounts.owner.key(),
        hero_id: hero.id,
    });

    Ok(())
}

fn pay_abbey_tithe(ctx: &Context<AbbeyService>) -> Result<()> {
    let cpi_program = ctx.accounts.player_economy_program.to_account_info();
    let cpi_accounts = player_economy::cpi::accounts::SpendGold {
        owner: ctx.accounts.owner.to_account_info(),
        player_economy: ctx.accounts.player_economy.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    player_economy::cpi::spend_gold(cpi_ctx, STRESS_RELIEF_COST)
}

#[derive(Accounts)]
#[instruction(hero_id: u64)]
pub struct AbbeyService<'info> {
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

#[event]
pub struct StressRelieved {
    pub player: Pubkey,
    pub hero_id: u64,
}

#[event]
pub struct HeroBlessed {
    pub player: Pubkey,
    pub hero_id: u64,
}

use anchor_lang::prelude::*;

use crate::constants::{HERO_SEED, TAVERN_HEAL_COST_PER_HP};
use crate::errors::HeroError;
use crate::state::{HeroHealed, HeroMint};

pub fn heal_hero(ctx: Context<TavernService>, hero_id: u64, amount: u8) -> Result<()> {
    require!(amount > 0, HeroError::InvalidHealAmount);

    {
        let hero = &ctx.accounts.hero_mint;
        require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
        require!(!hero.locked, HeroError::HeroLocked);
        require!(!hero.is_burned, HeroError::HeroBurned);
        require!(hero.current_hp < hero.max_hp, HeroError::HeroAtMaxHp);
    }

    let cost = (amount as u64)
        .checked_mul(TAVERN_HEAL_COST_PER_HP)
        .ok_or(HeroError::MathOverflow)?;

    let missing = ctx
        .accounts
        .hero_mint
        .max_hp
        .saturating_sub(ctx.accounts.hero_mint.current_hp);
    require!(
        (amount as u16) <= (missing as u16),
        HeroError::HealAmountTooLarge
    );

    pay_tavern_bill(&ctx, cost)?;

    let hero = &mut ctx.accounts.hero_mint;
    hero.current_hp = hero.current_hp.saturating_add(amount).min(hero.max_hp);

    emit!(HeroHealed {
        player: ctx.accounts.owner.key(),
        hero_id,
        amount,
        gold_spent: cost,
        resulting_hp: hero.current_hp,
    });

    Ok(())
}

fn pay_tavern_bill(ctx: &Context<TavernService>, cost: u64) -> Result<()> {
    let cpi_program = ctx.accounts.player_economy_program.to_account_info();
    let cpi_accounts = player_economy::cpi::accounts::SpendGold {
        owner: ctx.accounts.owner.to_account_info(),
        player_economy: ctx.accounts.player_economy.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    player_economy::cpi::spend_gold(cpi_ctx, cost)
}

#[derive(Accounts)]
#[instruction(hero_id: u64)]
pub struct TavernService<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [HERO_SEED, owner.key().as_ref(), &hero_id.to_le_bytes()],
        bump = hero_mint.bump,
        constraint = hero_mint.owner == owner.key() @ HeroError::UnauthorizedOwner
    )]
    pub hero_mint: Account<'info, HeroMint>,
    /// CHECK: PDA validated by player-economy program
    #[account(mut)]
    pub player_economy: AccountInfo<'info>,
    pub player_economy_program: Program<'info, player_economy::program::PlayerEconomy>,
    pub system_program: Program<'info, System>,
}

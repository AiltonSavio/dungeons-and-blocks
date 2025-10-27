use anchor_lang::prelude::*;

use crate::constants::{HERO_SEED, MAX_REROLLS, STAT_REROLL_COST};
use crate::errors::HeroError;
use crate::logic::roll_stats_for_level;
use crate::state::HeroMint;

/// Reroll hero stats for 30 gold (max 3 times per hero)
/// This keeps the hero's level and power budget, but redistributes stats
pub fn reroll_stats(ctx: Context<BlacksmithService>, hero_id: u64) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;
    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
    require!(!hero.locked, HeroError::HeroLocked);
    require!(!hero.is_burned, HeroError::HeroBurned);

    // Check reroll limit
    require!(
        hero.reroll_count < MAX_REROLLS,
        HeroError::MaxRerollsReached
    );

    // Spend gold via CPI to player-economy program
    let cpi_program = ctx.accounts.player_economy_program.to_account_info();
    let cpi_accounts = player_economy::cpi::accounts::SpendGold {
        owner: ctx.accounts.owner.to_account_info(),
        player_economy: ctx.accounts.player_economy.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    player_economy::cpi::spend_gold(cpi_ctx, STAT_REROLL_COST)?;

    // Generate new stats keeping the same level power budget
    // We'll use a deterministic seed based on hero ID, reroll count, and current slot
    let seed_data = [
        &hero.id.to_le_bytes()[..],
        &hero.reroll_count.to_le_bytes()[..],
        &Clock::get()?.slot.to_le_bytes()[..],
    ];
    let seed_hash = anchor_lang::solana_program::keccak::hashv(&seed_data);

    let new_stats = roll_stats_for_level(hero.level, seed_hash.0)?;

    // Update stats
    hero.max_hp = new_stats.max_hp.max(1);
    hero.current_hp = hero.max_hp;
    hero.attack = new_stats.attack;
    hero.defense = new_stats.defense;
    hero.magic = new_stats.magic;
    hero.resistance = new_stats.resistance;
    hero.speed = new_stats.speed;
    hero.luck = new_stats.luck;

    // Increment reroll counter
    hero.reroll_count = hero.reroll_count.saturating_add(1);

    emit!(StatsRerolled {
        player: ctx.accounts.owner.key(),
        hero_id: hero.id,
        reroll_count: hero.reroll_count,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(hero_id: u64)]
pub struct BlacksmithService<'info> {
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
pub struct StatsRerolled {
    pub player: Pubkey,
    pub hero_id: u64,
    pub reroll_count: u8,
}

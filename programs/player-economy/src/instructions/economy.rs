use anchor_lang::prelude::*;

use crate::{
    constants::*, errors::PlayerEconomyError, state::*,
};

#[derive(Accounts)]
pub struct InitializePlayerEconomy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = PlayerEconomy::LEN,
        seeds = [PLAYER_ECONOMY_SEED, owner.key().as_ref()],
        bump
    )]
    pub player_economy: Account<'info, PlayerEconomy>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SpendGold<'info> {
    /// Signer whose vault gold will be debited.
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_ECONOMY_SEED, owner.key().as_ref()],
        bump = player_economy.bump
    )]
    pub player_economy: Account<'info, PlayerEconomy>,
}

#[derive(Accounts)]
pub struct GrantHourlyGold<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_ECONOMY_SEED, owner.key().as_ref()],
        bump = player_economy.bump
    )]
    pub player_economy: Account<'info, PlayerEconomy>,
}

pub fn initialize_player_economy(ctx: Context<InitializePlayerEconomy>) -> Result<()> {
    let account = &mut ctx.accounts.player_economy;
    let owner = ctx.accounts.owner.key();

    require!(
        account.owner == Pubkey::default(),
        PlayerEconomyError::AlreadyInitialized
    );

    account.owner = owner;
    account.bump = ctx.bumps.player_economy;
    account.gold = 0;
    account.last_grant_ts = 0;
    account.items = [0; ITEM_COUNT];
    account.reserved = [0; 5];

    emit!(PlayerEconomyInitialized { owner });

    Ok(())
}

pub fn spend_gold(ctx: Context<SpendGold>, amount: u64) -> Result<()> {
    require!(amount > 0, PlayerEconomyError::InvalidSpendAmount);
    let account = &mut ctx.accounts.player_economy;
    let owner = ctx.accounts.owner.key();

    require_keys_eq!(account.owner, owner, PlayerEconomyError::Unauthorized);
    require!(account.gold >= amount, PlayerEconomyError::InsufficientGold);

    account.gold -= amount;

    emit!(GoldSpent {
        owner,
        amount,
        remaining: account.gold,
    });

    Ok(())
}

pub fn grant_hourly_gold(ctx: Context<GrantHourlyGold>) -> Result<()> {
    let account = &mut ctx.accounts.player_economy;
    let owner = ctx.accounts.owner.key();
    let now = Clock::get()?.unix_timestamp;

    require_keys_eq!(account.owner, owner, PlayerEconomyError::Unauthorized);

    if account.last_grant_ts != 0 {
        let elapsed = now
            .checked_sub(account.last_grant_ts)
            .ok_or(PlayerEconomyError::MathOverflow)?;
        require!(
            elapsed >= HOURLY_GRANT_COOLDOWN,
            PlayerEconomyError::GrantOnCooldown
        );
    }

    account.gold = account
        .gold
        .checked_add(HOURLY_GRANT_AMOUNT)
        .ok_or(PlayerEconomyError::MathOverflow)?;
    account.last_grant_ts = now;

    emit!(HourlyGrantClaimed {
        owner,
        amount: HOURLY_GRANT_AMOUNT,
        next_available_at: now + HOURLY_GRANT_COOLDOWN,
    });

    Ok(())
}

use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::consts::{DEFAULT_QUEUE, VRF_PROGRAM_IDENTITY};
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};

use crate::constants::{HERO_SEED, LEVEL_UP_GOLD_COST, MAX_LEVEL};
use crate::errors::HeroError;
use crate::helpers::{derive_caller_seed, meta};
use crate::logic::{apply_level_up, validate_level_up_requirements};
use crate::state::{HeroLeveledUp, HeroMint, PendingRequestType, RandomnessRequested, RequestType};

pub fn level_up_hero(ctx: Context<LevelUpHero>, hero_id: u64) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;
    let payer_key = ctx.accounts.payer.key();

    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
    require!(!hero.locked, HeroError::HeroLocked);
    require!(!hero.is_burned, HeroError::HeroBurned);

    let _target_level = validate_level_up_requirements(&*hero)?;

    require!(
        hero.pending_request == PendingRequestType::None as u8,
        HeroError::HeroBusy
    );

    // Spend gold via CPI to player-economy program
    let cpi_program = ctx.accounts.player_economy_program.to_account_info();
    let cpi_accounts = player_economy::cpi::accounts::SpendGold {
        owner: ctx.accounts.payer.to_account_info(),
        player_economy: ctx.accounts.player_economy.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    player_economy::cpi::spend_gold(cpi_ctx, LEVEL_UP_GOLD_COST)?;

    hero.pending_request = PendingRequestType::LevelUp as u8;

    let caller_seed = derive_caller_seed(&payer_key, hero_id)?;
    let ix = create_request_randomness_ix(RequestRandomnessParams {
        payer: ctx.accounts.payer.key(),
        oracle_queue: ctx.accounts.oracle_queue.key(),
        callback_program_id: crate::ID,
        callback_discriminator: crate::instruction::CallbackLevelUpHero::DISCRIMINATOR.to_vec(),
        accounts_metas: Some(vec![
            meta(&ctx.accounts.hero_mint.to_account_info(), true, false),
            meta(&ctx.accounts.payer.to_account_info(), false, false),
        ]),
        caller_seed,
        callback_args: Some(hero_id.to_le_bytes().to_vec()),
    });

    ctx.accounts
        .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;

    emit!(RandomnessRequested {
        player: payer_key,
        request_type: RequestType::LevelUp.as_str().to_string(),
    });

    Ok(())
}

pub fn callback_level_up_hero(
    ctx: Context<CallbackLevelUpHero>,
    randomness: [u8; 32],
) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;

    require_keys_eq!(
        ctx.accounts.payer.key(),
        hero.owner,
        HeroError::UnauthorizedOwner
    );

    require!(!hero.locked, HeroError::HeroLocked);
    require!(
        hero.pending_request == PendingRequestType::LevelUp as u8,
        HeroError::UnexpectedCallback
    );
    require!(!hero.is_burned, HeroError::HeroBurned);

    let new_level = hero.level.checked_add(1).ok_or(HeroError::MathOverflow)?;
    require!(new_level <= MAX_LEVEL, HeroError::MaxLevelReached);
    hero.level = new_level;
    apply_level_up(&mut *hero, randomness)?;

    hero.last_level_up = Clock::get()?.unix_timestamp;
    hero.pending_request = PendingRequestType::None as u8;

    emit!(HeroLeveledUp {
        player: hero.owner,
        hero_id: hero.id,
        new_level: hero.level,
    });

    Ok(())
}

#[vrf]
#[derive(Accounts)]
#[instruction(hero_id: u64)]
pub struct LevelUpHero<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [HERO_SEED, payer.key().as_ref(), &hero_id.to_le_bytes()],
        bump = hero_mint.bump,
        constraint = hero_mint.owner == payer.key() @ HeroError::UnauthorizedOwner
    )]
    pub hero_mint: Account<'info, HeroMint>,
    /// CHECK: player_economy PDA verified by player-economy program
    #[account(mut)]
    pub player_economy: AccountInfo<'info>,
    pub player_economy_program: Program<'info, player_economy::program::PlayerEconomy>,
    /// CHECK: VRF oracle queue; queue authority enforced off-chain and via VRF program.
    #[account(mut, address = DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CallbackLevelUpHero<'info> {
    #[account(address = VRF_PROGRAM_IDENTITY)]
    pub program_identity: Signer<'info>,
    #[account(
        mut,
        seeds = [HERO_SEED, hero_mint.owner.as_ref(), &hero_mint.id.to_le_bytes()],
        bump = hero_mint.bump
    )]
    pub hero_mint: Account<'info, HeroMint>,
    /// CHECK: Provided for logs
    pub payer: AccountInfo<'info>,
}

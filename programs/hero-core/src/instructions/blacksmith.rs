use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::consts::{DEFAULT_QUEUE, VRF_PROGRAM_IDENTITY};
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};

use crate::constants::{HERO_SEED, MAX_REROLLS, STAT_REROLL_COST};
use crate::errors::HeroError;
use crate::helpers::{derive_caller_seed, meta};
use crate::logic::roll_stats_for_level;
use crate::state::{HeroMint, PendingRequestType, RandomnessRequested, RequestType};

/// Reroll hero stats for 30 gold (max 3 times per hero)
/// This keeps the hero's level and power budget, but redistributes stats
pub fn reroll_stats(ctx: Context<BlacksmithService>, hero_id: u64) -> Result<()> {
    let hero = &mut ctx.accounts.hero_mint;
    let payer_key = ctx.accounts.payer.key();

    require_eq!(hero.id, hero_id, HeroError::HeroMismatch);
    require!(!hero.locked, HeroError::HeroLocked);
    require!(!hero.is_burned, HeroError::HeroBurned);

    // Check reroll limit
    require!(
        hero.reroll_count < MAX_REROLLS,
        HeroError::MaxRerollsReached
    );

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
    player_economy::cpi::spend_gold(cpi_ctx, STAT_REROLL_COST)?;

    hero.pending_request = PendingRequestType::StatsReroll as u8;

    let caller_seed = derive_caller_seed(&payer_key, hero_id)?;
    let ix = create_request_randomness_ix(RequestRandomnessParams {
        payer: ctx.accounts.payer.key(),
        oracle_queue: ctx.accounts.oracle_queue.key(),
        callback_program_id: crate::ID,
        callback_discriminator: crate::instruction::CallbackRerollStats::DISCRIMINATOR.to_vec(),
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
        request_type: RequestType::StatsReroll.as_str().to_string(),
    });

    Ok(())
}

pub fn callback_reroll_stats(
    ctx: Context<CallbackRerollStats>,
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
        hero.pending_request == PendingRequestType::StatsReroll as u8,
        HeroError::UnexpectedCallback
    );
    require!(!hero.is_burned, HeroError::HeroBurned);

    // Generate new stats keeping the same level power budget
    let new_stats = roll_stats_for_level(hero.level, randomness)?;

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
    hero.pending_request = PendingRequestType::None as u8;

    emit!(StatsRerolled {
        player: hero.owner,
        hero_id: hero.id,
        reroll_count: hero.reroll_count,
    });

    Ok(())
}

#[vrf]
#[derive(Accounts)]
#[instruction(hero_id: u64)]
pub struct BlacksmithService<'info> {
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
pub struct CallbackRerollStats<'info> {
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

#[event]
pub struct StatsRerolled {
    pub player: Pubkey,
    pub hero_id: u64,
    pub reroll_count: u8,
}

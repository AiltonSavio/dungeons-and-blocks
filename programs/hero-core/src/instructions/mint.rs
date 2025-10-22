use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::consts::{DEFAULT_QUEUE, VRF_PROGRAM_IDENTITY};
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};

use crate::constants::{
    GAME_VAULT_SEED, GOLD_ACCOUNT_SEED, HERO_PRICE, HERO_SEED, MAX_FREE_HEROES,
    MAX_HEROES_PER_PLAYER, PLAYER_PROFILE_SEED,
};
use crate::errors::HeroError;
use crate::helpers::{derive_caller_seed, meta};
use crate::logic::{fill_hero_from_randomness, register_soulbound};
use crate::state::{
    GameVault, GoldAccount, HeroMint, HeroMinted, PendingRequestType, PlayerProfile,
    RandomnessRequested, RequestType,
};

pub fn mint_hero_free(ctx: Context<MintHeroFree>) -> Result<()> {
    let profile = &mut ctx.accounts.player_profile;
    let hero = &mut ctx.accounts.hero_mint;
    let payer_key = ctx.accounts.payer.key();

    require_keys_eq!(profile.owner, payer_key, HeroError::UnauthorizedOwner);

    require!(!profile.free_mints_claimed, HeroError::FreeMintsExhausted);
    require!(
        profile.free_mint_count < MAX_FREE_HEROES,
        HeroError::FreeMintsExhausted
    );
    require!(
        profile.hero_count < MAX_HEROES_PER_PLAYER,
        HeroError::HeroCapacityReached
    );

    let hero_id = profile.next_hero_id;
    hero.owner = payer_key;
    hero.bump = ctx.bumps.hero_mint;
    hero.id = hero_id;
    hero.pending_request = PendingRequestType::FreeMint as u8;
    hero.is_burned = false;
    hero.is_soulbound = true;
    hero.mint_timestamp = Clock::get()?.unix_timestamp;
    hero.last_level_up = hero.mint_timestamp;
    hero.padding = [0; 31];

    profile.next_hero_id = profile
        .next_hero_id
        .checked_add(1)
        .ok_or(HeroError::MathOverflow)?;

    let caller_seed = derive_caller_seed(&payer_key, hero_id)?;
    let ix = create_request_randomness_ix(RequestRandomnessParams {
        payer: ctx.accounts.payer.key(),
        oracle_queue: ctx.accounts.oracle_queue.key(),
        callback_program_id: crate::ID,
        callback_discriminator: crate::instruction::CallbackMintHeroFree::DISCRIMINATOR.to_vec(),
        accounts_metas: Some(vec![
            meta(&ctx.accounts.player_profile.to_account_info(), true, false),
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
        request_type: RequestType::FreeMint.as_str().to_string(),
    });

    Ok(())
}

pub fn callback_mint_hero_free(
    ctx: Context<CallbackMintHeroFree>,
    randomness: [u8; 32],
) -> Result<()> {
    let profile = &mut ctx.accounts.player_profile;
    let hero = &mut ctx.accounts.hero_mint;

    require_keys_eq!(
        ctx.accounts.payer.key(),
        hero.owner,
        HeroError::UnauthorizedOwner
    );
    require_keys_eq!(profile.owner, hero.owner, HeroError::UnauthorizedOwner);

    require!(
        hero.pending_request == PendingRequestType::FreeMint as u8,
        HeroError::UnexpectedCallback
    );
    require!(!hero.is_burned, HeroError::HeroBurned);

    fill_hero_from_randomness(&mut *hero, randomness)?;
    hero.is_soulbound = true;
    hero.pending_request = PendingRequestType::None as u8;

    profile.hero_count = profile
        .hero_count
        .checked_add(1)
        .ok_or(HeroError::MathOverflow)?;
    profile.free_mint_count = profile
        .free_mint_count
        .checked_add(1)
        .ok_or(HeroError::MathOverflow)?;
    profile.free_mints_claimed = profile.free_mint_count >= MAX_FREE_HEROES;
    register_soulbound(&mut *profile, hero.id)?;

    emit!(HeroMinted {
        player: hero.owner,
        hero_id: hero.id,
        hero_type: hero.hero_type,
        level: hero.level,
        is_soulbound: true,
    });

    Ok(())
}

pub fn mint_hero_paid(ctx: Context<MintHeroPaid>) -> Result<()> {
    let profile = &mut ctx.accounts.player_profile;
    let hero = &mut ctx.accounts.hero_mint;
    let gold_account = &mut ctx.accounts.gold_account;
    let vault = &mut ctx.accounts.game_vault;
    let payer_key = ctx.accounts.payer.key();

    require_keys_eq!(profile.owner, payer_key, HeroError::UnauthorizedOwner);

    if gold_account.owner == Pubkey::default() {
        gold_account.owner = payer_key;
        gold_account.bump = ctx.bumps.gold_account;
        gold_account.balance = 0;
        gold_account.reserved = [0; 7];
    }

    if vault.bump == 0 {
        vault.bump = ctx.bumps.game_vault;
        vault.reserved = [0; 7];
    }

    require!(
        profile.hero_count < MAX_HEROES_PER_PLAYER,
        HeroError::HeroCapacityReached
    );
    require!(
        gold_account.balance >= HERO_PRICE,
        HeroError::InsufficientGold
    );

    gold_account.balance = gold_account
        .balance
        .checked_sub(HERO_PRICE)
        .ok_or(HeroError::MathOverflow)?;

    vault.balance = vault
        .balance
        .checked_add(HERO_PRICE)
        .ok_or(HeroError::MathOverflow)?;

    let hero_id = profile.next_hero_id;
    hero.owner = payer_key;
    hero.bump = ctx.bumps.hero_mint;
    hero.id = hero_id;
    hero.pending_request = PendingRequestType::PaidMint as u8;
    hero.is_burned = false;
    hero.is_soulbound = false;
    hero.mint_timestamp = Clock::get()?.unix_timestamp;
    hero.last_level_up = hero.mint_timestamp;
    hero.padding = [0; 31];

    profile.next_hero_id = profile
        .next_hero_id
        .checked_add(1)
        .ok_or(HeroError::MathOverflow)?;

    let caller_seed = derive_caller_seed(&payer_key, hero_id)?;
    let ix = create_request_randomness_ix(RequestRandomnessParams {
        payer: ctx.accounts.payer.key(),
        oracle_queue: ctx.accounts.oracle_queue.key(),
        callback_program_id: crate::ID,
        callback_discriminator: crate::instruction::CallbackMintHeroPaid::DISCRIMINATOR.to_vec(),
        accounts_metas: Some(vec![
            meta(&ctx.accounts.player_profile.to_account_info(), true, false),
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
        request_type: RequestType::PaidMint.as_str().to_string(),
    });

    Ok(())
}

pub fn callback_mint_hero_paid(
    ctx: Context<CallbackMintHeroPaid>,
    randomness: [u8; 32],
) -> Result<()> {
    let profile = &mut ctx.accounts.player_profile;
    let hero = &mut ctx.accounts.hero_mint;

    require_keys_eq!(
        ctx.accounts.payer.key(),
        hero.owner,
        HeroError::UnauthorizedOwner
    );
    require_keys_eq!(profile.owner, hero.owner, HeroError::UnauthorizedOwner);

    require!(
        hero.pending_request == PendingRequestType::PaidMint as u8,
        HeroError::UnexpectedCallback
    );
    require!(!hero.is_burned, HeroError::HeroBurned);

    fill_hero_from_randomness(&mut *hero, randomness)?;
    hero.is_soulbound = false;
    hero.pending_request = PendingRequestType::None as u8;

    profile.hero_count = profile
        .hero_count
        .checked_add(1)
        .ok_or(HeroError::MathOverflow)?;

    emit!(HeroMinted {
        player: hero.owner,
        hero_id: hero.id,
        hero_type: hero.hero_type,
        level: hero.level,
        is_soulbound: false,
    });

    Ok(())
}

#[vrf]
#[derive(Accounts)]
pub struct MintHeroFree<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_PROFILE_SEED, payer.key().as_ref()],
        bump = player_profile.bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    #[account(
        init,
        payer = payer,
        space = HeroMint::LEN,
        seeds = [
            HERO_SEED,
            payer.key().as_ref(),
            &player_profile.next_hero_id.to_le_bytes()
        ],
        bump
    )]
    pub hero_mint: Account<'info, HeroMint>,
    /// CHECK: VRF oracle queue; queue authority enforced off-chain and via VRF program.
    #[account(mut, address = DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CallbackMintHeroFree<'info> {
    #[account(address = VRF_PROGRAM_IDENTITY)]
    pub program_identity: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_PROFILE_SEED, player_profile.owner.as_ref()],
        bump = player_profile.bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    #[account(
        mut,
        seeds = [HERO_SEED, hero_mint.owner.as_ref(), &hero_mint.id.to_le_bytes()],
        bump = hero_mint.bump
    )]
    pub hero_mint: Account<'info, HeroMint>,
    /// CHECK: Provided for logs
    pub payer: AccountInfo<'info>,
}

#[vrf]
#[derive(Accounts)]
pub struct MintHeroPaid<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_PROFILE_SEED, payer.key().as_ref()],
        bump = player_profile.bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    #[account(
        init,
        payer = payer,
        space = HeroMint::LEN,
        seeds = [
            HERO_SEED,
            payer.key().as_ref(),
            &player_profile.next_hero_id.to_le_bytes()
        ],
        bump
    )]
    pub hero_mint: Account<'info, HeroMint>,
    #[account(
        init_if_needed,
        payer = payer,
        space = GoldAccount::LEN,
        seeds = [GOLD_ACCOUNT_SEED, payer.key().as_ref()],
        bump
    )]
    pub gold_account: Account<'info, GoldAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        space = GameVault::LEN,
        seeds = [GAME_VAULT_SEED],
        bump
    )]
    pub game_vault: Account<'info, GameVault>,
    /// CHECK: VRF oracle queue; queue authority enforced off-chain and via VRF program.
    #[account(mut, address = DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CallbackMintHeroPaid<'info> {
    #[account(address = VRF_PROGRAM_IDENTITY)]
    pub program_identity: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_PROFILE_SEED, player_profile.owner.as_ref()],
        bump = player_profile.bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    #[account(
        mut,
        seeds = [HERO_SEED, hero_mint.owner.as_ref(), &hero_mint.id.to_le_bytes()],
        bump = hero_mint.bump
    )]
    pub hero_mint: Account<'info, HeroMint>,
    /// CHECK: Provided for logs
    pub payer: AccountInfo<'info>,
}

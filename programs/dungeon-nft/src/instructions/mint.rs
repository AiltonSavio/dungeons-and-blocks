use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::consts::{DEFAULT_QUEUE, VRF_PROGRAM_IDENTITY};
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};

use crate::constants::{seeded_mint_authority, CONFIG_SEED, DUNGEON_SEED};
use crate::errors::DungeonError;
use crate::helpers::{derive_caller_seed, meta};
use crate::state::{
    DungeonConfig, DungeonMint, DungeonMintRequested, DungeonMintSettled, DungeonStatus,
};

pub fn mint_dungeon(ctx: Context<MintDungeon>) -> Result<()> {
    let payer_key = ctx.accounts.payer.key();
    let now = Clock::get()?.unix_timestamp;

    let (mint_id, grid_width, grid_height, collection_name, collection_symbol, base_uri) = {
        let config = &mut ctx.accounts.config;
        require!(
            config.next_mint_id < config.max_supply,
            DungeonError::MaxSupplyReached
        );
        let mint_id = config.next_mint_id;
        config.next_mint_id = config
            .next_mint_id
            .checked_add(1)
            .ok_or(DungeonError::MathOverflow)?;
        (
            mint_id,
            config.grid_width,
            config.grid_height,
            config.collection_name.clone(),
            config.collection_symbol.clone(),
            config.base_uri.clone(),
        )
    };

    {
        let dungeon = &mut ctx.accounts.dungeon;
        dungeon.owner = payer_key;
        dungeon.bump = ctx.bumps.dungeon;
        dungeon.config = ctx.accounts.config.key();
        dungeon.mint_id = mint_id;
        dungeon.status = DungeonStatus::Pending;
        dungeon.seed = 0;
        dungeon.grid_width = grid_width;
        dungeon.grid_height = grid_height;
        dungeon.created_at = now;
        dungeon.metadata = crate::state::DungeonMetadata {
            name: format!("{} #{}", collection_name, mint_id + 1),
            symbol: collection_symbol,
            uri: format!("{}{}", base_uri, mint_id + 1),
        };
    }

    let caller_seed = derive_caller_seed(&payer_key, mint_id)?;
    let config_info = ctx.accounts.config.to_account_info();
    let dungeon_info = ctx.accounts.dungeon.to_account_info();
    let payer_info = ctx.accounts.payer.to_account_info();
    let ix = create_request_randomness_ix(RequestRandomnessParams {
        payer: payer_key,
        oracle_queue: ctx.accounts.oracle_queue.key(),
        callback_program_id: crate::ID,
        callback_discriminator: crate::instruction::CallbackMintDungeon::DISCRIMINATOR.to_vec(),
        accounts_metas: Some(vec![
            meta(&config_info, true, false),
            meta(&dungeon_info, true, false),
            meta(&payer_info, false, false),
        ]),
        caller_seed,
        callback_args: Some(mint_id.to_le_bytes().to_vec()),
    });

    ctx.accounts.invoke_signed_vrf(&payer_info, &ix)?;

    emit!(DungeonMintRequested {
        payer: payer_key,
        dungeon: ctx.accounts.dungeon.key(),
        mint_id,
    });

    Ok(())
}

pub fn callback_mint_dungeon(
    ctx: Context<CallbackMintDungeon>,
    randomness: [u8; 32],
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let dungeon = &mut ctx.accounts.dungeon;

    require!(
        dungeon.status == DungeonStatus::Pending,
        DungeonError::MintAlreadySettled
    );

    let seed = u32::from_le_bytes(
        randomness[..4]
            .try_into()
            .map_err(|_| DungeonError::InvalidRandomness)?,
    );

    dungeon.seed = seed;
    dungeon.status = DungeonStatus::Ready;

    config.completed_mints = config
        .completed_mints
        .checked_add(1)
        .ok_or(DungeonError::MathOverflow)?;

    emit!(DungeonMintSettled {
        payer: ctx.accounts.payer.key(),
        dungeon: dungeon.key(),
        mint_id: dungeon.mint_id,
    });

    Ok(())
}

pub fn mint_dungeon_with_seed(
    ctx: Context<MintDungeonWithSeed>,
    owner: Pubkey,
    seed: u32,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.authority.key(),
        seeded_mint_authority(),
        DungeonError::UnauthorizedSeedAuthority
    );

    let config = &mut ctx.accounts.config;
    require!(
        config.next_mint_id < config.max_supply,
        DungeonError::MaxSupplyReached
    );

    let mint_id = config.next_mint_id;
    config.next_mint_id = config
        .next_mint_id
        .checked_add(1)
        .ok_or(DungeonError::MathOverflow)?;

    let now = Clock::get()?.unix_timestamp;

    let dungeon = &mut ctx.accounts.dungeon;
    dungeon.owner = owner;
    dungeon.bump = ctx.bumps.dungeon;
    dungeon.config = config.key();
    dungeon.mint_id = mint_id;
    dungeon.status = DungeonStatus::Ready;
    dungeon.seed = seed;
    dungeon.grid_width = config.grid_width;
    dungeon.grid_height = config.grid_height;
    dungeon.created_at = now;
    dungeon.metadata = crate::state::DungeonMetadata {
        name: format!("{} #{}", config.collection_name, mint_id + 1),
        symbol: config.collection_symbol.clone(),
        uri: format!("{}{}", config.base_uri, mint_id + 1),
    };

    config.completed_mints = config
        .completed_mints
        .checked_add(1)
        .ok_or(DungeonError::MathOverflow)?;

    emit!(DungeonMintSettled {
        payer: owner,
        dungeon: dungeon.key(),
        mint_id,
    });

    Ok(())
}

#[vrf]
#[derive(Accounts)]
pub struct MintDungeon<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, DungeonConfig>,
    #[account(
        init,
        payer = payer,
        space = DungeonMint::space(config.grid_width, config.grid_height),
        seeds = [DUNGEON_SEED, config.key().as_ref(), &config.next_mint_id.to_le_bytes()],
        bump
    )]
    pub dungeon: Account<'info, DungeonMint>,
    /// CHECK: VRF oracle queue; queue authority enforced off-chain and via VRF program.
    #[account(mut, address = DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CallbackMintDungeon<'info> {
    #[account(address = VRF_PROGRAM_IDENTITY)]
    pub program_identity: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, DungeonConfig>,
    #[account(
        mut,
        seeds = [DUNGEON_SEED, config.key().as_ref(), &dungeon.mint_id.to_le_bytes()],
        bump = dungeon.bump,
        constraint = dungeon.config == config.key() @ DungeonError::InvalidConfigReference
    )]
    pub dungeon: Account<'info, DungeonMint>,
    /// CHECK: Provided for logging only.
    pub payer: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct MintDungeonWithSeed<'info> {
    #[account(mut, address = seeded_mint_authority())]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, DungeonConfig>,
    #[account(
        init,
        payer = authority,
        space = DungeonMint::space(config.grid_width, config.grid_height),
        seeds = [DUNGEON_SEED, config.key().as_ref(), &config.next_mint_id.to_le_bytes()],
        bump
    )]
    pub dungeon: Account<'info, DungeonMint>,
    pub system_program: Program<'info, System>,
}

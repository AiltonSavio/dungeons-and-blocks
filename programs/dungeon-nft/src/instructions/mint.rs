use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::consts::{DEFAULT_QUEUE, VRF_PROGRAM_IDENTITY};
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};

use crate::constants::{CONFIG_SEED, DUNGEON_SEED};
use crate::errors::DungeonError;
use crate::helpers::{derive_caller_seed, meta};
use crate::logic::{generate_dungeon, GeneratedDungeon};
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
        dungeon.randomness = [0; 32];
        dungeon.metadata = crate::state::DungeonMetadata {
            name: format!("{} #{}", collection_name, mint_id + 1),
            symbol: collection_symbol,
            uri: format!("{}{}", base_uri, mint_id + 1),
        };
        dungeon.grid.clear();
        dungeon.rooms.clear();
        dungeon.edges.clear();
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

    let generated = generate_dungeon(dungeon.grid_width, dungeon.grid_height, seed);

    require!(
        generated.grid.len()
            == (dungeon.grid_width as usize)
                .checked_mul(dungeon.grid_height as usize)
                .ok_or(DungeonError::MathOverflow)?,
        DungeonError::InvalidGridData
    );

    apply_generated_dungeon(dungeon, generated, randomness, seed);

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

fn apply_generated_dungeon(
    dungeon: &mut Account<'_, DungeonMint>,
    generated: GeneratedDungeon,
    randomness: [u8; 32],
    seed: u32,
) {
    dungeon.seed = seed;
    dungeon.randomness = randomness;
    dungeon.grid = generated.grid;
    dungeon.rooms = generated.rooms;
    dungeon.edges = generated.edges;
    dungeon.status = DungeonStatus::Ready;
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

use anchor_lang::prelude::*;
use dungeon_nft::state::DungeonMint;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};

use crate::{constants::ADVENTURE_SEED, errors::AdventureError, state::AdventureSession};

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod logic;
pub mod state;

declare_id!("9qbdCw4BAiyecsGd1oJ1EfnCgYbBMxuYeWr7tpZ3BqAt");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Direction {
    North,
    NorthEast,
    East,
    SouthEast,
    South,
    SouthWest,
    West,
    NorthWest,
}

#[derive(Accounts)]
pub struct StartAdventure<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        constraint = dungeon.owner == player.key() @ AdventureError::AdventureOwnerMismatch
    )]
    pub dungeon: Account<'info, DungeonMint>,
    #[account(
        init_if_needed,
        payer = player,
        space = AdventureSession::space(dungeon.grid_width, dungeon.grid_height),
        seeds = [ADVENTURE_SEED, player.key().as_ref(), dungeon.key().as_ref()],
        bump
    )]
    pub adventure: Account<'info, AdventureSession>,
    pub system_program: Program<'info, System>,
    /// CHECK: hero-core program for CPI calls
    pub hero_program: Program<'info, hero_core::program::HeroCore>,
}

/// Writes the delegate pubkey into the AdventureSession account data.
/// (No delegation happens here.)
#[derive(Accounts)]
pub struct SetDelegate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [ADVENTURE_SEED, adventure.player.as_ref(), adventure.dungeon_mint.as_ref()],
        bump = adventure.bump,
        constraint = adventure.player == payer.key() @ AdventureError::AdventureOwnerMismatch
    )]
    pub adventure: Account<'info, AdventureSession>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateAdventure<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: PDA to delegate (validated by seeds/bump)
    #[account(
        mut,
        del,
        seeds = [ADVENTURE_SEED, owner.key().as_ref(), dungeon_mint.key().as_ref()],
        bump
    )]
    pub pda: AccountInfo<'info>,

    /// CHECK: Only used to derive seeds
    pub owner: UncheckedAccount<'info>,

    /// CHECK: Only used to derive seeds
    pub dungeon_mint: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct MoveHero<'info> {
    /// CHECK: The owner of the adventure session (used for PDA derivation)
    pub owner: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [ADVENTURE_SEED, owner.key().as_ref(), adventure.dungeon_mint.as_ref()],
        bump = adventure.bump,
        constraint = adventure.player == owner.key() @ AdventureError::AdventureOwnerMismatch
    )]
    pub adventure: Account<'info, AdventureSession>,
}

#[commit]
#[derive(Accounts)]
pub struct ExitAdventure<'info> {
    /// CHECK: The owner of the adventure session (used for PDA derivation)
    pub owner: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [ADVENTURE_SEED, owner.key().as_ref(), adventure.dungeon_mint.as_ref()],
        bump = adventure.bump,
        constraint = adventure.player == owner.key() @ AdventureError::AdventureOwnerMismatch
    )]
    pub adventure: Account<'info, AdventureSession>,
    /// CHECK: hero-core program for CPI calls
    pub hero_program: Program<'info, hero_core::program::HeroCore>,
}

#[ephemeral]
#[program]
pub mod adventure_engine {
    use super::*;

    pub fn start_adventure<'info>(
        ctx: Context<'_, '_, '_, 'info, StartAdventure<'info>>,
        hero_mints: Vec<Pubkey>,
    ) -> Result<()> {
        crate::instructions::start::start_adventure(ctx, hero_mints)
    }

    /// Only writes the delegate key into the account data.
    pub fn set_delegate(ctx: Context<SetDelegate>, delegate: Option<Pubkey>) -> Result<()> {
        crate::instructions::delegate::set_delegate(ctx, delegate)
    }

    /// Only performs the delegation to the ephemeral rollup.
    pub fn delegate_adventure(ctx: Context<DelegateAdventure>) -> Result<()> {
        crate::instructions::delegate::delegate_adventure(ctx)
    }

    pub fn move_hero(ctx: Context<MoveHero>, direction: Direction) -> Result<()> {
        crate::instructions::movement::move_hero(ctx, direction)
    }

    pub fn exit_adventure<'info>(
        ctx: Context<'_, '_, '_, 'info, ExitAdventure<'info>>,
    ) -> Result<()> {
        crate::instructions::exit::exit_adventure(ctx)
    }
}

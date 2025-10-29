use anchor_lang::prelude::*;
use dungeon_nft::state::DungeonMint;

use crate::{
    constants::{ADVENTURE_SEED, COMBAT_SEED},
    errors::AdventureError,
    state::{AdventureCombat, AdventureSession},
};

pub mod combat;
pub mod constants;
pub mod errors;
pub mod instructions;
pub mod logic;
pub mod state;

declare_id!("Hnjoe3f7cZuc47RMytSyBrdpxj6x8SoHQBRfqdwKvxVC");

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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct ItemInput {
    pub item_key: u8,
    pub quantity: u16,
}

#[derive(Accounts)]
pub struct StartAdventure<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        constraint = dungeon.status == dungeon_nft::state::DungeonStatus::Ready @ AdventureError::DungeonNotReady
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
    #[account(
        mut,
        seeds = [player_economy::PLAYER_ECONOMY_SEED, player.key().as_ref()],
        bump = player_economy.bump,
        seeds::program = player_economy_program.key()
    )]
    pub player_economy: Account<'info, player_economy::PlayerEconomy>,
    pub system_program: Program<'info, System>,
    /// CHECK: hero-core program for CPI calls
    pub hero_program: Program<'info, hero_core::program::HeroCore>,
    pub player_economy_program: Program<'info, player_economy::program::PlayerEconomy>,
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

// Delegation context retained for future MagicBlock integration.
#[derive(Accounts)]
pub struct DelegateAdventure<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: PDA to delegate (validated by seeds/bump)
    #[account(
        mut,
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
    #[account(
        constraint = adventure.dungeon_mint == dungeon.key() @ AdventureError::InvalidDungeonAccount
    )]
    pub dungeon: Account<'info, DungeonMint>,
    #[account(
        mut,
        seeds = [player_economy::PLAYER_ECONOMY_SEED, owner.key().as_ref()],
        bump = player_economy.bump,
        seeds::program = player_economy_program.key()
    )]
    pub player_economy: Account<'info, player_economy::PlayerEconomy>,
    pub player_economy_program: Program<'info, player_economy::program::PlayerEconomy>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageItems<'info> {
    /// CHECK: The owner of the adventure session (used for PDA derivation)
    pub owner: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [
            ADVENTURE_SEED,
            owner.key().as_ref(),
            adventure.dungeon_mint.as_ref()
        ],
        bump = adventure.bump,
        constraint = adventure.player == owner.key() @ AdventureError::AdventureOwnerMismatch
    )]
    pub adventure: Account<'info, AdventureSession>,
}

#[derive(Accounts)]
pub struct OpenChest<'info> {
    /// CHECK: The owner of the adventure session (used for PDA derivation)
    pub owner: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [
            ADVENTURE_SEED,
            owner.key().as_ref(),
            adventure.dungeon_mint.as_ref()
        ],
        bump = adventure.bump,
        constraint = adventure.player == owner.key() @ AdventureError::AdventureOwnerMismatch
    )]
    pub adventure: Account<'info, AdventureSession>,
}

#[derive(Accounts)]
pub struct BeginEncounter<'info> {
    /// CHECK: Adventure owner; used for PDA derivation
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
    #[account(
        init,
        payer = authority,
        space = AdventureCombat::LEN,
        seeds = [COMBAT_SEED, adventure.key().as_ref()],
        bump
    )]
    pub combat: Account<'info, AdventureCombat>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitCombatAction<'info> {
    /// CHECK: Adventure owner; used for PDA derivation
    pub owner: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [ADVENTURE_SEED, owner.key().as_ref(), adventure.dungeon_mint.as_ref()],
        bump = adventure.bump,
        constraint = adventure.player == owner.key() @ AdventureError::AdventureOwnerMismatch,
        constraint = adventure.in_combat @ AdventureError::CombatNotActive
    )]
    pub adventure: Account<'info, AdventureSession>,
    #[account(
        mut,
        seeds = [COMBAT_SEED, adventure.key().as_ref()],
        bump = combat.bump,
        constraint = combat.active @ AdventureError::CombatNotActive
    )]
    pub combat: Account<'info, AdventureCombat>,
}

#[derive(Accounts)]
pub struct ConcludeCombat<'info> {
    /// CHECK: Adventure owner; used for PDA derivation
    #[account(mut)]
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
    #[account(
        mut,
        seeds = [COMBAT_SEED, adventure.key().as_ref()],
        bump = combat.bump,
        constraint = adventure.combat_account == combat.key() @ AdventureError::InvalidCombatAccount
    )]
    pub combat: Account<'info, AdventureCombat>,
}

#[derive(Accounts)]
pub struct DeclineEncounter<'info> {
    /// CHECK: Adventure owner; used for PDA derivation
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

#[program]
pub mod adventure_engine {
    use super::*;

    pub fn start_adventure<'info>(
        ctx: Context<'_, '_, '_, 'info, StartAdventure<'info>>,
        hero_mints: Vec<Pubkey>,
        items: Vec<ItemInput>,
    ) -> Result<()> {
        crate::instructions::start::start_adventure(ctx, hero_mints, items)
    }

    /// Only writes the delegate key into the account data.
    pub fn set_delegate(ctx: Context<SetDelegate>, delegate: Option<Pubkey>) -> Result<()> {
        crate::instructions::delegate::set_delegate(ctx, delegate)
    }

    /// Delegation currently disabled while developing on main chain.
    pub fn delegate_adventure(ctx: Context<DelegateAdventure>) -> Result<()> {
        crate::instructions::delegate::delegate_adventure(ctx)
    }

    pub fn move_hero(ctx: Context<MoveHero>, direction: Direction) -> Result<()> {
        crate::instructions::movement::move_hero(ctx, direction)
    }

    pub fn pickup_item(ctx: Context<ManageItems>, item_key: u8, quantity: u16) -> Result<()> {
        crate::instructions::items::pickup_item(ctx, item_key, quantity)
    }

    pub fn drop_item(ctx: Context<ManageItems>, item_key: u8, quantity: u16) -> Result<()> {
        crate::instructions::items::drop_item(ctx, item_key, quantity)
    }

    pub fn swap_item(
        ctx: Context<ManageItems>,
        drop_item_key: u8,
        drop_quantity: u16,
        pickup_item_key: u8,
        pickup_quantity: u16,
    ) -> Result<()> {
        crate::instructions::items::swap_item(
            ctx,
            drop_item_key,
            drop_quantity,
            pickup_item_key,
            pickup_quantity,
        )
    }

    pub fn open_chest(ctx: Context<OpenChest>, chest_index: u8) -> Result<()> {
        crate::instructions::loot::open_chest(ctx, chest_index)
    }

    pub fn exit_adventure<'info>(
        ctx: Context<'_, '_, '_, 'info, ExitAdventure<'info>>,
    ) -> Result<()> {
        crate::instructions::exit::exit_adventure(ctx)
    }

    pub fn begin_encounter(ctx: Context<BeginEncounter>) -> Result<()> {
        crate::instructions::combat::begin_encounter(ctx)
    }

    pub fn submit_combat_action(
        ctx: Context<SubmitCombatAction>,
        instruction: crate::instructions::combat::CombatInstruction,
    ) -> Result<()> {
        crate::instructions::combat::submit_combat_action(ctx, instruction)
    }

    pub fn conclude_combat(ctx: Context<ConcludeCombat>) -> Result<()> {
        crate::instructions::combat::conclude_combat(ctx)
    }

    pub fn decline_encounter(ctx: Context<DeclineEncounter>) -> Result<()> {
        crate::instructions::combat::decline_encounter(ctx)
    }
}

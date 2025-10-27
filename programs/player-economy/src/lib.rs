use anchor_lang::prelude::*;

declare_id!("7wWA6dk96DR9g3NVSw5iQkHFCidK7DdV3V71Auv9bZMj");

pub const PLAYER_ECONOMY_SEED: &[u8] = b"player_economy";
pub const ITEM_COUNT: usize = 7;
const HOURLY_GRANT_AMOUNT: u64 = 200;
const HOURLY_GRANT_COOLDOWN: i64 = 60 * 60;

#[program]
pub mod player_economy {
    use super::*;

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

    pub fn buy_item(ctx: Context<ModifyItemStock>, item: ItemKey, quantity: u16) -> Result<()> {
        require!(quantity > 0, PlayerEconomyError::InvalidQuantity);

        let definition = item.definition();
        let price = definition
            .buy_price
            .ok_or(PlayerEconomyError::ItemNotPurchasable)?;
        let account = &mut ctx.accounts.player_economy;

        require_keys_eq!(
            account.owner,
            ctx.accounts.owner.key(),
            PlayerEconomyError::Unauthorized
        );

        let total_price = price
            .checked_mul(quantity as u64)
            .ok_or(PlayerEconomyError::MathOverflow)?;

        require!(
            account.gold >= total_price,
            PlayerEconomyError::InsufficientGold
        );

        let index = item.index();
        let current = account.items[index];
        let new_total = current
            .checked_add(quantity)
            .ok_or(PlayerEconomyError::InventoryOverflow)?;

        if definition.max_stack > 0 {
            require!(
                new_total as u64 <= definition.max_stack as u64,
                PlayerEconomyError::StackLimitExceeded
            );
        }

        account.gold -= total_price;
        account.items[index] = new_total;

        emit!(ItemPurchased {
            owner: account.owner,
            item: item as u8,
            quantity,
            unit_price: price,
        });

        Ok(())
    }

    pub fn sell_item(ctx: Context<ModifyItemStock>, item: ItemKey, quantity: u16) -> Result<()> {
        require!(quantity > 0, PlayerEconomyError::InvalidQuantity);

        let definition = item.definition();
        let price = definition
            .sell_price
            .ok_or(PlayerEconomyError::ItemNotSellable)?;
        let account = &mut ctx.accounts.player_economy;

        require_keys_eq!(
            account.owner,
            ctx.accounts.owner.key(),
            PlayerEconomyError::Unauthorized
        );

        let index = item.index();
        let current = account.items[index];
        require!(current >= quantity, PlayerEconomyError::InsufficientStock);

        let total_value = price
            .checked_mul(quantity as u64)
            .ok_or(PlayerEconomyError::MathOverflow)?;

        account.items[index] = current - quantity;
        account.gold = account
            .gold
            .checked_add(total_value)
            .ok_or(PlayerEconomyError::MathOverflow)?;

        emit!(ItemSold {
            owner: account.owner,
            item: item as u8,
            quantity,
            unit_price: price,
        });

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
}

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
pub struct ModifyItemStock<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_ECONOMY_SEED, owner.key().as_ref()],
        bump = player_economy.bump
    )]
    pub player_economy: Account<'info, PlayerEconomy>,
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

#[account]
pub struct PlayerEconomy {
    pub owner: Pubkey,
    pub gold: u64,
    pub last_grant_ts: i64,
    pub items: [u16; ITEM_COUNT],
    pub bump: u8,
    pub reserved: [u8; 5],
}

impl PlayerEconomy {
    pub const LEN: usize = 8   // discriminator
        + 32                   // owner
        + 8                    // gold
        + 8                    // last_grant_ts
        + (2 * ITEM_COUNT)     // items
        + 1                    // bump
        + 5; // reserved
}

#[event]
pub struct PlayerEconomyInitialized {
    pub owner: Pubkey,
}

#[event]
pub struct ItemPurchased {
    pub owner: Pubkey,
    pub item: u8,
    pub quantity: u16,
    pub unit_price: u64,
}

#[event]
pub struct ItemSold {
    pub owner: Pubkey,
    pub item: u8,
    pub quantity: u16,
    pub unit_price: u64,
}

#[event]
pub struct GoldSpent {
    pub owner: Pubkey,
    pub amount: u64,
    pub remaining: u64,
}

#[event]
pub struct HourlyGrantClaimed {
    pub owner: Pubkey,
    pub amount: u64,
    pub next_available_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum ItemKey {
    PouchGold = 0,
    StressTonic = 1,
    MinorTorch = 2,
    HealingSalve = 3,
    MysteryRelic = 4,
    CalmingIncense = 5,
    PhoenixFeather = 6,
}

impl ItemKey {
    pub fn index(self) -> usize {
        self as usize
    }

    pub fn definition(self) -> &'static ItemDefinition {
        &ITEM_DEFINITIONS[self.index()]
    }
}

#[derive(Clone, Copy)]
pub struct ItemDefinition {
    pub key: ItemKey,
    pub buy_price: Option<u64>,
    pub sell_price: Option<u64>,
    pub max_stack: u16,
}

const ITEM_DEFINITIONS: [ItemDefinition; ITEM_COUNT] = [
    ItemDefinition {
        key: ItemKey::PouchGold,
        buy_price: None,
        sell_price: Some(25),
        max_stack: 0,
    },
    ItemDefinition {
        key: ItemKey::StressTonic,
        buy_price: Some(42),
        sell_price: Some(21),
        max_stack: 0,
    },
    ItemDefinition {
        key: ItemKey::MinorTorch,
        buy_price: Some(28),
        sell_price: Some(14),
        max_stack: 0,
    },
    ItemDefinition {
        key: ItemKey::HealingSalve,
        buy_price: Some(65),
        sell_price: Some(32),
        max_stack: 0,
    },
    ItemDefinition {
        key: ItemKey::MysteryRelic,
        buy_price: None,
        sell_price: Some(140),
        max_stack: 0,
    },
    ItemDefinition {
        key: ItemKey::CalmingIncense,
        buy_price: None,
        sell_price: Some(90),
        max_stack: 3,
    },
    ItemDefinition {
        key: ItemKey::PhoenixFeather,
        buy_price: None,
        sell_price: Some(220),
        max_stack: 1,
    },
];

#[error_code]
pub enum PlayerEconomyError {
    #[msg("Player economy account already initialized")]
    AlreadyInitialized,
    #[msg("Unauthorized owner access")]
    Unauthorized,
    #[msg("Quantity must be greater than zero")]
    InvalidQuantity,
    #[msg("Unable to spend zero gold")]
    InvalidSpendAmount,
    #[msg("Item cannot be purchased")]
    ItemNotPurchasable,
    #[msg("Item cannot be sold")]
    ItemNotSellable,
    #[msg("Inventory stack limit exceeded")]
    StackLimitExceeded,
    #[msg("Not enough of the requested item")]
    InsufficientStock,
    #[msg("Not enough gold available")]
    InsufficientGold,
    #[msg("Value overflow detected")]
    MathOverflow,
    #[msg("Hourly grant still on cooldown")]
    GrantOnCooldown,
    #[msg("Inventory quantity too large")]
    InventoryOverflow,
}

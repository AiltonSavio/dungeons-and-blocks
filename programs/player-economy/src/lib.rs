use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use errors::*;
pub use state::*;

// Import client account functions for Anchor macro
pub(crate) use instructions::economy::{
    __client_accounts_grant_hourly_gold, __client_accounts_initialize_player_economy,
    __client_accounts_spend_gold,
};
#[cfg(feature = "cpi")]
pub(crate) use instructions::economy::{
    __cpi_client_accounts_grant_hourly_gold, __cpi_client_accounts_initialize_player_economy,
    __cpi_client_accounts_spend_gold,
};
pub(crate) use instructions::items::{
    __client_accounts_consume_items, __client_accounts_modify_item_stock,
};
#[cfg(feature = "cpi")]
pub(crate) use instructions::items::{
    __cpi_client_accounts_consume_items, __cpi_client_accounts_modify_item_stock,
};

pub use instructions::{
    economy::{GrantHourlyGold, InitializePlayerEconomy, SpendGold},
    items::{ConsumeItems, ModifyItemStock},
};

declare_id!("8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ");

#[program]
pub mod player_economy {
    use super::*;
    use instructions::{
        economy::{GrantHourlyGold, InitializePlayerEconomy, SpendGold},
        items::{ConsumeItems, ModifyItemStock},
    };

    pub fn initialize_player_economy(ctx: Context<InitializePlayerEconomy>) -> Result<()> {
        instructions::economy::initialize_player_economy(ctx)
    }

    pub fn buy_item(ctx: Context<ModifyItemStock>, item: ItemKey, quantity: u16) -> Result<()> {
        instructions::items::buy_item(ctx, item, quantity)
    }

    pub fn sell_item(ctx: Context<ModifyItemStock>, item: ItemKey, quantity: u16) -> Result<()> {
        instructions::items::sell_item(ctx, item, quantity)
    }

    pub fn spend_gold(ctx: Context<SpendGold>, amount: u64) -> Result<()> {
        instructions::economy::spend_gold(ctx, amount)
    }

    pub fn grant_hourly_gold(ctx: Context<GrantHourlyGold>) -> Result<()> {
        instructions::economy::grant_hourly_gold(ctx)
    }

    pub fn consume_items(ctx: Context<ConsumeItems>, items: Vec<ItemConsumption>) -> Result<()> {
        instructions::items::consume_items(ctx, items)
    }
}

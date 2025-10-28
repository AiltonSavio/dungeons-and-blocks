use anchor_lang::prelude::*;

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
    #[msg("Player economy account is not initialized")]
    AccountNotInitialized,
}

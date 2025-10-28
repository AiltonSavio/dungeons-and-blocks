use anchor_lang::prelude::*;

#[error_code]
pub enum AdventureError {
    #[msg("hero count must be between 1 and 4")]
    InvalidHeroCount,
    #[msg("duplicate hero provided")]
    DuplicateHero,
    #[msg("hero does not belong to player")]
    HeroNotOwned,
    #[msg("hero is currently active in a different adventure")]
    HeroAlreadyActive,
    #[msg("hero state account belongs to a different player")]
    HeroLockOwnerMismatch,
    #[msg("hero record is invalid")]
    InvalidHeroLockAccount,
    #[msg("hero is not available for adventures")]
    HeroUnavailable,
    #[msg("adventure already active")]
    AdventureAlreadyActive,
    #[msg("adventure is not active")]
    AdventureNotActive,
    #[msg("player mismatch for this adventure session")]
    AdventureOwnerMismatch,
    #[msg("dungeon is not ready")]
    DungeonNotReady,
    #[msg("dungeon seed not initialized")]
    DungeonSeedMissing,
    #[msg("movement exceeded dungeon bounds")]
    MovementOutOfBounds,
    #[msg("cannot move into a wall tile")]
    MovementIntoWall,
    #[msg("no portal available at this position")]
    NoPortalAtPosition,
    #[msg("reset is blocked while heroes are inside")]
    ResetBlocked,
    #[msg("hero index out of range")]
    HeroIndexOutOfRange,
    #[msg("invalid validator account supplied")]
    InvalidValidatorAccount,
    #[msg("caller is not authorized to perform this action")]
    Unauthorized,
    #[msg("too many items provided (max 6)")]
    TooManyItems,
    #[msg("invalid item key")]
    InvalidItemKey,
    #[msg("invalid item quantity")]
    InvalidItemQuantity,
    #[msg("item stack overflow")]
    ItemStackOverflow,
    #[msg("inventory is full")]
    InventoryFull,
    #[msg("item not found in inventory")]
    ItemNotFound,
    #[msg("insufficient item quantity")]
    InsufficientItemQuantity,
    #[msg("no chest available at this position")]
    NoChestAtPosition,
    #[msg("chest already opened")]
    ChestAlreadyOpened,
    #[msg("selected loot is not available")]
    LootNotAvailable,
    #[msg("dungeon owner economy account missing")]
    DungeonOwnerEconomyMissing,
    #[msg("dungeon account mismatch")]
    InvalidDungeonAccount,
}

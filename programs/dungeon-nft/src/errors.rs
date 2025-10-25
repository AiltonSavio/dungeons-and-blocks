use anchor_lang::prelude::*;

#[error_code]
pub enum DungeonError {
    #[msg("Unable to fit dungeon data in configured grid")]
    InvalidGrid,
    #[msg("Grid dimensions too large for account space")]
    GridTooLarge,
    #[msg("Collection name is invalid")]
    InvalidCollectionName,
    #[msg("Symbol is invalid")]
    InvalidSymbol,
    #[msg("Base URI is invalid")]
    InvalidUri,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Max supply reached")]
    MaxSupplyReached,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Dungeon already settled")]
    MintAlreadySettled,
    #[msg("Invalid randomness payload")]
    InvalidRandomness,
    #[msg("Invalid configuration reference")]
    InvalidConfigReference,
    #[msg("Grid size cannot change after minting begins")]
    GridImmutableAfterMint,
    #[msg("Seeded mint authority mismatch")]
    UnauthorizedSeedAuthority,
}

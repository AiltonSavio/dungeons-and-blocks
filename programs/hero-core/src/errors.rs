use anchor_lang::prelude::*;

#[error_code]
pub enum HeroError {
    #[msg("Missing PDA bump value")]
    MissingBump,
    #[msg("Player already used all free hero mints")]
    FreeMintsExhausted,
    #[msg("Player reached maximum hero capacity")]
    HeroCapacityReached,
    #[msg("Insufficient gold for paid mint")]
    InsufficientGold,
    #[msg("Math overflow detected")]
    MathOverflow,
    #[msg("Unexpected randomness callback")]
    UnexpectedCallback,
    #[msg("Hero already burned")]
    HeroBurned,
    #[msg("Unauthorized hero owner")]
    UnauthorizedOwner,
    #[msg("Invalid VRF identity signer")]
    InvalidVrfIdentity,
    #[msg("Hero account mismatch")]
    HeroMismatch,
    #[msg("Hero already processing a randomness request")]
    HeroBusy,
    #[msg("Hero reached maximum level")]
    MaxLevelReached,
    #[msg("Hero does not meet experience requirement for level up")]
    InsufficientExperience,
    #[msg("Invalid level progression requested")]
    InvalidLevelProgression,
    #[msg("Invalid status effect type")]
    InvalidStatusEffect,
}

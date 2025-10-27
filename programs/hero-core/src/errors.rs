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
    #[msg("Hero is locked in an adventure")]
    HeroLocked,
    #[msg("Adventure signer mismatch")]
    WrongAdventure,
    #[msg("Adventure program mismatch")]
    WrongProgram,
    #[msg("Hero is not locked")]
    NotLocked,
    #[msg("Hero already locked")]
    AlreadyLocked,
    #[msg("Seeded mint authority mismatch")]
    UnauthorizedAuthority,
    #[msg("No status effects to cure")]
    NoStatusEffects,
    #[msg("No negative traits to cure")]
    NoNegativeTraits,
    #[msg("Hero has reached maximum reroll limit")]
    MaxRerollsReached,
    #[msg("Hero stress is already at zero")]
    NoStressToRelieve,
    #[msg("Hero is already blessed")]
    AlreadyBlessed,
    #[msg("Invalid negative trait")]
    InvalidNegativeTrait,
    #[msg("All negative trait slots are filled")]
    NegativeTraitSlotsFull,
    #[msg("Hero is already at maximum HP")]
    HeroAtMaxHp,
    #[msg("Invalid heal amount")]
    InvalidHealAmount,
    #[msg("Heal amount exceeds missing HP")]
    HealAmountTooLarge,
}

use anchor_lang::prelude::Pubkey;
use std::str::FromStr;

pub const PLAYER_PROFILE_SEED: &[u8] = b"player";
pub const HERO_SEED: &[u8] = b"hero";
pub const GAME_VAULT_SEED: &[u8] = b"vault";
pub const GOLD_ACCOUNT_SEED: &[u8] = b"gold";
pub const MAX_HEROES_PER_PLAYER: u8 = 20;
pub const MAX_FREE_HEROES: u8 = 4;
pub const HERO_PRICE: u64 = 100;
pub const MAX_STAT_VALUE: u8 = 100;
pub const STATUS_EFFECTS_COUNT: u8 = 5;
pub const MAX_LEVEL: u8 = 5;
pub const EXPERIENCE_THRESHOLDS: [u64; (MAX_LEVEL as usize) + 1] = [0, 0, 100, 300, 600, 1000];

pub fn adventure_engine_program_id() -> Pubkey {
    Pubkey::from_str("9qbdCw4BAiyecsGd1oJ1EfnCgYbBMxuYeWr7tpZ3BqAt")
        .expect("valid adventure engine program id")
}

pub fn seeded_mint_authority() -> Pubkey {
    Pubkey::from_str("4B43HPg1Pe5zWmrACKk4komJ7R6prEkA1Lpvif8Dytn9")
        .expect("valid seeded mint authority pubkey")
}

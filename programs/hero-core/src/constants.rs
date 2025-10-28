use anchor_lang::prelude::Pubkey;
use std::str::FromStr;

pub const PLAYER_PROFILE_SEED: &[u8] = b"player";
pub const HERO_SEED: &[u8] = b"hero";
pub const GAME_VAULT_SEED: &[u8] = b"vault";
pub const MAX_HEROES_PER_PLAYER: u8 = 20;
pub const MAX_FREE_HEROES: u8 = 4;
pub const HERO_PRICE: u64 = 100;
pub const MAX_STAT_VALUE: u8 = 100;
pub const STATUS_EFFECTS_COUNT: u8 = 4;
pub const POSITIVE_TRAIT_COUNT: u8 = 6;
pub const NEGATIVE_TRAIT_COUNT: u8 = 6;
pub const TRAIT_SLOT_COUNT: usize = 3;
pub const TRAIT_NONE_VALUE: u8 = u8::MAX;
pub const BASE_STRESS_MAX: u16 = 200;
pub const MIN_STRESS_MAX: u16 = 100;
pub const MAX_STRESS_MAX: u16 = 300;
pub const MAX_LEVEL: u8 = 5;
pub const EXPERIENCE_THRESHOLDS: [u64; (MAX_LEVEL as usize) + 1] = [0, 0, 100, 300, 600, 1000];

// Town building costs
pub const STATUS_EFFECT_CURE_COST: u64 = 10;
pub const NEGATIVE_TRAIT_CURE_COST: u64 = 25;
pub const STAT_REROLL_COST: u64 = 30;
pub const MAX_REROLLS: u8 = 3;
pub const STRESS_RELIEF_COST: u64 = 10;
pub const TAVERN_HEAL_COST_PER_HP: u64 = 1;
pub const LEVEL_UP_GOLD_COST: u64 = 50;

pub fn adventure_engine_program_id() -> Pubkey {
    Pubkey::from_str("Hnjoe3f7cZuc47RMytSyBrdpxj6x8SoHQBRfqdwKvxVC")
        .expect("valid adventure engine program id")
}

pub fn seeded_mint_authority() -> Pubkey {
    Pubkey::from_str("AXwYStYVryJuZjNJjHHLPp6eVRc2TuESnW1pCMiUYrwV")
        .expect("valid seeded mint authority pubkey")
}

use anchor_lang::prelude::*;

use crate::constants::*;

#[account]
pub struct PlayerProfile {
    pub owner: Pubkey,
    pub bump: u8,
    pub hero_count: u8,
    pub free_mints_claimed: bool,
    pub free_mint_count: u8,
    pub next_hero_id: u64,
    pub soulbound_hero_ids: [Option<u64>; MAX_FREE_HEROES as usize],
    pub reserved: [u8; 32],
}

impl PlayerProfile {
    pub const LEN: usize = 8 + 32 + 1 + 1 + 1 + 1 + 8 + (MAX_FREE_HEROES as usize * 9) + 32;
}

#[account]
pub struct HeroMint {
    pub owner: Pubkey,
    pub bump: u8,
    pub id: u64,
    pub hero_type: u8,
    pub level: u8,
    pub experience: u64,
    pub max_hp: u8,
    pub current_hp: u8,
    pub attack: u8,
    pub defense: u8,
    pub magic: u8,
    pub resistance: u8,
    pub speed: u8,
    pub luck: u8,
    pub status_effects: u8,
    pub skill_1: Skill,
    pub skill_2: Skill,
    pub positive_quirks: [Option<u8>; 3],
    pub negative_quirks: [Option<u8>; 3],
    pub is_soulbound: bool,
    pub is_burned: bool,
    pub mint_timestamp: i64,
    pub last_level_up: i64,
    pub pending_request: u8,
    pub locked: bool,
    pub locked_adventure: Pubkey,
    pub locked_program: Pubkey,
    pub locked_since: i64,
    pub padding: [u8; 31],
}

impl HeroMint {
    pub const LEN: usize = 8
        + 32
        + 1
        + 8
        + 1
        + 1
        + 8
        + 8
        + 1
        + (1 * 2)
        + (3 * 2)
        + (3 * 2)
        + 1
        + 1
        + 8
        + 8
        + 1
        + 1
        + 32
        + 32
        + 8
        + 31;
}

#[account]
pub struct GoldAccount {
    pub owner: Pubkey,
    pub balance: u64,
    pub bump: u8,
    pub reserved: [u8; 7],
}

impl GoldAccount {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 7;
}

#[account]
pub struct GameVault {
    pub balance: u64,
    pub bump: u8,
    pub reserved: [u8; 7],
}

impl GameVault {
    pub const LEN: usize = 8 + 8 + 1 + 7;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct Skill {
    pub id: u8,
}

impl Skill {
    pub const LEN: usize = 1;

    pub fn new(id: u8) -> Self {
        Self { id }
    }
}

#[derive(Clone, Copy)]
pub struct Stats {
    pub max_hp: u8,
    pub attack: u8,
    pub defense: u8,
    pub magic: u8,
    pub resistance: u8,
    pub speed: u8,
    pub luck: u8,
}

#[repr(u8)]
pub enum PendingRequestType {
    None = 0,
    FreeMint = 1,
    PaidMint = 2,
    LevelUp = 3,
}

#[derive(Clone, Copy)]
pub enum RequestType {
    FreeMint,
    PaidMint,
    LevelUp,
}

impl RequestType {
    pub fn as_str(&self) -> &'static str {
        match self {
            RequestType::FreeMint => "free_mint",
            RequestType::PaidMint => "paid_mint",
            RequestType::LevelUp => "level_up",
        }
    }
}

#[event]
pub struct PlayerInitialized {
    pub player: Pubkey,
}

#[event]
pub struct RandomnessRequested {
    pub player: Pubkey,
    pub request_type: String,
}

#[event]
pub struct HeroMinted {
    pub player: Pubkey,
    pub hero_id: u64,
    pub hero_type: u8,
    pub level: u8,
    pub is_soulbound: bool,
}

#[event]
pub struct HeroLeveledUp {
    pub player: Pubkey,
    pub hero_id: u64,
    pub new_level: u8,
}

#[event]
pub struct StatusEffectApplied {
    pub player: Pubkey,
    pub hero_id: u64,
    pub effect_type: u8,
}

#[event]
pub struct StatusEffectRemoved {
    pub player: Pubkey,
    pub hero_id: u64,
    pub effect_type: u8,
}

#[event]
pub struct HeroBurned {
    pub player: Pubkey,
    pub hero_id: u64,
}

#[event]
pub struct HeroLockedEvent {
    pub player: Pubkey,
    pub hero_id: u64,
    pub adventure: Pubkey,
}

#[event]
pub struct HeroUnlockedEvent {
    pub player: Pubkey,
    pub hero_id: u64,
    pub adventure: Pubkey,
}

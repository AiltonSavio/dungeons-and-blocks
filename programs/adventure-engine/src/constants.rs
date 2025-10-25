use anchor_lang::prelude::*;
use std::str::FromStr;

pub const ADVENTURE_SEED: &[u8] = b"adventure";
pub const HERO_LOCK_SEED: &[u8] = b"hero-lock";

pub const MAX_ROOMS: usize = 40;
pub const MAX_DOORS: usize = 64;
pub const MAX_CHESTS: usize = 64;
pub const MAX_PORTALS: usize = 8;
pub const MAX_PARTY: usize = 4;
pub const MAX_ITEMS: usize = 6;

pub const RESET_INTERVAL_SECONDS: i64 = 24 * 60 * 60;
pub const CREW_EXPIRY_SECONDS: i64 = RESET_INTERVAL_SECONDS;

pub const TILE_FLOOR: u8 = 0;
pub const TILE_WALL: u8 = 1;

pub const DEFAULT_COMMIT_FREQUENCY_MS: u32 = 500;
pub const US_DEVNET_VALIDATOR: &str = "MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd";

pub const PORTAL_NONE: u8 = u8::MAX;

pub fn us_devnet_validator_pubkey() -> Result<Pubkey> {
    Pubkey::from_str(US_DEVNET_VALIDATOR)
        .map_err(|_| error!(crate::AdventureError::InvalidValidatorAccount))
}

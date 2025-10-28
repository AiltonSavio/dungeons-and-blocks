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
pub const PORTAL_NONE: u8 = u8::MAX;

// Loot-only items (can only be found/looted, not brought to adventures)
pub const ITEM_POUCH_GOLD: u8 = 0;
pub const ITEM_MYSTERY_RELIC: u8 = 4;

pub const POUCH_GOLD_VALUE: u64 = 25;
pub const DUNGEON_FEE_BPS: u64 = 300; // 3%
pub const BPS_DENOMINATOR: u64 = 10_000;

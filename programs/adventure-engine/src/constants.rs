pub const ADVENTURE_SEED: &[u8] = b"adventure";
pub const HERO_LOCK_SEED: &[u8] = b"hero-lock";
pub const COMBAT_SEED: &[u8] = b"combat";

pub const MAX_ROOMS: usize = 40;
pub const MAX_DOORS: usize = 64;
pub const MAX_CHESTS: usize = 64;
pub const MAX_PORTALS: usize = 8;
pub const MAX_PARTY: usize = 4;
pub const MAX_ITEMS: usize = 6;

pub const MAX_ENEMIES: usize = 4;
pub const MAX_COMBATANTS: usize = MAX_PARTY + MAX_ENEMIES;
pub const MAX_STATUS_PER_COMBATANT: usize = 4;
pub const STATUS_POOL_SIZE: usize = MAX_COMBATANTS * MAX_STATUS_PER_COMBATANT;

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

pub const ENCOUNTER_BASE_BPS: u16 = 2000; // 20%
pub const ENCOUNTER_MIN_TORCH: u8 = 5;
pub const ENCOUNTER_MAX_TORCH: u8 = 100;
pub const ENCOUNTER_TORCH_SLOPE_BPS: i16 = 60; // each torch drop point adds 0.6%

pub const HERO_AP_MAX: u8 = 3;
pub const ENEMY_AP_MAX: u8 = 3;

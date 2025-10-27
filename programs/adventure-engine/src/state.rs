use anchor_lang::prelude::*;
use hero_core::constants::{BASE_STRESS_MAX, TRAIT_NONE_VALUE, TRAIT_SLOT_COUNT};
use hero_core::state::AdventureHeroStats;

use crate::constants::*;

#[account]
pub struct AdventureSession {
    pub player: Pubkey,
    pub dungeon_mint: Pubkey,
    pub bump: u8,
    pub seed: u32,
    pub width: u16,
    pub height: u16,
    pub is_active: bool,
    pub heroes_inside: bool,
    pub hero_count: u8,
    pub hero_mints: [Pubkey; MAX_PARTY],
    pub hero_snapshots: [HeroSnapshot; MAX_PARTY],
    pub party_position: DungeonPoint,
    pub item_count: u8,
    pub items: [ItemSlot; MAX_ITEMS],
    pub delegate: Option<Pubkey>,
    pub grid: Vec<u8>,
    pub rooms: Vec<DungeonRoom>,
    pub doors: Vec<DungeonPoint>,
    pub chests: Vec<DungeonPoint>,
    pub portals: Vec<DungeonPoint>,
    pub opened_chests: Vec<u8>,
    pub used_portals: Vec<u8>,
    pub last_exit_portal: u8,
    pub last_exit_position: DungeonPoint,
    pub created_at: i64,
    pub last_started_at: i64,
    pub last_reset_at: i64,
    pub last_crew_timestamp: i64,
    pub last_crew_count: u8,
    pub last_crew: [Pubkey; MAX_PARTY],
    pub torch: u8,
}

impl AdventureSession {
    pub fn space(width: u16, height: u16) -> usize {
        let hero_snapshot_space = HeroSnapshot::SIZE * MAX_PARTY;
        let grid_cells = (width as usize).saturating_mul(height as usize).min(10_000);
        let grid_space = 4 + grid_cells;
        let rooms_space = 4 + MAX_ROOMS * DungeonRoom::SIZE;
        let doors_space = 4 + MAX_DOORS * DungeonPoint::SIZE;
        let chests_space = 4 + MAX_CHESTS * DungeonPoint::SIZE;
        let portals_space = 4 + MAX_PORTALS * DungeonPoint::SIZE;
        let chest_state_space = 4 + MAX_CHESTS;
        let portal_state_space = 4 + MAX_PORTALS;

        let fixed = 8
            + 32
            + 32
            + 1
            + 4
            + 2
            + 2
            + 1
            + 1
            + 1
            + (32 * MAX_PARTY)
            + hero_snapshot_space
            + DungeonPoint::SIZE
            + 1
            + (ItemSlot::SIZE * MAX_ITEMS)
            + 33
            + 1
            + DungeonPoint::SIZE
            + (8 * 4)
            + 1
            + (32 * MAX_PARTY)
            + 1;

        fixed
            + grid_space
            + rooms_space
            + doors_space
            + chests_space
            + portals_space
            + chest_state_space
            + portal_state_space
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct ItemSlot {
    pub item_key: u8, // ItemKey from player-economy, 255 = empty
    pub quantity: u16,
}

impl ItemSlot {
    pub const SIZE: usize = 1 + 2;
    pub const EMPTY: u8 = 255;

    pub fn empty() -> Self {
        Self {
            item_key: Self::EMPTY,
            quantity: 0,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.item_key == Self::EMPTY || self.quantity == 0
    }
}

impl Default for ItemSlot {
    fn default() -> Self {
        Self::empty()
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct HeroSnapshot {
    pub hero_id: u64,
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
    pub stress: u16,
    pub stress_max: u16,
    pub positive_traits: [u8; TRAIT_SLOT_COUNT],
    pub negative_traits: [u8; TRAIT_SLOT_COUNT],
}

impl HeroSnapshot {
    pub const SIZE: usize = 8
        + 1
        + 1
        + 8
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + 1
        + 2
        + 2
        + TRAIT_SLOT_COUNT
        + TRAIT_SLOT_COUNT;
}

impl Default for HeroSnapshot {
    fn default() -> Self {
        Self {
            hero_id: 0,
            hero_type: 0,
            level: 0,
            experience: 0,
            max_hp: 0,
            current_hp: 0,
            attack: 0,
            defense: 0,
            magic: 0,
            resistance: 0,
            speed: 0,
            luck: 0,
            status_effects: 0,
            stress: 0,
            stress_max: BASE_STRESS_MAX,
            positive_traits: [TRAIT_NONE_VALUE; TRAIT_SLOT_COUNT],
            negative_traits: [TRAIT_NONE_VALUE; TRAIT_SLOT_COUNT],
        }
    }
}

impl From<HeroSnapshot> for AdventureHeroStats {
    fn from(value: HeroSnapshot) -> Self {
        AdventureHeroStats {
            hero_id: value.hero_id,
            hero_type: value.hero_type,
            level: value.level,
            experience: value.experience,
            max_hp: value.max_hp,
            current_hp: value.current_hp,
            attack: value.attack,
            defense: value.defense,
            magic: value.magic,
            resistance: value.resistance,
            speed: value.speed,
            luck: value.luck,
            status_effects: value.status_effects,
            stress: value.stress,
            stress_max: value.stress_max,
            positive_traits: value.positive_traits,
            negative_traits: value.negative_traits,
        }
    }
}

#[account]
pub struct HeroAdventureLock {
    pub hero_mint: Pubkey,
    pub owner: Pubkey,
    pub adventure: Pubkey,
    pub bump: u8,
    pub is_active: bool,
    pub last_updated: i64,
}

impl HeroAdventureLock {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 1 + 1 + 8;
}

impl Default for HeroAdventureLock {
    fn default() -> Self {
        Self {
            hero_mint: Pubkey::default(),
            owner: Pubkey::default(),
            adventure: Pubkey::default(),
            bump: 0,
            is_active: false,
            last_updated: 0,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct DungeonRoom {
    pub x: u16,
    pub y: u16,
    pub w: u16,
    pub h: u16,
}

impl DungeonRoom {
    pub const SIZE: usize = 8;

    pub fn center(&self) -> DungeonPoint {
        DungeonPoint {
            x: self.x + (self.w.saturating_sub(1) >> 1),
            y: self.y + (self.h.saturating_sub(1) >> 1),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct DungeonPoint {
    pub x: u16,
    pub y: u16,
}

impl DungeonPoint {
    pub const SIZE: usize = 4;
}

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
    pub pending_loot_count: u8,
    pub pending_loot_source: u8,
    pub pending_loot: [ItemSlot; MAX_ITEMS],
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
    pub in_combat: bool,
    pub combat_account: Pubkey,
    pub pending_encounter_seed: u64,
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
            + 1
            + 1
            + (ItemSlot::SIZE * MAX_ITEMS)
            + 33
            + 1
            + DungeonPoint::SIZE
            + (8 * 4)
            + 1
            + (32 * MAX_PARTY)
            + 1
            + 1
            + 32
            + 8;

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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatusEffect {
    None = 0,
    Poison = 1,
    Bleed = 2,
    Burn = 3,
    Chill = 4,
    Guard = 5,
}

impl Default for StatusEffect {
    fn default() -> Self {
        StatusEffect::None
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct StatusInstance {
    pub effect: StatusEffect,
    pub duration: u8,
    pub stacks: u8,
}

impl StatusInstance {
    pub const SIZE: usize = 1 + 1 + 1;

    pub fn clear(&mut self) {
        self.effect = StatusEffect::None;
        self.duration = 0;
        self.stacks = 0;
    }

    pub fn is_empty(&self) -> bool {
        matches!(self.effect, StatusEffect::None) || self.duration == 0 || self.stacks == 0
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum CombatantKind {
    None = 0,
    Hero = 1,
    Enemy = 2,
}

impl Default for CombatantKind {
    fn default() -> Self {
        CombatantKind::None
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct InitiativeSlot {
    pub occupant_kind: CombatantKind,
    pub index: u8,
    pub initiative_value: i16,
    pub order: u8,
    pub active: bool,
}

impl InitiativeSlot {
    pub const SIZE: usize = 1 + 1 + 2 + 1 + 1;

    pub fn clear(&mut self) {
        self.occupant_kind = CombatantKind::None;
        self.index = u8::MAX;
        self.initiative_value = 0;
        self.order = 0;
        self.active = false;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct HeroCombatant {
    pub hero_index: u8,
    pub alive: bool,
    pub ap: u8,
    pub hp: u16,
    pub max_hp: u16,
    pub attack: u16,
    pub defense: u16,
    pub magic: u16,
    pub resistance: u16,
    pub speed: u16,
    pub luck: u16,
    pub stress: u16,
    pub kill_streak: u8,
    pub guard: bool,
    pub statuses: [StatusInstance; MAX_STATUS_PER_COMBATANT],
    pub pending_xp: u32,
    pub pending_positive_traits: u8,
    pub pending_negative_traits: u8,
}

impl HeroCombatant {
    pub const SIZE: usize =
        1 + 1 + 1 + (2 * 9) + 1 + 1 + (StatusInstance::SIZE * MAX_STATUS_PER_COMBATANT) + 4 + 1 + 1;

    pub fn reset(&mut self) {
        self.ap = HERO_AP_MAX;
        self.kill_streak = 0;
        self.guard = false;
        for status in self.statuses.iter_mut() {
            status.clear();
        }
        self.pending_xp = 0;
        self.pending_positive_traits = 0;
        self.pending_negative_traits = 0;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct EnemyCombatant {
    pub kind: u8,
    pub alive: bool,
    pub ap: u8,
    pub hp: u16,
    pub max_hp: u16,
    pub attack: u16,
    pub defense: u16,
    pub magic: u16,
    pub resistance: u16,
    pub speed: u16,
    pub luck: u16,
    pub statuses: [StatusInstance; MAX_STATUS_PER_COMBATANT],
    pub threat: u8,
}

impl EnemyCombatant {
    pub const SIZE: usize =
        1 + 1 + 1 + (2 * 8) + (StatusInstance::SIZE * MAX_STATUS_PER_COMBATANT) + 1;

    pub fn reset(&mut self) {
        self.ap = ENEMY_AP_MAX;
        for status in self.statuses.iter_mut() {
            status.clear();
        }
        self.threat = 0;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum CombatResolutionState {
    Active,
    Victory,
    Defeat,
    Escape,
}

impl Default for CombatResolutionState {
    fn default() -> Self {
        CombatResolutionState::Active
    }
}

#[account]
pub struct AdventureCombat {
    pub adventure: Pubkey,
    pub bump: u8,
    pub active: bool,
    pub round: u16,
    pub turn_cursor: u8,
    pub torch: u8,
    pub rng_state: u64,
    pub hero_count: u8,
    pub enemy_count: u8,
    pub initiative_len: u8,
    pub initiative: [InitiativeSlot; MAX_COMBATANTS],
    pub heroes: [HeroCombatant; MAX_PARTY],
    pub enemies: [EnemyCombatant; MAX_ENEMIES],
    pub pending_resolution: CombatResolutionState,
    pub loot_seed: u64,
    pub last_updated: i64,
}

impl AdventureCombat {
    pub const LEN: usize = 8
        + 32
        + 1
        + 1
        + 2
        + 1
        + 1
        + 8
        + 1
        + 1
        + 1
        + (InitiativeSlot::SIZE * MAX_COMBATANTS)
        + (HeroCombatant::SIZE * MAX_PARTY)
        + (EnemyCombatant::SIZE * MAX_ENEMIES)
        + 1
        + 8
        + 8;
}

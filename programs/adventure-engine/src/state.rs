use anchor_lang::prelude::*;

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
    pub hero_positions: [DungeonPoint; MAX_PARTY],
    pub item_count: u8,
    pub item_mints: [Pubkey; MAX_ITEMS],
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
}

impl AdventureSession {
    pub fn space(width: u16, height: u16) -> usize {
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
            + (DungeonPoint::SIZE * MAX_PARTY)
            + 1
            + (32 * MAX_ITEMS)
            + 33
            + 1
            + DungeonPoint::SIZE
            + (8 * 4)
            + 1
            + (32 * MAX_PARTY);

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

#[account]
pub struct HeroAdventureLock {
    pub hero_mint: Pubkey,
    pub owner: Pubkey,
    pub adventure: Pubkey,
    pub bump: u8,
    pub is_active: bool,
    pub last_updated: i64,
    pub reserved: [u8; 7],
}

impl HeroAdventureLock {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 1 + 1 + 8 + 7;
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
            reserved: [0; 7],
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

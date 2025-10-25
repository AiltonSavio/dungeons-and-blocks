use anchor_lang::prelude::*;

use crate::constants::*;

#[account]
pub struct DungeonConfig {
    pub authority: Pubkey,
    pub bump: u8,
    pub max_supply: u16,
    pub next_mint_id: u16,
    pub completed_mints: u16,
    pub grid_width: u16,
    pub grid_height: u16,
    pub collection_name: String,
    pub collection_symbol: String,
    pub base_uri: String,
}

impl DungeonConfig {
    pub fn space() -> usize {
        8 + 32
            + 1
            + 2
            + 2
            + 2
            + 2
            + 2
            + (4 + MAX_NAME_LEN)
            + (4 + MAX_SYMBOL_LEN)
            + (4 + MAX_URI_LEN)
    }
}

#[account]
pub struct DungeonMint {
    pub owner: Pubkey,
    pub config: Pubkey,
    pub bump: u8,
    pub status: DungeonStatus,
    pub mint_id: u16,
    pub seed: u32,
    pub grid_width: u16,
    pub grid_height: u16,
    pub created_at: i64,
    pub metadata: DungeonMetadata,
}

impl DungeonMint {
    pub fn space(_grid_width: u16, _grid_height: u16) -> usize {
        let metadata_space = DungeonMetadata::space();
        8 + 32 + 32 + 1 + 1 + 2 + 4 + 2 + 2 + 8 + metadata_space
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum DungeonStatus {
    Pending = 0,
    Ready = 1,
}

impl Default for DungeonStatus {
    fn default() -> Self {
        DungeonStatus::Pending
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct DungeonMetadata {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

impl DungeonMetadata {
    pub fn space() -> usize {
        (4 + MAX_METADATA_NAME_LEN) + (4 + MAX_SYMBOL_LEN) + (4 + MAX_METADATA_URI_LEN)
    }
}

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub grid_width: u16,
    pub grid_height: u16,
}

#[event]
pub struct ConfigMetadataUpdated {
    pub authority: Pubkey,
}

#[event]
pub struct ConfigGridUpdated {
    pub authority: Pubkey,
    pub grid_width: u16,
    pub grid_height: u16,
}

#[event]
pub struct DungeonMintRequested {
    pub payer: Pubkey,
    pub dungeon: Pubkey,
    pub mint_id: u16,
}

#[event]
pub struct DungeonMintSettled {
    pub payer: Pubkey,
    pub dungeon: Pubkey,
    pub mint_id: u16,
}

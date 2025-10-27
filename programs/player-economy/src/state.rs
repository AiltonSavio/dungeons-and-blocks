use anchor_lang::prelude::*;

use crate::constants::ITEM_COUNT;

#[account]
pub struct PlayerEconomy {
    pub owner: Pubkey,
    pub gold: u64,
    pub last_grant_ts: i64,
    pub items: [u16; ITEM_COUNT],
    pub bump: u8,
    pub reserved: [u8; 5],
}

impl PlayerEconomy {
    pub const LEN: usize = 8   // discriminator
        + 32                   // owner
        + 8                    // gold
        + 8                    // last_grant_ts
        + (2 * ITEM_COUNT)     // items
        + 1                    // bump
        + 5; // reserved
}

#[event]
pub struct PlayerEconomyInitialized {
    pub owner: Pubkey,
}

#[event]
pub struct ItemPurchased {
    pub owner: Pubkey,
    pub item: u8,
    pub quantity: u16,
    pub unit_price: u64,
}

#[event]
pub struct ItemSold {
    pub owner: Pubkey,
    pub item: u8,
    pub quantity: u16,
    pub unit_price: u64,
}

#[event]
pub struct GoldSpent {
    pub owner: Pubkey,
    pub amount: u64,
    pub remaining: u64,
}

#[event]
pub struct HourlyGrantClaimed {
    pub owner: Pubkey,
    pub amount: u64,
    pub next_available_at: i64,
}

#[event]
pub struct ItemConsumed {
    pub owner: Pubkey,
    pub item: u8,
    pub quantity: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct ItemConsumption {
    pub item: ItemKey,
    pub quantity: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum ItemKey {
    PouchGold = 0,
    StressTonic = 1,
    MinorTorch = 2,
    HealingSalve = 3,
    MysteryRelic = 4,
    CalmingIncense = 5,
    PhoenixFeather = 6,
}

impl ItemKey {
    pub fn index(self) -> usize {
        self as usize
    }

    pub fn definition(self) -> &'static ItemDefinition {
        &ITEM_DEFINITIONS[self.index()]
    }
}

#[derive(Clone, Copy)]
pub struct ItemDefinition {
    pub key: ItemKey,
    pub buy_price: Option<u64>,
    pub sell_price: Option<u64>,
    pub max_stack: u16,
}

const ITEM_DEFINITIONS: [ItemDefinition; ITEM_COUNT] = [
    ItemDefinition {
        key: ItemKey::PouchGold,
        buy_price: None,
        sell_price: Some(25),
        max_stack: 0,
    },
    ItemDefinition {
        key: ItemKey::StressTonic,
        buy_price: Some(42),
        sell_price: Some(21),
        max_stack: 0,
    },
    ItemDefinition {
        key: ItemKey::MinorTorch,
        buy_price: Some(28),
        sell_price: Some(14),
        max_stack: 0,
    },
    ItemDefinition {
        key: ItemKey::HealingSalve,
        buy_price: Some(65),
        sell_price: Some(32),
        max_stack: 0,
    },
    ItemDefinition {
        key: ItemKey::MysteryRelic,
        buy_price: None,
        sell_price: Some(140),
        max_stack: 0,
    },
    ItemDefinition {
        key: ItemKey::CalmingIncense,
        buy_price: None,
        sell_price: Some(90),
        max_stack: 3,
    },
    ItemDefinition {
        key: ItemKey::PhoenixFeather,
        buy_price: None,
        sell_price: Some(220),
        max_stack: 1,
    },
];

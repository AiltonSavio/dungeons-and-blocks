use anchor_lang::prelude::Pubkey;
use std::str::FromStr;

pub const CONFIG_SEED: &[u8] = b"config";
pub const DUNGEON_SEED: &[u8] = b"dungeon";
pub const MAX_SUPPLY: u16 = 150;
pub const MAX_NAME_LEN: usize = 64;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 128;
pub const MAX_METADATA_NAME_LEN: usize = MAX_NAME_LEN + 8;
pub const MAX_METADATA_URI_LEN: usize = MAX_URI_LEN + 16;

pub fn seeded_mint_authority() -> Pubkey {
    Pubkey::from_str("4B43HPg1Pe5zWmrACKk4komJ7R6prEkA1Lpvif8Dytn9")
        .expect("valid seeded dungeon mint authority pubkey")
}

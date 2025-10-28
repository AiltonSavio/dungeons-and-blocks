use anchor_lang::prelude::{pubkey, Pubkey};

pub const PLAYER_ECONOMY_SEED: &[u8] = b"player_economy";
pub const ITEM_COUNT: usize = 7;
pub const HOURLY_GRANT_AMOUNT: u64 = 200;
pub const HOURLY_GRANT_COOLDOWN: i64 = 60 * 60;

pub const ADVENTURE_ENGINE_PROGRAM_ID: Pubkey =
    pubkey!("Hnjoe3f7cZuc47RMytSyBrdpxj6x8SoHQBRfqdwKvxVC");

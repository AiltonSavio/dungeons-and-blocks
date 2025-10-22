use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak::hashv;
use ephemeral_vrf_sdk::types::SerializableAccountMeta;

pub fn derive_caller_seed(player: &Pubkey, hero_id: u64) -> Result<[u8; 32]> {
    let now = Clock::get()?.unix_timestamp;
    let hash = hashv(&[
        &player.to_bytes(),
        &hero_id.to_le_bytes(),
        &now.to_le_bytes(),
    ]);
    Ok(hash.0)
}

pub fn meta(account: &AccountInfo<'_>, is_writable: bool, is_signer: bool) -> SerializableAccountMeta {
    SerializableAccountMeta {
        pubkey: *account.key,
        is_signer,
        is_writable,
    }
}

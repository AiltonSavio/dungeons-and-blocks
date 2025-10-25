use anchor_lang::prelude::*;
use hero_core::{cpi, cpi::accounts as hero_accounts, state::HeroMint};

use crate::errors::AdventureError;
use crate::state::HeroAdventureLock;

pub struct HeroSummary {
    pub owner: Pubkey,
    pub is_burned: bool,
}

pub fn read_hero_summary(account_info: &AccountInfo<'_>) -> Result<HeroSummary> {
    let data = account_info
        .try_borrow_data()
        .map_err(|_| error!(AdventureError::InvalidHeroLockAccount))?;
    require!(data.len() >= 8, AdventureError::InvalidHeroLockAccount);
    let mut cursor: &[u8] = &data[..];
    let hero = HeroMint::try_deserialize(&mut cursor)
        .map_err(|_| error!(AdventureError::InvalidHeroLockAccount))?;
    Ok(HeroSummary {
        owner: hero.owner,
        is_burned: hero.is_burned,
    })
}

pub fn load_hero_lock(account_info: &AccountInfo<'_>) -> Result<HeroAdventureLock> {
    let data = account_info
        .try_borrow_data()
        .map_err(|_| error!(AdventureError::InvalidHeroLockAccount))?;
    if data.len() < 8 {
        return Ok(HeroAdventureLock::default());
    }
    let discriminator = &data[..8];
    if discriminator.iter().all(|&b| b == 0) {
        return Ok(HeroAdventureLock::default());
    }
    let mut cursor: &[u8] = &data[8..];
    HeroAdventureLock::try_deserialize(&mut cursor)
        .map_err(|_| error!(AdventureError::InvalidHeroLockAccount))
}

pub fn store_hero_lock(account_info: &AccountInfo<'_>, value: &HeroAdventureLock) -> Result<()> {
    let mut data = account_info
        .try_borrow_mut_data()
        .map_err(|_| error!(AdventureError::InvalidHeroLockAccount))?;
    require!(
        data.len() >= HeroAdventureLock::LEN,
        AdventureError::InvalidHeroLockAccount
    );
    let discriminator = <HeroAdventureLock as anchor_lang::Discriminator>::DISCRIMINATOR;
    data[..8].copy_from_slice(&discriminator);
    let serialized = value
        .try_to_vec()
        .map_err(|_| error!(AdventureError::InvalidHeroLockAccount))?;
    require!(
        8 + serialized.len() <= data.len(),
        AdventureError::InvalidHeroLockAccount
    );
    data[8..8 + serialized.len()].copy_from_slice(&serialized);
    if 8 + serialized.len() < data.len() {
        for byte in &mut data[8 + serialized.len()..] {
            *byte = 0;
        }
    }
    Ok(())
}

pub fn lock_hero_for_adventure<'info>(
    hero_core_program: &AccountInfo<'info>,
    player: &AccountInfo<'info>,
    hero_mint: &AccountInfo<'info>,
    adventure: &AccountInfo<'info>,
    adventure_key: &Pubkey,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let accounts = hero_accounts::LockCtx {
        player: player.clone(),
        hero_mint: hero_mint.clone(),
        adventure_signer: adventure.clone(),
    };
    cpi::lock_for_adventure(
        CpiContext::new_with_signer(hero_core_program.clone(), accounts, &[signer_seeds]),
        *adventure_key,
    )
}

pub fn unlock_hero_from_adventure<'info>(
    hero_core_program: &AccountInfo<'info>,
    player: &AccountInfo<'info>,
    hero_mint: &AccountInfo<'info>,
    adventure: &AccountInfo<'info>,
    adventure_key: &Pubkey,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let accounts = hero_accounts::UnlockCtx {
        player: player.clone(),
        hero_mint: hero_mint.clone(),
        adventure_signer: adventure.clone(),
    };
    cpi::unlock_from_adventure(
        CpiContext::new_with_signer(hero_core_program.clone(), accounts, &[signer_seeds]),
        *adventure_key,
    )
}

pub fn update_hero_hp<'info>(
    hero_core_program: &AccountInfo<'info>,
    adventure: &AccountInfo<'info>,
    hero_mint: &AccountInfo<'info>,
    hero_id: u64,
    new_hp: u8,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let accounts = hero_accounts::AdventureWrite {
        adventure_signer: adventure.clone(),
        hero_mint: hero_mint.clone(),
    };
    cpi::update_hp_from_adventure(
        CpiContext::new_with_signer(hero_core_program.clone(), accounts, &[signer_seeds]),
        hero_id,
        new_hp,
    )
}

pub fn update_hero_xp<'info>(
    hero_core_program: &AccountInfo<'info>,
    adventure: &AccountInfo<'info>,
    hero_mint: &AccountInfo<'info>,
    hero_id: u64,
    xp_delta: u64,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let accounts = hero_accounts::AdventureWrite {
        adventure_signer: adventure.clone(),
        hero_mint: hero_mint.clone(),
    };
    cpi::update_xp_from_adventure(
        CpiContext::new_with_signer(hero_core_program.clone(), accounts, &[signer_seeds]),
        hero_id,
        xp_delta,
    )
}

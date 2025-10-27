use anchor_lang::prelude::*;
use hero_core::constants::{BASE_STRESS_MAX, MAX_STRESS_MAX, MIN_STRESS_MAX, STATUS_EFFECTS_COUNT};
use hero_core::state::{encode_trait_slots, HeroMint};

use crate::errors::AdventureError;
use crate::state::{HeroAdventureLock, HeroSnapshot};

pub struct HeroSummary {
    pub owner: Pubkey,
    pub is_burned: bool,
    pub snapshot: HeroSnapshot,
}

pub fn read_hero_summary(account_info: &AccountInfo<'_>) -> Result<HeroSummary> {
    let data = account_info
        .try_borrow_data()
        .map_err(|_| error!(AdventureError::InvalidHeroLockAccount))?;
    require!(data.len() >= 8, AdventureError::InvalidHeroLockAccount);
    let mut cursor: &[u8] = &data[..];
    let hero = HeroMint::try_deserialize(&mut cursor)
        .map_err(|_| error!(AdventureError::InvalidHeroLockAccount))?;
    let current_hp = hero.current_hp.min(hero.max_hp);
    let status_mask = if STATUS_EFFECTS_COUNT >= 8 {
        u8::MAX
    } else {
        (1u8 << STATUS_EFFECTS_COUNT) - 1
    };
    let mut stress_max = hero.stress_max;
    if stress_max == 0 {
        stress_max = BASE_STRESS_MAX;
    }
    stress_max = stress_max.max(MIN_STRESS_MAX).min(MAX_STRESS_MAX);
    let stress = hero.stress.min(stress_max);
    let positive_traits = encode_trait_slots(&hero.positive_traits);
    let negative_traits = encode_trait_slots(&hero.negative_traits);
    Ok(HeroSummary {
        owner: hero.owner,
        is_burned: hero.is_burned,
        snapshot: HeroSnapshot {
            hero_id: hero.id,
            hero_type: hero.hero_type,
            level: hero.level,
            experience: hero.experience,
            max_hp: hero.max_hp,
            current_hp,
            attack: hero.attack,
            defense: hero.defense,
            magic: hero.magic,
            resistance: hero.resistance,
            speed: hero.speed,
            luck: hero.luck,
            status_effects: hero.status_effects & status_mask,
            stress,
            stress_max,
            positive_traits,
            negative_traits,
        },
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

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak::hashv;

use crate::constants::{EXPERIENCE_THRESHOLDS, MAX_LEVEL, MAX_STAT_VALUE};
use crate::errors::HeroError;
use crate::state::{HeroMint, PlayerProfile, Skill, Stats};

pub fn fill_hero_from_randomness(hero: &mut HeroMint, randomness: [u8; 32]) -> Result<()> {
    let mut rng = RandomStream::new(randomness, hero.id, hero.owner);

    hero.hero_type = rng.next_in_range(8);
    hero.level = 1;
    hero.experience = 0;
    hero.status_effects = 0;

    let stats = roll_stats(hero.level, &mut rng)?;
    hero.max_hp = stats.max_hp;
    hero.current_hp = stats.max_hp;
    hero.attack = stats.attack;
    hero.defense = stats.defense;
    hero.magic = stats.magic;
    hero.resistance = stats.resistance;
    hero.speed = stats.speed;
    hero.luck = stats.luck;

    let (skill_a, skill_b) = hero_skills(hero.hero_type);
    hero.skill_1 = skill_a;
    hero.skill_2 = skill_b;

    hero.positive_quirks = Default::default();
    hero.negative_quirks = Default::default();

    hero.mint_timestamp = Clock::get()?.unix_timestamp;
    hero.last_level_up = hero.mint_timestamp;

    Ok(())
}

pub fn apply_level_up(hero: &mut HeroMint, randomness: [u8; 32]) -> Result<()> {
    let mut rng = RandomStream::new(randomness, hero.id, hero.owner);
    let level_bonus = hero.level as u32 * 5;

    hero.max_hp = grow_stat(hero.max_hp, level_bonus, &mut rng);
    hero.current_hp = hero.max_hp;
    hero.attack = grow_stat(hero.attack, level_bonus, &mut rng);
    hero.defense = grow_stat(hero.defense, level_bonus, &mut rng);
    hero.magic = grow_stat(hero.magic, level_bonus, &mut rng);
    hero.resistance = grow_stat(hero.resistance, level_bonus, &mut rng);
    hero.speed = grow_stat(hero.speed, level_bonus, &mut rng);
    hero.luck = grow_stat(hero.luck, level_bonus, &mut rng);

    Ok(())
}

pub fn experience_threshold_for_level(level: u8) -> Option<u64> {
    EXPERIENCE_THRESHOLDS.get(level as usize).copied()
}

pub fn register_soulbound(profile: &mut PlayerProfile, hero_id: u64) -> Result<()> {
    if let Some(slot) = profile
        .soulbound_hero_ids
        .iter_mut()
        .find(|entry| entry.is_none())
    {
        *slot = Some(hero_id);
    }
    Ok(())
}

pub fn unregister_soulbound(profile: &mut PlayerProfile, hero_id: u64) {
    for entry in profile.soulbound_hero_ids.iter_mut() {
        if entry.map(|id| id == hero_id).unwrap_or(false) {
            *entry = None;
        }
    }
}

fn grow_stat(current: u8, level_bonus: u32, rng: &mut RandomStream) -> u8 {
    let rand_bonus = (rng.next_u8() % 20) as u32;
    (current as u32)
        .saturating_add(level_bonus)
        .saturating_add(rand_bonus)
        .min(MAX_STAT_VALUE as u32) as u8
}

fn roll_stats(level: u8, rng: &mut RandomStream) -> Result<Stats> {
    let base_points = 200u32 + (level as u32 * 20) + (rng.next_u32() % 50);

    let mut weights: [u32; 7] = [0; 7];
    for weight in &mut weights {
        *weight = (rng.next_u8() as u32).saturating_add(1);
    }
    let total_weight: u32 = weights.iter().sum();
    require!(total_weight > 0, HeroError::MathOverflow);

    let mut stats = [0u8; 7];
    for (i, weight) in weights.iter().enumerate() {
        let mut value = ((base_points * *weight) / total_weight) as u8;
        if value > MAX_STAT_VALUE {
            value = MAX_STAT_VALUE;
        }
        stats[i] = value;
    }

    Ok(Stats {
        max_hp: stats[0],
        attack: stats[1],
        defense: stats[2],
        magic: stats[3],
        resistance: stats[4],
        speed: stats[5],
        luck: stats[6],
    })
}

fn hero_skills(hero_type: u8) -> (Skill, Skill) {
    match hero_type {
        0 => (Skill::new(0), Skill::new(1)),
        1 => (Skill::new(2), Skill::new(3)),
        2 => (Skill::new(4), Skill::new(5)),
        3 => (Skill::new(6), Skill::new(7)),
        4 => (Skill::new(8), Skill::new(9)),
        5 => (Skill::new(10), Skill::new(11)),
        6 => (Skill::new(12), Skill::new(13)),
        _ => (Skill::new(14), Skill::new(15)),
    }
}

struct RandomStream {
    seed: [u8; 32],
    counter: u64,
    buffer: [u8; 32],
    offset: usize,
}

impl RandomStream {
    fn new(seed: [u8; 32], hero_id: u64, owner: Pubkey) -> Self {
        let mix = hashv(&[&seed, &hero_id.to_le_bytes(), &owner.to_bytes()]);
        Self {
            seed: mix.0,
            counter: 0,
            buffer: [0u8; 32],
            offset: 32,
        }
    }

    fn refill(&mut self) {
        let ctr_bytes = self.counter.to_le_bytes();
        self.buffer = hashv(&[&self.seed, &ctr_bytes]).0;
        self.counter = self.counter.wrapping_add(1);
        self.offset = 0;
    }

    fn next_u8(&mut self) -> u8 {
        if self.offset >= self.buffer.len() {
            self.refill();
        }
        let value = self.buffer[self.offset];
        self.offset += 1;
        value
    }

    fn next_u32(&mut self) -> u32 {
        let mut bytes = [0u8; 4];
        for chunk in &mut bytes {
            *chunk = self.next_u8();
        }
        u32::from_le_bytes(bytes)
    }

    fn next_in_range(&mut self, upper: u8) -> u8 {
        if upper == 0 {
            0
        } else {
            self.next_u8() % upper
        }
    }
}

pub fn validate_level_up_requirements(hero: &crate::state::HeroMint) -> Result<u8> {
    require!(hero.level >= 1, HeroError::InvalidLevelProgression);
    require!(hero.level < MAX_LEVEL, HeroError::MaxLevelReached);

    let target_level = hero.level.checked_add(1).ok_or(HeroError::MathOverflow)?;
    let required_experience =
        experience_threshold_for_level(target_level).ok_or(HeroError::InvalidLevelProgression)?;
    require!(
        hero.experience > required_experience,
        HeroError::InsufficientExperience
    );

    Ok(target_level)
}

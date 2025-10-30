use crate::constants::*;
use crate::logic::Mulberry32;
use crate::state::{EnemyCombatant, HeroCombatant, HeroSnapshot, StatusInstance};

pub struct EnemyDefinition {
    pub kind: u8,
    pub max_hp: u16,
    pub attack: u16,
    pub defense: u16,
    pub magic: u16,
    pub resistance: u16,
    pub speed: u16,
    pub luck: u16,
}

const ENEMY_DEFINITIONS: [EnemyDefinition; 11] = [
    EnemyDefinition {
        kind: 0,
        max_hp: 86,
        attack: 18,
        defense: 15,
        magic: 8,
        resistance: 12,
        speed: 9,
        luck: 7,
    },
    EnemyDefinition {
        kind: 1,
        max_hp: 70,
        attack: 16,
        defense: 14,
        magic: 6,
        resistance: 11,
        speed: 8,
        luck: 6,
    },
    EnemyDefinition {
        kind: 2,
        max_hp: 78,
        attack: 19,
        defense: 13,
        magic: 7,
        resistance: 10,
        speed: 10,
        luck: 7,
    },
    EnemyDefinition {
        kind: 3,
        max_hp: 74,
        attack: 17,
        defense: 13,
        magic: 9,
        resistance: 12,
        speed: 11,
        luck: 8,
    },
    EnemyDefinition {
        kind: 4,
        max_hp: 60,
        attack: 14,
        defense: 11,
        magic: 6,
        resistance: 9,
        speed: 10,
        luck: 9,
    },
    EnemyDefinition {
        kind: 5,
        max_hp: 80,
        attack: 18,
        defense: 14,
        magic: 6,
        resistance: 11,
        speed: 10,
        luck: 8,
    },
    EnemyDefinition {
        kind: 6,
        max_hp: 62,
        attack: 15,
        defense: 10,
        magic: 6,
        resistance: 8,
        speed: 11,
        luck: 9,
    },
    EnemyDefinition {
        kind: 7,
        max_hp: 58,
        attack: 14,
        defense: 9,
        magic: 7,
        resistance: 9,
        speed: 12,
        luck: 10,
    },
    EnemyDefinition {
        kind: 8,
        max_hp: 52,
        attack: 12,
        defense: 8,
        magic: 5,
        resistance: 7,
        speed: 7,
        luck: 6,
    },
    EnemyDefinition {
        kind: 9,
        max_hp: 88,
        attack: 20,
        defense: 14,
        magic: 8,
        resistance: 12,
        speed: 9,
        luck: 6,
    },
    EnemyDefinition {
        kind: 10,
        max_hp: 64,
        attack: 17,
        defense: 11,
        magic: 7,
        resistance: 9,
        speed: 13,
        luck: 9,
    },
];

pub fn convert_hero_snapshot(snapshot: &HeroSnapshot, index: usize, torch: u8) -> HeroCombatant {
    let mut hero = HeroCombatant {
        hero_index: index as u8,
        alive: snapshot.current_hp > 0,
        ap: HERO_AP_MAX,
        hp: convert_hp(snapshot.current_hp, snapshot.level),
        max_hp: convert_hp(snapshot.max_hp, snapshot.level),
        attack: convert_core_stat(snapshot.attack),
        defense: convert_core_stat(snapshot.defense),
        magic: convert_core_stat(snapshot.magic),
        resistance: convert_core_stat(snapshot.resistance),
        speed: convert_core_stat(snapshot.speed),
        luck: convert_core_stat(snapshot.luck),
        stress: snapshot.stress,
        kill_streak: 0,
        guard: false,
        statuses: [StatusInstance::default(); MAX_STATUS_PER_COMBATANT],
        pending_xp: 0,
        pending_positive_traits: 0,
        pending_negative_traits: 0,
    };

    apply_hero_torch_bonuses(&mut hero, torch);
    hero.hp = hero.hp.min(hero.max_hp);
    if !hero.alive {
        hero.hp = 0;
    }
    hero
}

pub fn spawn_enemy(kind: u8, torch: u8) -> EnemyCombatant {
    let def = get_enemy_definition(kind);
    let mut enemy = EnemyCombatant {
        kind,
        alive: true,
        ap: ENEMY_AP_MAX,
        hp: apply_enemy_torch_hp(def.max_hp, torch),
        max_hp: apply_enemy_torch_hp(def.max_hp, torch),
        attack: apply_enemy_torch_offense(def.attack, torch),
        defense: apply_enemy_torch_defense(def.defense, torch),
        magic: apply_enemy_torch_offense(def.magic, torch),
        resistance: apply_enemy_torch_defense(def.resistance, torch),
        speed: apply_enemy_torch_speed(def.speed, torch),
        luck: apply_enemy_torch_luck(def.luck, torch),
        statuses: [StatusInstance::default(); MAX_STATUS_PER_COMBATANT],
        threat: 0,
    };

    // Nerf enemy stats by 25%
    enemy.max_hp = enemy.max_hp * 75 / 100;
    enemy.hp = enemy.hp.min(enemy.max_hp);
    enemy.attack = enemy.attack * 75 / 100;
    enemy.defense = enemy.defense * 75 / 100;
    enemy.magic = enemy.magic * 75 / 100;
    enemy.resistance = enemy.resistance * 75 / 100;

    enemy
}

pub fn select_enemy_party(seed: u64, torch: u8) -> ([EnemyCombatant; MAX_ENEMIES], u8, u64) {
    let folded = (seed as u32) ^ ((seed >> 32) as u32);
    let mut rng = Mulberry32::new(folded);

    let extra = if torch <= 33 {
        2
    } else if torch <= 66 {
        1
    } else {
        0
    };
    let base = 2 + (rng.next_u32() % 2) as u8;
    let enemy_count = (base + extra).min(MAX_ENEMIES as u8).max(1);

    let mut enemies = [EnemyCombatant::default(); MAX_ENEMIES];
    for i in 0..enemy_count {
        let kind = (rng.next_u32() as usize) % ENEMY_DEFINITIONS.len();
        enemies[i as usize] = spawn_enemy(kind as u8, torch);
    }

    let next_state = ((rng.next_u32() as u64) << 32) ^ seed.rotate_left(7);
    (enemies, enemy_count, next_state)
}

fn get_enemy_definition(kind: u8) -> &'static EnemyDefinition {
    let idx = (kind as usize) % ENEMY_DEFINITIONS.len();
    &ENEMY_DEFINITIONS[idx]
}

fn convert_hp(value: u8, level: u8) -> u16 {
    let base = 18u16 + (level as u16 * 6);
    base + (value as u16 * 4 / 5)
}

fn convert_core_stat(value: u8) -> u16 {
    8 + ((value as u16 * 20) / 100)
}

fn apply_hero_torch_bonuses(hero: &mut HeroCombatant, torch: u8) {
    if torch <= 33 {
        hero.attack = scale_up(hero.attack, 15);
        hero.defense = scale_up(hero.defense, 12);
        hero.magic = scale_up(hero.magic, 15);
        hero.resistance = scale_up(hero.resistance, 12);
        hero.speed = scale_up(hero.speed, 10);
        hero.luck = scale_up(hero.luck, 10);
    } else if torch <= 66 {
        hero.attack = scale_up(hero.attack, 8);
        hero.defense = scale_up(hero.defense, 6);
        hero.magic = scale_up(hero.magic, 8);
        hero.resistance = scale_up(hero.resistance, 6);
        hero.speed = scale_up(hero.speed, 5);
        hero.luck = scale_up(hero.luck, 5);
    }
}

fn apply_enemy_torch_hp(value: u16, torch: u8) -> u16 {
    if torch <= 20 {
        scale_up(value, 18)
    } else if torch <= 50 {
        scale_up(value, 8)
    } else {
        value
    }
}

fn apply_enemy_torch_offense(value: u16, torch: u8) -> u16 {
    if torch <= 33 {
        scale_up(value, 18)
    } else if torch <= 66 {
        scale_up(value, 10)
    } else {
        value
    }
}

fn apply_enemy_torch_defense(value: u16, torch: u8) -> u16 {
    if torch <= 33 {
        scale_up(value, 12)
    } else if torch <= 66 {
        scale_up(value, 6)
    } else {
        value
    }
}

fn apply_enemy_torch_speed(value: u16, torch: u8) -> u16 {
    if torch <= 33 {
        scale_up(value, 12)
    } else {
        value
    }
}

fn apply_enemy_torch_luck(value: u16, torch: u8) -> u16 {
    if torch <= 20 {
        scale_up(value, 14)
    } else {
        value
    }
}

fn scale_up(value: u16, percent: u16) -> u16 {
    let bonus = value.saturating_mul(percent) / 100;
    value.saturating_add(bonus.max(1))
}

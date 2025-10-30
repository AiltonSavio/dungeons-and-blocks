use anchor_lang::prelude::AccountsClose;
use anchor_lang::prelude::*;

use crate::combat::{convert_hero_snapshot, select_enemy_party};
use crate::constants::{
    ENEMY_AP_MAX, HERO_AP_MAX, MAX_COMBATANTS, MAX_ENEMIES, MAX_ITEMS, MAX_PARTY,
    MAX_STATUS_PER_COMBATANT,
};
use crate::errors::AdventureError;
use crate::state::{
    AdventureCombat, AdventureSession, CombatResolutionState, CombatantKind, EnemyCombatant,
    HeroCombatant, HeroSnapshot, InitiativeSlot, ItemSlot, StatusEffect, StatusInstance,
};
use crate::{BeginEncounter, ConcludeCombat, DeclineEncounter, SubmitCombatAction};

const CRIT_MULTIPLIER_PERCENT: u16 = 150;
const BASE_CRIT_PERCENT: u16 = 5;
const CRIT_PER_LUCK_BPS: u16 = 50; // 0.5% per luck point
const MAX_CRIT_PERCENT: u16 = 60;

#[derive(Clone, Copy)]
struct AbilitySpec {
    cost: u8,
    #[allow(dead_code)]
    kind: HeroActionKind,
    damage_type: DamageType,
    power_percent: u16,
    status: Option<StatusApplication>,
    #[allow(dead_code)]
    target: Targeting,
}

#[derive(Clone, Copy)]
struct StatusApplication {
    effect: StatusEffect,
    base_duration: u8,
    stacks: u8,
    resist_modifier: i16,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum DamageType {
    Physical,
    Magical,
    Heal,
    Support,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Targeting {
    Enemy,
    Ally,
    SelfOnly,
    #[allow(dead_code)]
    None,
}

// Hero type order follows hero-core generation table.
const HERO_ABILITY_SETS: [HeroAbilitySet; 8] = [
    // Archer
    HeroAbilitySet {
        skill1: AbilitySpec {
            cost: 2,
            kind: HeroActionKind::Skill1,
            damage_type: DamageType::Physical,
            power_percent: 165,
            status: None,
            target: Targeting::Enemy,
        },
        skill2: AbilitySpec {
            cost: 3,
            kind: HeroActionKind::Skill2,
            damage_type: DamageType::Physical,
            power_percent: 150,
            status: Some(StatusApplication {
                effect: StatusEffect::Poison,
                base_duration: 4,
                stacks: 1,
                resist_modifier: 0,
            }),
            target: Targeting::Enemy,
        },
    },
    // Armored Axeman
    HeroAbilitySet {
        skill1: AbilitySpec {
            cost: 2,
            kind: HeroActionKind::Skill1,
            damage_type: DamageType::Physical,
            power_percent: 175,
            status: None,
            target: Targeting::Enemy,
        },
        skill2: AbilitySpec {
            cost: 3,
            kind: HeroActionKind::Skill2,
            damage_type: DamageType::Physical,
            power_percent: 185,
            status: Some(StatusApplication {
                effect: StatusEffect::Bleed,
                base_duration: 3,
                stacks: 1,
                resist_modifier: -5,
            }),
            target: Targeting::Enemy,
        },
    },
    // Knight
    HeroAbilitySet {
        skill1: AbilitySpec {
            cost: 2,
            kind: HeroActionKind::Skill1,
            damage_type: DamageType::Physical,
            power_percent: 170,
            status: None,
            target: Targeting::Enemy,
        },
        skill2: AbilitySpec {
            cost: 3,
            kind: HeroActionKind::Skill2,
            damage_type: DamageType::Physical,
            power_percent: 180,
            status: Some(StatusApplication {
                effect: StatusEffect::Burn,
                base_duration: 3,
                stacks: 1,
                resist_modifier: -5,
            }),
            target: Targeting::Enemy,
        },
    },
    // Knight Templar
    HeroAbilitySet {
        skill1: AbilitySpec {
            cost: 2,
            kind: HeroActionKind::Skill1,
            damage_type: DamageType::Physical,
            power_percent: 180,
            status: None,
            target: Targeting::Enemy,
        },
        skill2: AbilitySpec {
            cost: 3,
            kind: HeroActionKind::Skill2,
            damage_type: DamageType::Physical,
            power_percent: 190,
            status: Some(StatusApplication {
                effect: StatusEffect::Bleed,
                base_duration: 3,
                stacks: 1,
                resist_modifier: -5,
            }),
            target: Targeting::Enemy,
        },
    },
    // Priest
    HeroAbilitySet {
        skill1: AbilitySpec {
            cost: 2,
            kind: HeroActionKind::Skill1,
            damage_type: DamageType::Magical,
            power_percent: 160,
            status: None,
            target: Targeting::Enemy,
        },
        skill2: AbilitySpec {
            cost: 3,
            kind: HeroActionKind::Skill2,
            damage_type: DamageType::Heal,
            power_percent: 0,
            status: None,
            target: Targeting::Ally,
        },
    },
    // Soldier
    HeroAbilitySet {
        skill1: AbilitySpec {
            cost: 2,
            kind: HeroActionKind::Skill1,
            damage_type: DamageType::Physical,
            power_percent: 170,
            status: None,
            target: Targeting::Enemy,
        },
        skill2: AbilitySpec {
            cost: 3,
            kind: HeroActionKind::Skill2,
            damage_type: DamageType::Physical,
            power_percent: 180,
            status: Some(StatusApplication {
                effect: StatusEffect::Poison,
                base_duration: 4,
                stacks: 1,
                resist_modifier: 0,
            }),
            target: Targeting::Enemy,
        },
    },
    // Swordsman
    HeroAbilitySet {
        skill1: AbilitySpec {
            cost: 2,
            kind: HeroActionKind::Skill1,
            damage_type: DamageType::Physical,
            power_percent: 180,
            status: None,
            target: Targeting::Enemy,
        },
        skill2: AbilitySpec {
            cost: 3,
            kind: HeroActionKind::Skill2,
            damage_type: DamageType::Physical,
            power_percent: 205,
            status: None,
            target: Targeting::Enemy,
        },
    },
    // Wizard
    HeroAbilitySet {
        skill1: AbilitySpec {
            cost: 2,
            kind: HeroActionKind::Skill1,
            damage_type: DamageType::Magical,
            power_percent: 170,
            status: Some(StatusApplication {
                effect: StatusEffect::Chill,
                base_duration: 2,
                stacks: 1,
                resist_modifier: 0,
            }),
            target: Targeting::Enemy,
        },
        skill2: AbilitySpec {
            cost: 3,
            kind: HeroActionKind::Skill2,
            damage_type: DamageType::Magical,
            power_percent: 190,
            status: Some(StatusApplication {
                effect: StatusEffect::Burn,
                base_duration: 3,
                stacks: 1,
                resist_modifier: 0,
            }),
            target: Targeting::Enemy,
        },
    },
];

#[derive(Clone, Copy)]
struct HeroAbilitySet {
    skill1: AbilitySpec,
    skill2: AbilitySpec,
}

#[derive(Clone, Copy)]
struct EnemyAbilitySet {
    basic: AbilitySpec,
    skill1: AbilitySpec,
    skill2: AbilitySpec,
}

const ENEMY_ABILITY_SETS: [EnemyAbilitySet; 11] = [
    // Armored Orc
    EnemyAbilitySet {
        basic: ability_enemy_physical(120, None),
        skill1: ability_enemy_physical(150, None),
        skill2: ability_enemy_physical(
            155,
            Some(StatusApplication {
                effect: StatusEffect::Chill,
                base_duration: 2,
                stacks: 1,
                resist_modifier: 0,
            }),
        ),
    },
    // Armored Skeleton
    EnemyAbilitySet {
        basic: ability_enemy_physical(125, None),
        skill1: ability_enemy_physical(160, None),
        skill2: ability_enemy_physical(
            165,
            Some(StatusApplication {
                effect: StatusEffect::Bleed,
                base_duration: 3,
                stacks: 1,
                resist_modifier: -5,
            }),
        ),
    },
    // Elite Orc
    EnemyAbilitySet {
        basic: ability_enemy_physical(135, None),
        skill1: ability_enemy_physical(160, None),
        skill2: ability_enemy_physical(
            175,
            Some(StatusApplication {
                effect: StatusEffect::Bleed,
                base_duration: 3,
                stacks: 1,
                resist_modifier: -5,
            }),
        ),
    },
    // Greatsword Skeleton
    EnemyAbilitySet {
        basic: ability_enemy_physical(125, None),
        skill1: ability_enemy_physical(165, None),
        skill2: ability_enemy_physical(170, None),
    },
    // Orc
    EnemyAbilitySet {
        basic: ability_enemy_physical(120, None),
        skill1: ability_enemy_physical(145, None),
        skill2: ability_enemy_physical(165, None),
    },
    // Orc Rider
    EnemyAbilitySet {
        basic: ability_enemy_physical(140, None),
        skill1: ability_enemy_physical(155, None),
        skill2: ability_enemy_physical(165, None),
    },
    // Skeleton (Sword)
    EnemyAbilitySet {
        basic: ability_enemy_physical(120, None),
        skill1: ability_enemy_physical(145, None),
        skill2: ability_enemy_physical(160, None),
    },
    // Skeleton (Bow)
    EnemyAbilitySet {
        basic: ability_enemy_physical(110, None),
        skill1: ability_enemy_physical(135, None),
        skill2: ability_enemy_physical(155, None),
    },
    // Slime
    EnemyAbilitySet {
        basic: ability_enemy_physical(110, None),
        skill1: ability_enemy_physical(125, None),
        skill2: ability_enemy_physical(140, None),
    },
    // Werebear
    EnemyAbilitySet {
        basic: ability_enemy_physical(140, None),
        skill1: ability_enemy_physical(165, None),
        skill2: ability_enemy_physical(175, None),
    },
    // Werewolf
    EnemyAbilitySet {
        basic: ability_enemy_physical(130, None),
        skill1: ability_enemy_physical(155, None),
        skill2: ability_enemy_physical(170, None),
    },
];

const fn ability_enemy_physical(
    power_percent: u16,
    status: Option<StatusApplication>,
) -> AbilitySpec {
    AbilitySpec {
        cost: 1,
        kind: HeroActionKind::Attack,
        damage_type: DamageType::Physical,
        power_percent,
        status,
        target: Targeting::Enemy,
    }
}

pub fn begin_encounter(ctx: Context<BeginEncounter>) -> Result<()> {
    let adventure = &mut ctx.accounts.adventure;
    let combat = &mut ctx.accounts.combat;
    let owner = ctx.accounts.owner.key();
    let authority = ctx.accounts.authority.key();

    require_keys_eq!(
        adventure.player,
        owner,
        AdventureError::AdventureOwnerMismatch
    );
    let is_authorized = authority == owner || adventure.delegate == Some(authority);
    require!(is_authorized, AdventureError::Unauthorized);

    require!(!adventure.in_combat, AdventureError::CombatAlreadyActive);
    require!(
        adventure.pending_encounter_seed != 0,
        AdventureError::NoPendingEncounter
    );
    require!(
        adventure.combat_account == Pubkey::default(),
        AdventureError::CombatAlreadyActive
    );

    let hero_count = adventure.hero_count.min(MAX_PARTY as u8);
    require!(hero_count > 0, AdventureError::InvalidHeroCount);

    combat.adventure = adventure.key();
    combat.bump = ctx.bumps.combat;
    combat.active = true;
    combat.round = 1;
    combat.turn_cursor = 0;
    combat.torch = adventure.torch;
    combat.hero_count = hero_count;

    let (enemies, enemy_count, next_state) =
        select_enemy_party(adventure.pending_encounter_seed, adventure.torch);
    combat.enemies = enemies;
    combat.enemy_count = enemy_count;
    combat.rng_state = next_state;
    combat.loot_seed = adventure.pending_encounter_seed;
    combat.pending_resolution = CombatResolutionState::Active;
    combat.last_updated = Clock::get()?.unix_timestamp;

    // Populate hero combatants
    for idx in 0..MAX_PARTY {
        if (idx as u8) < hero_count {
            let snapshot = adventure.hero_snapshots[idx];
            combat.heroes[idx] = convert_hero_snapshot(&snapshot, idx, adventure.torch);
        } else {
            combat.heroes[idx] = HeroCombatant::default();
        }
    }

    // Ensure unused enemy slots are cleared
    for idx in enemy_count as usize..MAX_ENEMIES {
        combat.enemies[idx] = EnemyCombatant::default();
    }

    let hero_snapshot = combat.heroes;
    let enemy_snapshot = combat.enemies;
    let hero_count = combat.hero_count;
    let enemy_count = combat.enemy_count;
    combat.initiative_len = build_initiative_order(
        &mut combat.initiative,
        &hero_snapshot,
        &enemy_snapshot,
        hero_count,
        enemy_count,
    );

    adventure.combat_account = combat.key();
    adventure.pending_encounter_seed = 0;
    adventure.in_combat = true;

    Ok(())
}

pub fn submit_combat_action(
    ctx: Context<SubmitCombatAction>,
    instruction: CombatInstruction,
) -> Result<()> {
    let adventure = &mut ctx.accounts.adventure;
    let combat = &mut ctx.accounts.combat;
    let owner = ctx.accounts.owner.key();
    let authority = ctx.accounts.authority.key();

    require_keys_eq!(
        adventure.player,
        owner,
        AdventureError::AdventureOwnerMismatch
    );
    let is_authorized = authority == owner || adventure.delegate == Some(authority);
    require!(is_authorized, AdventureError::Unauthorized);
    require!(combat.active, AdventureError::CombatNotActive);
    require!(
        matches!(combat.pending_resolution, CombatResolutionState::Active),
        AdventureError::CombatNotActive
    );

    combat.last_updated = Clock::get()?.unix_timestamp;

    let mut turn_slot;
    let mut occupant_kind;
    let mut occupant_index;

    loop {
        let actor = current_actor(combat).ok_or(AdventureError::CombatNotActive)?;
        turn_slot = actor.0;
        occupant_kind = actor.1;
        occupant_index = actor.2;

        msg!(
            "Current actor: slot={}, kind={:?}, index={}, hero_index_requested={}",
            turn_slot,
            occupant_kind,
            occupant_index,
            instruction.hero_index
        );

        if occupant_kind != CombatantKind::Hero {
            // Auto-resolve enemy status ticks even if no hero input queued.
            execute_enemy_auto_turn(adventure, combat, occupant_index as usize)?;
            if !matches!(combat.pending_resolution, CombatResolutionState::Active) {
                return Ok(());
            }
            continue;
        }
        break;
    }

    require!(
        occupant_index == instruction.hero_index,
        AdventureError::NotHeroTurn
    );

    let hero_index = occupant_index as usize;

    msg!(
        "Executing hero action: hero={}, action={:?}, target={:?}",
        hero_index,
        instruction.action,
        instruction.target
    );

    let start = start_hero_turn(combat, hero_index);
    {
        let hero = &mut combat.heroes[hero_index];
        if !start.alive {
            hero.alive = false;
            mark_hero_dead(combat, hero_index as u8);
            if check_defeat(combat) {
                return Ok(());
            }
            advance_turn_pointer(combat, turn_slot);
            return Ok(());
        }
        if start.chill_stacks == 0 {
            hero.ap = hero.ap.saturating_add(1).min(HERO_AP_MAX);
        }
    }

    execute_hero_action(adventure, combat, instruction, start.chill_stacks)?;
    if check_victory(combat) {
        return Ok(());
    }

    advance_turn_pointer(combat, turn_slot);

    while matches!(combat.pending_resolution, CombatResolutionState::Active) {
        if check_defeat(combat) || check_victory(combat) {
            break;
        }
        let Some((slot_idx, kind, idx)) = current_actor(combat) else {
            break;
        };
        if kind == CombatantKind::Hero {
            break;
        }
        execute_enemy_auto_turn(adventure, combat, idx as usize)?;
        if matches!(combat.pending_resolution, CombatResolutionState::Active) {
            advance_turn_pointer(combat, slot_idx);
        } else {
            break;
        }
    }

    Ok(())
}

// XP rewards per enemy type (11 enemy types)
const ENEMY_XP_TABLE: [u32; 11] = [
    50, // Armored Orc
    45, // Armored Skeleton
    60, // Elite Orc
    55, // Greatsword Skeleton
    35, // Orc
    50, // Orc Rider
    30, // Skeleton (Sword)
    28, // Skeleton (Bow)
    25, // Slime
    70, // Werebear
    65, // Werewolf
];

// Loot table: (item_key, base_chance_bps, quantity)
const LOOT_TABLE: [(u8, u16, u16); 7] = [
    (0, 2500, 50), // PouchGold - 25% chance, 50 gold
    (1, 800, 1),   // StressTonic - 8% chance
    (2, 1500, 1),  // MinorTorch - 15% chance
    (3, 1200, 1),  // HealingSalve - 12% chance
    (4, 300, 1),   // MysteryRelic - 3% chance
    (5, 600, 1),   // CalmingIncense - 6% chance
    (6, 100, 1),   // PhoenixFeather - 1% chance
];

fn calculate_enemy_xp(enemy_kind: u8) -> u32 {
    ENEMY_XP_TABLE
        .get(enemy_kind as usize)
        .copied()
        .unwrap_or(30)
}

fn add_pending_loot(
    adventure: &mut AdventureSession,
    _combat: &mut AdventureCombat,
    item_key: u8,
    quantity: u16,
) {
    if adventure.pending_loot_count >= MAX_ITEMS as u8 {
        return; // Loot full
    }

    // Check if item already exists in pending loot
    for slot in adventure.pending_loot.iter_mut() {
        if slot.item_key == item_key {
            slot.quantity = slot.quantity.saturating_add(quantity);
            return;
        }
    }

    // Add new item to first empty slot
    for (idx, slot) in adventure.pending_loot.iter_mut().enumerate() {
        if slot.item_key == ItemSlot::EMPTY {
            *slot = ItemSlot { item_key, quantity };
            adventure.pending_loot_count = (idx + 1).min(MAX_ITEMS) as u8;
            return;
        }
    }
}

fn apply_trait_to_hero(snapshot: &mut HeroSnapshot, trait_value: u8, is_positive: bool) -> bool {
    use hero_core::constants::TRAIT_NONE_VALUE;

    let trait_array = if is_positive {
        &mut snapshot.positive_traits
    } else {
        &mut snapshot.negative_traits
    };

    // Check if trait already exists
    for existing in trait_array.iter() {
        if *existing == trait_value {
            return false; // Already has this trait
        }
    }

    // Find first empty slot
    for slot in trait_array.iter_mut() {
        if *slot == TRAIT_NONE_VALUE {
            *slot = trait_value;
            return true;
        }
    }

    false // No empty slots
}

pub fn conclude_combat(ctx: Context<ConcludeCombat>) -> Result<()> {
    let adventure = &mut ctx.accounts.adventure;
    let combat = &mut ctx.accounts.combat;
    let owner = ctx.accounts.owner.key();
    let authority = ctx.accounts.authority.key();

    require!(
        adventure.combat_account == combat.key(),
        AdventureError::InvalidCombatAccount
    );
    require!(
        matches!(
            combat.pending_resolution,
            CombatResolutionState::Victory
                | CombatResolutionState::Defeat
                | CombatResolutionState::Escape
        ),
        AdventureError::CombatNotResolved
    );
    let is_authorized = authority == owner || adventure.delegate == Some(authority);
    require!(is_authorized, AdventureError::Unauthorized);

    let hero_count = combat.hero_count.min(MAX_PARTY as u8) as usize;
    let is_victory = matches!(combat.pending_resolution, CombatResolutionState::Victory);

    // Calculate total XP from defeated enemies (only on victory)
    let mut total_enemy_xp = 0u32;
    if is_victory {
        for enemy in combat.enemies.iter().take(combat.enemy_count as usize) {
            if !enemy.alive {
                total_enemy_xp = total_enemy_xp.saturating_add(calculate_enemy_xp(enemy.kind));
            }
        }

        // Apply torch bonus (low torch = +20% XP)
        if combat.torch <= 33 {
            let bonus = total_enemy_xp / 5; // 20% bonus
            total_enemy_xp = total_enemy_xp.saturating_add(bonus);
        }
    }

    // Update hero snapshots with HP, stress, XP, and traits
    for idx in 0..hero_count {
        let combatant = combat.heroes[idx];
        let snapshot = &mut adventure.hero_snapshots[idx];

        // Update HP
        let clamped_hp = combatant.hp.min(combatant.max_hp).min(u8::MAX as u16) as u8;
        snapshot.current_hp = if combatant.alive { clamped_hp } else { 0 };

        // Update stress
        snapshot.stress = combatant.stress.min(snapshot.stress_max);

        // Award XP if victory and hero survived
        if is_victory && combatant.alive {
            let hero_xp = combatant.pending_xp.saturating_add(total_enemy_xp);
            snapshot.experience = snapshot.experience.saturating_add(hero_xp as u64);
        }

        // Apply pending positive traits
        if combatant.pending_positive_traits > 0 {
            // Brave trait (example - trait value 1)
            apply_trait_to_hero(snapshot, 1, true);
        }

        // Apply pending negative traits
        if combatant.pending_negative_traits > 0 {
            // Fearful trait (example - trait value 1)
            apply_trait_to_hero(snapshot, 1, false);
        }
    }

    // Generate loot on victory
    if is_victory {
        for (item_key, chance_bps, quantity) in LOOT_TABLE.iter() {
            let roll = rand_percent(combat);
            if roll < *chance_bps {
                add_pending_loot(adventure, combat, *item_key, *quantity);
            }
        }

        // Extra loot roll if low torch
        if combat.torch <= 20 {
            let roll = (rand_u32(combat) % LOOT_TABLE.len() as u32) as usize;
            if let Some((item_key, _, quantity)) = LOOT_TABLE.get(roll) {
                add_pending_loot(adventure, combat, *item_key, *quantity);
            }
        }
    }

    // Reset combat status on adventure
    adventure.in_combat = false;
    adventure.combat_account = Pubkey::default();
    adventure.pending_encounter_seed = 0;

    combat.active = false;

    // Close combat account back to adventure owner
    combat.close(ctx.accounts.owner.to_account_info())?;

    Ok(())
}

pub fn decline_encounter(ctx: Context<DeclineEncounter>) -> Result<()> {
    let adventure = &mut ctx.accounts.adventure;
    let owner = ctx.accounts.owner.key();
    let authority = ctx.accounts.authority.key();

    require_keys_eq!(
        adventure.player,
        owner,
        AdventureError::AdventureOwnerMismatch
    );
    let is_authorized = authority == owner || adventure.delegate == Some(authority);
    require!(is_authorized, AdventureError::Unauthorized);

    require!(
        adventure.pending_encounter_seed != 0,
        AdventureError::NoPendingEncounter
    );

    // Clear the pending encounter - player declined to fight
    adventure.pending_encounter_seed = 0;

    Ok(())
}

fn build_initiative_order(
    slots: &mut [InitiativeSlot; MAX_COMBATANTS],
    heroes: &[HeroCombatant; MAX_PARTY],
    enemies: &[EnemyCombatant; MAX_ENEMIES],
    hero_count: u8,
    enemy_count: u8,
) -> u8 {
    let mut temp = [InitiativeSlot::default(); MAX_COMBATANTS];
    let mut len: usize = 0;

    for idx in 0..hero_count as usize {
        let hero = heroes[idx];
        if !hero.alive {
            continue;
        }
        temp[len] = InitiativeSlot {
            occupant_kind: CombatantKind::Hero,
            index: idx as u8,
            initiative_value: hero.speed as i16,
            order: len as u8,
            active: true,
        };
        len += 1;
    }

    for idx in 0..enemy_count as usize {
        let enemy = enemies[idx];
        if !enemy.alive {
            continue;
        }
        temp[len] = InitiativeSlot {
            occupant_kind: CombatantKind::Enemy,
            index: idx as u8,
            initiative_value: enemy.speed as i16,
            order: len as u8,
            active: true,
        };
        len += 1;
    }

    temp[..len].sort_by(|a, b| {
        b.initiative_value
            .cmp(&a.initiative_value)
            .then_with(|| (a.occupant_kind as u8).cmp(&(b.occupant_kind as u8)))
            .then_with(|| a.index.cmp(&b.index))
    });

    for (order, slot) in temp.iter_mut().enumerate().take(len) {
        slot.order = order as u8;
    }

    for idx in 0..MAX_COMBATANTS {
        slots[idx] = if idx < len {
            temp[idx]
        } else {
            InitiativeSlot::default()
        };
    }

    len as u8
}

fn current_actor(combat: &mut AdventureCombat) -> Option<(usize, CombatantKind, u8)> {
    let len = combat.initiative_len as usize;
    if len == 0 {
        return None;
    }

    msg!(
        "Finding actor: turn_cursor={}, initiative_len={}, round={}",
        combat.turn_cursor,
        combat.initiative_len,
        combat.round
    );

    let mut cursor = (combat.turn_cursor as usize) % len;
    for attempt in 0..len {
        let slot = combat.initiative[cursor];
        msg!(
            "Checking slot[{}]: active={}, kind={:?}, index={}, alive_check={}",
            cursor,
            slot.active,
            slot.occupant_kind,
            slot.index,
            attempt
        );

        if !slot.active {
            cursor = (cursor + 1) % len;
            continue;
        }
        match slot.occupant_kind {
            CombatantKind::Hero => {
                let hero = combat.heroes[slot.index as usize];
                if hero.alive {
                    combat.turn_cursor = cursor as u8;
                    return Some((cursor, CombatantKind::Hero, slot.index));
                } else {
                    combat.initiative[cursor].active = false;
                }
            }
            CombatantKind::Enemy => {
                let enemy = combat.enemies[slot.index as usize];
                if enemy.alive {
                    combat.turn_cursor = cursor as u8;
                    return Some((cursor, CombatantKind::Enemy, slot.index));
                } else {
                    combat.initiative[cursor].active = false;
                }
            }
            CombatantKind::None => {
                combat.initiative[cursor].active = false;
            }
        }
        cursor = (cursor + 1) % len;
    }
    None
}

fn advance_turn_pointer(combat: &mut AdventureCombat, current_slot: usize) {
    if combat.initiative_len == 0 {
        return;
    }
    let len = combat.initiative_len as usize;
    let next = (current_slot + 1) % len;
    msg!(
        "Advancing turn: current_slot={}, next={}, round={}, will_increment_round={}",
        current_slot,
        next,
        combat.round,
        next == 0
    );
    if next == 0 {
        combat.round = combat.round.saturating_add(1);
    }
    combat.turn_cursor = next as u8;
}

fn execute_hero_action(
    adventure: &mut AdventureSession,
    combat: &mut AdventureCombat,
    instruction: CombatInstruction,
    _chill_stacks: u8,
) -> Result<()> {
    let hero_index = instruction.hero_index as usize;
    require!(
        hero_index < combat.hero_count as usize,
        AdventureError::HeroIndexOutOfRange
    );

    let mut hero = combat.heroes[hero_index];
    require!(hero.alive, AdventureError::HeroNotAlive);

    let hero_type = adventure.hero_snapshots[hero_index].hero_type;
    let ability = match instruction.action {
        HeroActionKind::Skill1 | HeroActionKind::Skill2 | HeroActionKind::Attack => {
            hero_skill(hero_type, instruction.action)
        }
        HeroActionKind::Defend => AbilitySpec {
            cost: 0,
            kind: HeroActionKind::Defend,
            damage_type: DamageType::Support,
            power_percent: 0,
            status: Some(StatusApplication {
                effect: StatusEffect::Guard,
                base_duration: 2,
                stacks: 1,
                resist_modifier: 0,
            }),
            target: Targeting::SelfOnly,
        },
        HeroActionKind::UseItem => AbilitySpec {
            cost: 1,
            kind: HeroActionKind::UseItem,
            damage_type: DamageType::Support,
            power_percent: 0,
            status: None,
            target: Targeting::Ally,
        },
    };

    require!(
        hero.ap >= ability.cost,
        AdventureError::InsufficientActionPoints
    );

    match instruction.action {
        HeroActionKind::Attack | HeroActionKind::Skill1 | HeroActionKind::Skill2 => {
            match ability.damage_type {
                DamageType::Heal => {
                    let target_index = match instruction.target {
                        TargetSelector::Ally(ix) => ix as usize,
                        TargetSelector::None => hero_index,
                        _ => hero_index,
                    };
                    require!(
                        target_index < combat.hero_count as usize,
                        AdventureError::HeroIndexOutOfRange
                    );
                    let heal_variance = rand_range(combat, 8, 18);
                    let target = combat
                        .heroes
                        .get_mut(target_index)
                        .ok_or(AdventureError::InvalidTarget)?;
                    let heal_amount = (hero.magic as u16).saturating_mul(160) / 100 + heal_variance;
                    target.hp = target.hp.saturating_add(heal_amount).min(target.max_hp);
                    target.alive = target.hp > 0;
                    hero.kill_streak = 0;
                }
                _ => {
                    if check_victory(combat) {
                        return Ok(());
                    }

                    let mut target_idx = match instruction.target {
                        TargetSelector::Enemy(ix) => ix as usize,
                        _ => usize::MAX,
                    };
                    if target_idx >= combat.enemy_count as usize {
                        target_idx = usize::MAX;
                    }
                    if target_idx == usize::MAX || !combat.enemies[target_idx].alive {
                        if let Some(alive_idx) = first_alive_enemy_index(combat) {
                            target_idx = alive_idx;
                        } else {
                            combat.pending_resolution = CombatResolutionState::Victory;
                            combat.active = false;
                            return Ok(());
                        }
                    }

                    msg!(
                        "Targeting enemy: requested_idx={:?}, resolved_idx={}, enemy_count={}",
                        match instruction.target {
                            TargetSelector::Enemy(ix) => Some(ix),
                            _ => None,
                        },
                        target_idx,
                        combat.enemy_count
                    );

                    let mut enemy_snapshot = combat
                        .enemies
                        .get(target_idx)
                        .copied()
                        .ok_or(AdventureError::InvalidTarget)?;
                    msg!(
                        "Enemy state: idx={}, alive={}, hp={}",
                        target_idx,
                        enemy_snapshot.alive,
                        enemy_snapshot.hp
                    );

                    if !enemy_snapshot.alive {
                        if let Some(alive_idx) = first_alive_enemy_index(combat) {
                            target_idx = alive_idx;
                            enemy_snapshot = combat.enemies[alive_idx];
                            if !enemy_snapshot.alive {
                                combat.pending_resolution = CombatResolutionState::Victory;
                                combat.active = false;
                                return Ok(());
                            }
                        } else {
                            combat.pending_resolution = CombatResolutionState::Victory;
                            combat.active = false;
                            return Ok(());
                        }
                    }

                    let (damage, _) = compute_damage(
                        combat,
                        ability,
                        hero.attack,
                        hero.magic,
                        hero.luck,
                        enemy_snapshot.defense,
                        enemy_snapshot.resistance,
                        false,
                    );

                    if damage > 0 {
                        enemy_snapshot.hp = enemy_snapshot.hp.saturating_sub(damage);
                    }

                    let enemy_killed = enemy_snapshot.hp == 0;
                    if enemy_killed {
                        enemy_snapshot.alive = false;
                        hero.kill_streak = hero.kill_streak.saturating_add(1);

                        // Chance for positive trait on kill streak of 2+
                        if hero.kill_streak >= 2 && rand_percent(combat) < 3000 {
                            // 30% chance
                            hero.pending_positive_traits =
                                hero.pending_positive_traits.saturating_add(1);
                        }
                    } else if damage > 0 {
                        hero.kill_streak = 0;
                    }

                    if let Some(status) = ability.status {
                        let mut guard = false;
                        apply_status_application(
                            combat,
                            &mut enemy_snapshot.statuses,
                            &mut guard,
                            status,
                            enemy_snapshot.resistance,
                            hero.luck,
                        );
                    }

                    combat.enemies[target_idx] = enemy_snapshot;
                    if enemy_killed {
                        mark_enemy_dead(combat, target_idx as u8);
                    }
                }
            }
        }
        HeroActionKind::Defend => {
            if let Some(status) = ability.status {
                apply_status_application(
                    combat,
                    &mut hero.statuses,
                    &mut hero.guard,
                    status,
                    0,
                    hero.luck,
                );
            }
        }
        HeroActionKind::UseItem => {
            let item_key = instruction.item_key.ok_or(AdventureError::InvalidItemKey)?;
            apply_item_to_ally(adventure, combat, &mut hero, item_key, instruction.target)?;
            hero.kill_streak = 0;
        }
    }

    hero.ap = hero.ap.saturating_sub(ability.cost);
    end_hero_turn(&mut hero);
    combat.heroes[hero_index] = hero;

    Ok(())
}

fn execute_enemy_auto_turn(
    _adventure: &mut AdventureSession,
    combat: &mut AdventureCombat,
    enemy_index: usize,
) -> Result<()> {
    if enemy_index >= combat.enemy_count as usize {
        return Ok(());
    }

    let start = start_enemy_turn(combat, enemy_index);
    let mut enemy_state = combat.enemies[enemy_index];
    if !enemy_state.alive || !start.alive {
        enemy_state.alive = false;
        combat.enemies[enemy_index] = enemy_state;
        mark_enemy_dead(combat, enemy_index as u8);
        return Ok(());
    }

    if start.chill_stacks == 0 {
        enemy_state.ap = enemy_state.ap.saturating_add(1).min(ENEMY_AP_MAX);
    }

    let ability_roll = rand_u32(combat);
    let mut ability = enemy_skill(enemy_state.kind, ability_roll);
    if ability.cost > enemy_state.ap {
        ability = ENEMY_ABILITY_SETS[enemy_state.kind as usize % ENEMY_ABILITY_SETS.len()].basic;
    }

    let target_index = select_hero_target(combat, ability_roll)?;
    let mut hero_state = combat.heroes[target_index];
    if !hero_state.alive {
        mark_hero_dead(combat, target_index as u8);
        combat.enemies[enemy_index] = enemy_state;
        end_enemy_turn(&mut combat.enemies[enemy_index]);
        return Ok(());
    }

    let hero_guard = hero_state.guard;
    let (damage, _) = compute_damage(
        combat,
        ability,
        enemy_state.attack,
        enemy_state.magic,
        enemy_state.luck,
        hero_state.defense,
        hero_state.resistance,
        hero_guard,
    );

    if damage > 0 {
        // Check for heavy damage (>40% max HP) before applying
        let heavy_damage_threshold = (hero_state.max_hp * 40) / 100;
        if damage > heavy_damage_threshold && rand_percent(combat) < 4000 {
            // 40% chance
            hero_state.pending_negative_traits =
                hero_state.pending_negative_traits.saturating_add(1);
        }

        hero_state.hp = hero_state.hp.saturating_sub(damage);
        if hero_state.hp == 0 {
            hero_state.alive = false;
            mark_hero_dead(combat, target_index as u8);

            // Other heroes witness ally death - chance for negative trait
            for idx in 0..combat.hero_count as usize {
                if idx != target_index && combat.heroes[idx].alive {
                    if rand_percent(combat) < 4000 {
                        // 40% chance
                        combat.heroes[idx].pending_negative_traits =
                            combat.heroes[idx].pending_negative_traits.saturating_add(1);
                    }
                }
            }
        }
    }

    if let Some(status) = ability.status {
        apply_status_application(
            combat,
            &mut hero_state.statuses,
            &mut hero_state.guard,
            status,
            hero_state.resistance,
            enemy_state.luck,
        );
    }

    combat.heroes[target_index] = hero_state;
    enemy_state.ap = enemy_state.ap.saturating_sub(ability.cost);
    combat.enemies[enemy_index] = enemy_state;
    end_enemy_turn(&mut combat.enemies[enemy_index]);

    Ok(())
}

fn check_victory(combat: &mut AdventureCombat) -> bool {
    let all_defeated = (0..combat.enemy_count as usize).all(|idx| !combat.enemies[idx].alive);
    if all_defeated {
        combat.pending_resolution = CombatResolutionState::Victory;
        combat.active = false;
        true
    } else {
        false
    }
}

fn check_defeat(combat: &mut AdventureCombat) -> bool {
    let all_defeated = (0..combat.hero_count as usize).all(|idx| !combat.heroes[idx].alive);
    if all_defeated {
        combat.pending_resolution = CombatResolutionState::Defeat;
        combat.active = false;
        true
    } else {
        false
    }
}

fn first_alive_enemy_index(combat: &AdventureCombat) -> Option<usize> {
    msg!(
        "Searching for alive enemy, enemy_count={}",
        combat.enemy_count
    );
    for idx in 0..combat.enemy_count as usize {
        msg!("Enemy[{}]: alive={}", idx, combat.enemies[idx].alive);
    }
    (0..combat.enemy_count as usize).find(|idx| combat.enemies[*idx].alive)
}

#[allow(dead_code)]
fn first_alive_hero_index(combat: &AdventureCombat) -> Option<usize> {
    (0..combat.hero_count as usize).find(|idx| combat.heroes[*idx].alive)
}

fn select_hero_target(combat: &AdventureCombat, roll: u32) -> Result<usize> {
    let mut alive: [u8; MAX_PARTY] = [0; MAX_PARTY];
    let mut count = 0usize;
    for idx in 0..combat.hero_count as usize {
        if combat.heroes[idx].alive {
            alive[count] = idx as u8;
            count += 1;
        }
    }
    if count == 0 {
        return Err(error!(AdventureError::HeroIndexOutOfRange));
    }
    let pick = (roll as usize) % count;
    Ok(alive[pick] as usize)
}

fn mark_enemy_dead(combat: &mut AdventureCombat, enemy_index: u8) {
    msg!("Marking enemy {} as dead in initiative", enemy_index);
    let mut marked_count = 0;

    for slot in combat
        .initiative
        .iter_mut()
        .filter(|slot| slot.occupant_kind == CombatantKind::Enemy)
    {
        if slot.index == enemy_index {
            msg!("Found slot for enemy {}, setting active=false", enemy_index);
            slot.active = false;
            marked_count += 1;
        }
    }
    msg!(
        "Marked {} slots inactive for enemy {}",
        marked_count,
        enemy_index
    );
}

fn mark_hero_dead(combat: &mut AdventureCombat, hero_index: u8) {
    for slot in combat
        .initiative
        .iter_mut()
        .filter(|slot| slot.occupant_kind == CombatantKind::Hero)
    {
        if slot.index == hero_index {
            slot.active = false;
        }
    }
}

fn apply_item_to_ally(
    adventure: &mut AdventureSession,
    combat: &mut AdventureCombat,
    hero: &mut HeroCombatant,
    item_key: u8,
    target: TargetSelector,
) -> Result<()> {
    let target_index = match target {
        TargetSelector::Ally(ix) => ix as usize,
        TargetSelector::None => hero.hero_index as usize,
        _ => return Err(error!(AdventureError::InvalidTarget)),
    };
    require!(
        target_index < combat.hero_count as usize,
        AdventureError::HeroIndexOutOfRange
    );

    consume_adventure_item(adventure, item_key)?;

    let mut target_hero = if target_index == hero.hero_index as usize {
        *hero
    } else {
        combat.heroes[target_index]
    };

    match item_key {
        1 => {
            // StressTonic - reduce stress by 20
            target_hero.stress = target_hero.stress.saturating_sub(20);
        }
        3 => {
            // HealingSalve - restore 30 HP
            let heal = 30u16;
            target_hero.hp = target_hero.hp.saturating_add(heal).min(target_hero.max_hp);
            target_hero.alive = target_hero.hp > 0;
        }
        5 => {
            // CalmingIncense - reduce stress by 30 and clear one negative status
            target_hero.stress = target_hero.stress.saturating_sub(30);
            // Remove first negative status (Poison, Bleed, Burn, or Chill)
            for status in target_hero.statuses.iter_mut() {
                if !status.is_empty()
                    && matches!(
                        status.effect,
                        StatusEffect::Poison
                            | StatusEffect::Bleed
                            | StatusEffect::Burn
                            | StatusEffect::Chill
                    )
                {
                    status.clear();
                    break;
                }
            }
        }
        6 => {
            // PhoenixFeather - revive dead hero at 50% HP
            if !target_hero.alive {
                let restored = target_hero.max_hp / 2;
                target_hero.hp = restored.max(1);
                target_hero.alive = true;
                mark_hero_alive(combat, target_index as u8);
            }
        }
        _ => {
            // Unknown item - no effect but still consumed
        }
    }

    if target_index == hero.hero_index as usize {
        *hero = target_hero;
    } else {
        combat.heroes[target_index] = target_hero;
    }

    Ok(())
}

fn consume_adventure_item(adventure: &mut AdventureSession, item_key: u8) -> Result<()> {
    for slot in adventure.items.iter_mut() {
        if slot.item_key == item_key && slot.quantity > 0 {
            slot.quantity = slot.quantity.saturating_sub(1);
            if slot.quantity == 0 {
                *slot = ItemSlot::empty();
            }
            adventure.item_count = adventure
                .items
                .iter()
                .filter(|slot| !slot.is_empty())
                .count() as u8;
            return Ok(());
        }
    }
    Err(error!(AdventureError::ItemNotFound))
}

fn mark_hero_alive(combat: &mut AdventureCombat, hero_index: u8) {
    for slot in combat
        .initiative
        .iter_mut()
        .filter(|slot| slot.occupant_kind == CombatantKind::Hero)
    {
        if slot.index == hero_index {
            slot.active = true;
        }
    }
}

fn hero_skill(hero_type: u8, action: HeroActionKind) -> AbilitySpec {
    let base_attack = AbilitySpec {
        cost: 1,
        kind: HeroActionKind::Attack,
        damage_type: DamageType::Physical,
        power_percent: 135,
        status: None,
        target: Targeting::Enemy,
    };
    match action {
        HeroActionKind::Attack | HeroActionKind::Defend | HeroActionKind::UseItem => base_attack,
        HeroActionKind::Skill1 => HERO_ABILITY_SETS
            .get(hero_type as usize)
            .map(|set| set.skill1)
            .unwrap_or(base_attack),
        HeroActionKind::Skill2 => HERO_ABILITY_SETS
            .get(hero_type as usize)
            .map(|set| set.skill2)
            .unwrap_or(base_attack),
    }
}

fn enemy_skill(enemy_kind: u8, roll: u32) -> AbilitySpec {
    let set = ENEMY_ABILITY_SETS
        .get(enemy_kind as usize)
        .unwrap_or(&ENEMY_ABILITY_SETS[0]);
    let choice = roll % 100;
    if choice < 50 {
        set.basic
    } else if choice < 80 {
        set.skill1
    } else {
        set.skill2
    }
}

fn status_max_stacks(effect: StatusEffect) -> u8 {
    match effect {
        StatusEffect::Poison => 5,
        StatusEffect::Bleed => 3,
        StatusEffect::Burn => 2,
        StatusEffect::Chill => 3,
        StatusEffect::Guard | StatusEffect::None => 1,
    }
}

#[allow(dead_code)]
fn total_stacks(statuses: &[StatusInstance; MAX_STATUS_PER_COMBATANT], effect: StatusEffect) -> u8 {
    statuses
        .iter()
        .filter(|s| s.effect == effect && !s.is_empty())
        .map(|s| s.stacks)
        .sum()
}

fn rand_u32(combat: &mut AdventureCombat) -> u32 {
    combat.rng_state = combat
        .rng_state
        .wrapping_mul(0x5DEECE66Du64)
        .wrapping_add(0xBu64);
    (combat.rng_state >> 16) as u32
}

fn rand_percent(combat: &mut AdventureCombat) -> u16 {
    (rand_u32(combat) % 10_000) as u16
}

fn rand_range(combat: &mut AdventureCombat, min: u16, max: u16) -> u16 {
    if min >= max {
        return min;
    }
    let span = max - min + 1;
    min + ((rand_u32(combat) as u16) % span)
}

fn crit_chance_bps(luck: u16) -> u16 {
    let base = BASE_CRIT_PERCENT as u32 * 100;
    let luck_bonus = (luck as u32) * (CRIT_PER_LUCK_BPS as u32);
    let total = (base + luck_bonus).min((MAX_CRIT_PERCENT as u32) * 100);
    total as u16
}

fn apply_status_application(
    combat: &mut AdventureCombat,
    statuses: &mut [StatusInstance; MAX_STATUS_PER_COMBATANT],
    guard_flag: &mut bool,
    application: StatusApplication,
    resist: u16,
    attacker_luck: u16,
) -> bool {
    if matches!(application.effect, StatusEffect::Guard) {
        return set_guard_status(statuses, guard_flag, application.base_duration);
    }

    let mut chance_bps: i32 =
        6500 + application.resist_modifier as i32 * 100 + attacker_luck as i32 * 50;
    chance_bps -= resist as i32 * 45;
    chance_bps = chance_bps.clamp(1200, 9800);
    if rand_percent(combat) as i32 >= chance_bps {
        return false;
    }

    let max_stack = status_max_stacks(application.effect);
    if let Some(slot) = statuses
        .iter_mut()
        .find(|slot| slot.effect == application.effect && !slot.is_empty())
    {
        slot.stacks = slot
            .stacks
            .saturating_add(application.stacks)
            .min(max_stack);
        slot.duration = slot.duration.max(application.base_duration);
        return true;
    }

    if let Some(slot) = statuses.iter_mut().find(|slot| slot.is_empty()) {
        *slot = StatusInstance {
            effect: application.effect,
            duration: application.base_duration,
            stacks: application.stacks.min(max_stack).max(1),
        };
        return true;
    }

    if let Some(slot) = statuses.iter_mut().min_by_key(|slot| slot.duration) {
        *slot = StatusInstance {
            effect: application.effect,
            duration: application.base_duration,
            stacks: application.stacks.min(max_stack).max(1),
        };
        return true;
    }

    false
}

fn set_guard_status(
    statuses: &mut [StatusInstance; MAX_STATUS_PER_COMBATANT],
    guard_flag: &mut bool,
    duration: u8,
) -> bool {
    *guard_flag = true;

    if let Some(slot) = statuses
        .iter_mut()
        .find(|slot| slot.effect == StatusEffect::Guard && !slot.is_empty())
    {
        slot.duration = slot.duration.max(duration);
        return true;
    }

    if let Some(slot) = statuses.iter_mut().find(|slot| slot.is_empty()) {
        *slot = StatusInstance {
            effect: StatusEffect::Guard,
            duration,
            stacks: 1,
        };
        return true;
    }

    false
}

fn remove_guard_status(
    statuses: &mut [StatusInstance; MAX_STATUS_PER_COMBATANT],
    guard_flag: &mut bool,
) {
    *guard_flag = false;
    statuses
        .iter_mut()
        .filter(|slot| slot.effect == StatusEffect::Guard)
        .for_each(StatusInstance::clear);
}

struct StatusTurnResult {
    alive: bool,
    chill_stacks: u8,
}

fn process_statuses_for_actor(
    combat: &mut AdventureCombat,
    statuses: &mut [StatusInstance; MAX_STATUS_PER_COMBATANT],
    guard_flag: &mut bool,
    hp: &mut u16,
) -> StatusTurnResult {
    let mut total_damage: u16 = 0;
    let mut chill_total: u8 = 0;

    let mut strip_guard = false;

    for status in statuses.iter() {
        if status.is_empty() {
            continue;
        }
        match status.effect {
            StatusEffect::Poison => {
                total_damage = total_damage.saturating_add((status.stacks as u16) * 2);
            }
            StatusEffect::Bleed => {
                total_damage = total_damage.saturating_add((status.stacks as u16) * 3);
            }
            StatusEffect::Burn => {
                total_damage = total_damage.saturating_add(4 + status.stacks as u16);
                if *guard_flag && rand_percent(combat) < 2500 {
                    strip_guard = true;
                }
            }
            StatusEffect::Chill => {
                chill_total = chill_total.max(status.stacks);
            }
            StatusEffect::Guard | StatusEffect::None => {}
        }
    }

    if total_damage > 0 {
        *hp = hp.saturating_sub(total_damage);
    }

    if strip_guard {
        remove_guard_status(statuses, guard_flag);
    }

    StatusTurnResult {
        alive: *hp > 0,
        chill_stacks: chill_total,
    }
}

fn decay_statuses(
    statuses: &mut [StatusInstance; MAX_STATUS_PER_COMBATANT],
    guard_flag: &mut bool,
) {
    for status in statuses.iter_mut() {
        if status.is_empty() {
            continue;
        }

        if status.duration > 0 {
            status.duration -= 1;
        }

        if status.duration == 0 || status.stacks == 0 {
            if status.effect == StatusEffect::Guard {
                *guard_flag = false;
            }
            status.clear();
        }
    }
}

fn compute_damage(
    combat: &mut AdventureCombat,
    ability: AbilitySpec,
    atk: u16,
    mag: u16,
    luck: u16,
    target_def: u16,
    target_res: u16,
    target_guarded: bool,
) -> (u16, bool) {
    match ability.damage_type {
        DamageType::Heal | DamageType::Support => (0, false),
        DamageType::Physical | DamageType::Magical => {
            let offensive = if matches!(ability.damage_type, DamageType::Physical) {
                atk
            } else {
                mag
            };
            let base = offensive.saturating_mul(ability.power_percent) / 100;
            let variance = (offensive / 3).max(4);
            let roll = rand_range(combat, 0, variance);
            let mut damage = base.saturating_add(roll);

            if rand_percent(combat) < crit_chance_bps(luck) {
                damage = damage.saturating_mul(CRIT_MULTIPLIER_PERCENT) / 100;
                if matches!(ability.damage_type, DamageType::Physical) {
                    damage = damage.saturating_add(offensive / 4);
                }
                damage = damage.max(6);
                damage = apply_defense(
                    damage,
                    target_def,
                    target_res,
                    target_guarded,
                    matches!(ability.damage_type, DamageType::Physical),
                );
                return (damage.max(1), true);
            }

            damage = apply_defense(
                damage,
                target_def,
                target_res,
                target_guarded,
                matches!(ability.damage_type, DamageType::Physical),
            );

            (damage.max(1), false)
        }
    }
}

fn apply_defense(
    mut damage: u16,
    target_def: u16,
    target_res: u16,
    target_guarded: bool,
    is_physical: bool,
) -> u16 {
    let mitigation = if is_physical {
        target_def / 2
    } else {
        target_res / 2
    };
    damage = damage.saturating_sub(mitigation);
    if target_guarded {
        damage = (damage as u32 * 60 / 100) as u16;
        damage = damage.max(1);
    }
    damage
}

fn start_hero_turn(combat: &mut AdventureCombat, hero_index: usize) -> StatusTurnResult {
    let mut hero_snapshot = combat.heroes[hero_index];
    let mut statuses = hero_snapshot.statuses;
    let mut guard = hero_snapshot.guard;
    let mut hp = hero_snapshot.hp;
    let result = process_statuses_for_actor(combat, &mut statuses, &mut guard, &mut hp);
    hero_snapshot.statuses = statuses;
    hero_snapshot.guard = guard;
    hero_snapshot.hp = hp;
    combat.heroes[hero_index] = hero_snapshot;
    result
}

fn end_hero_turn(hero: &mut HeroCombatant) {
    decay_statuses(&mut hero.statuses, &mut hero.guard);
}

fn start_enemy_turn(combat: &mut AdventureCombat, enemy_index: usize) -> StatusTurnResult {
    let mut enemy_snapshot = combat.enemies[enemy_index];
    let mut guard = false;
    let mut statuses = enemy_snapshot.statuses;
    let mut hp = enemy_snapshot.hp;
    let result = process_statuses_for_actor(combat, &mut statuses, &mut guard, &mut hp);
    enemy_snapshot.statuses = statuses;
    enemy_snapshot.hp = hp;
    combat.enemies[enemy_index] = enemy_snapshot;
    result
}

fn end_enemy_turn(enemy: &mut EnemyCombatant) {
    let mut guard = false;
    decay_statuses(&mut enemy.statuses, &mut guard);
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct CombatInstruction {
    pub hero_index: u8,
    pub action: HeroActionKind,
    pub target: TargetSelector,
    pub item_key: Option<u8>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum HeroActionKind {
    Attack,
    Skill1,
    Skill2,
    Defend,
    UseItem,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TargetSelector {
    None,
    Ally(u8),
    Enemy(u8),
}

use anchor_lang::prelude::*;

use crate::constants::MAX_ITEMS;
use crate::errors::AdventureError;
use crate::logic::{get_torch_stat_buff, Mulberry32};
use crate::state::{AdventureSession, ItemSlot};
use crate::OpenChest;

use player_economy::state::{ItemDefinition, ItemKey};

const MAX_CHEST_ITEMS: u8 = 5;

#[derive(Clone, Copy)]
struct LootEntry {
    item: ItemKey,
    min_qty: u16,
    max_qty: u16,
}

const LOOT_ENTRIES: [LootEntry; 7] = [
    LootEntry {
        item: ItemKey::PouchGold,
        min_qty: 1,
        max_qty: 3,
    },
    LootEntry {
        item: ItemKey::StressTonic,
        min_qty: 1,
        max_qty: 2,
    },
    LootEntry {
        item: ItemKey::MinorTorch,
        min_qty: 1,
        max_qty: 2,
    },
    LootEntry {
        item: ItemKey::HealingSalve,
        min_qty: 1,
        max_qty: 1,
    },
    LootEntry {
        item: ItemKey::MysteryRelic,
        min_qty: 1,
        max_qty: 1,
    },
    LootEntry {
        item: ItemKey::CalmingIncense,
        min_qty: 1,
        max_qty: 2,
    },
    LootEntry {
        item: ItemKey::PhoenixFeather,
        min_qty: 1,
        max_qty: 1,
    },
];

pub fn open_chest(ctx: Context<OpenChest>, chest_index: u8) -> Result<()> {
    let adventure = &mut ctx.accounts.adventure;
    let owner = ctx.accounts.owner.key();
    let authority = ctx.accounts.authority.key();

    enforce_authority(adventure, &owner, &authority)?;

    require!(adventure.is_active, AdventureError::AdventureNotActive);
    require!(adventure.heroes_inside, AdventureError::AdventureNotActive);

    let idx = chest_index as usize;
    let chest_point = adventure
        .chests
        .get(idx)
        .copied()
        .ok_or(AdventureError::NoChestAtPosition)?;

    // Require party to stand on the chest tile to open it.
    require!(
        adventure.party_position == chest_point,
        AdventureError::NoChestAtPosition
    );

    if let Some(flag) = adventure.opened_chests.get(idx) {
        require!(*flag == 0, AdventureError::ChestAlreadyOpened);
    }

    let leader = adventure
        .hero_snapshots
        .get(0)
        .copied()
        .ok_or(AdventureError::AdventureNotActive)?;

    let torch_bonus = get_torch_stat_buff(adventure.torch);
    let effective_luck = (leader.luck as u16 + torch_bonus as u16).min(100) as u8;

    let clock = Clock::get()?;
    let mut seed = adventure.seed
        ^ ((chest_index as u32) << 16)
        ^ (clock.slot as u32)
        ^ (clock.unix_timestamp as u32)
        ^ ((adventure.party_position.x as u32) << 8)
        ^ (adventure.party_position.y as u32);
    if seed == 0 {
        seed = adventure
            .seed
            .wrapping_add(clock.slot as u32)
            .wrapping_add(1);
    }
    let mut rng = Mulberry32::new(seed);

    let item_count = sample_item_count(&mut rng, effective_luck).min(MAX_CHEST_ITEMS);

    let mut loot_slots = [ItemSlot::empty(); MAX_ITEMS];
    let mut slot_count: u8 = 0;

    for _ in 0..item_count {
        if slot_count as usize >= MAX_ITEMS {
            break;
        }

        let item_index = sample_loot_item(&mut rng, effective_luck);
        let entry = &LOOT_ENTRIES[item_index];
        let definition = entry.item.definition();

        let quantity = if entry.min_qty == entry.max_qty {
            entry.min_qty
        } else {
            rng.next_range(entry.min_qty, entry.max_qty)
        };

        push_loot_slot(
            &mut loot_slots,
            &mut slot_count,
            entry.item as u8,
            quantity,
            definition,
        );
    }

    // Persist loot into the adventure session.
    adventure
        .pending_loot
        .iter_mut()
        .for_each(|slot| *slot = ItemSlot::empty());
    for (dst, src) in adventure.pending_loot.iter_mut().zip(loot_slots.iter()) {
        *dst = *src;
    }

    adventure.pending_loot_count = adventure
        .pending_loot
        .iter()
        .filter(|slot| !slot.is_empty())
        .count() as u8;
    adventure.pending_loot_source = if adventure.pending_loot_count == 0 {
        u8::MAX
    } else {
        chest_index
    };

    if let Some(flag) = adventure.opened_chests.get_mut(idx) {
        *flag = 1;
    }

    Ok(())
}

fn enforce_authority(
    adventure: &AdventureSession,
    owner: &Pubkey,
    authority: &Pubkey,
) -> Result<()> {
    require_keys_eq!(
        adventure.player,
        *owner,
        AdventureError::AdventureOwnerMismatch
    );
    let authorized = *authority == *owner || adventure.delegate == Some(*authority);
    require!(authorized, AdventureError::Unauthorized);
    Ok(())
}

fn sample_item_count(rng: &mut Mulberry32, luck: u8) -> u8 {
    let mut weights = [100u32, 55, 28, 12, 5];
    let bonus = (luck as u32) / 5; // up to ~20 when luck is high

    for idx in 1..weights.len() {
        weights[idx] = weights[idx].saturating_add(bonus * idx as u32);
    }

    let reduction = bonus.saturating_mul(2);
    weights[0] = weights[0].saturating_sub(reduction).max(20);

    (weighted_choice(rng, &weights) + 1) as u8
}

fn sample_loot_item(rng: &mut Mulberry32, luck: u8) -> usize {
    let mut weights = [48u32, 26, 24, 18, 10, 6, 2];
    let luck_u32 = luck as u32;

    weights[0] = weights[0].saturating_sub(luck_u32 / 3).max(4);
    weights[1] = weights[1].saturating_add(luck_u32 / 8);
    weights[2] = weights[2].saturating_add(luck_u32 / 8);
    weights[3] = weights[3].saturating_add(luck_u32 / 10);

    let rare_push = (luck_u32 / 6).max(1);
    weights[4] = weights[4].saturating_add(rare_push);
    weights[5] = weights[5].saturating_add((rare_push / 2).max(1));
    weights[6] = weights[6].saturating_add((luck_u32 / 20).max(1));

    weighted_choice(rng, &weights)
}

fn weighted_choice(rng: &mut Mulberry32, weights: &[u32]) -> usize {
    let total: u64 = weights.iter().map(|w| *w as u64).sum();
    let total = total.max(1);
    let mut roll = (rng.next_u32() as u64) % total;

    for (idx, weight) in weights.iter().enumerate() {
        if *weight == 0 {
            continue;
        }
        if roll < *weight as u64 {
            return idx;
        }
        roll -= *weight as u64;
    }

    weights.len().saturating_sub(1)
}

fn push_loot_slot(
    slots: &mut [ItemSlot; MAX_ITEMS],
    slot_count: &mut u8,
    item_key: u8,
    mut quantity: u16,
    definition: &ItemDefinition,
) {
    match definition.max_stack {
        1 => {
            while quantity > 0 && (*slot_count as usize) < MAX_ITEMS {
                slots[*slot_count as usize] = ItemSlot {
                    item_key,
                    quantity: 1,
                };
                *slot_count = slot_count.saturating_add(1);
                quantity -= 1;
            }
        }
        0 => {
            if let Some(slot) = slots[..*slot_count as usize]
                .iter_mut()
                .find(|slot| slot.item_key == item_key && slot.quantity > 0)
            {
                slot.quantity = slot.quantity.saturating_add(quantity);
            } else if (*slot_count as usize) < MAX_ITEMS {
                slots[*slot_count as usize] = ItemSlot { item_key, quantity };
                *slot_count = slot_count.saturating_add(1);
            }
        }
        max_stack => {
            // Fill existing partial stacks first.
            for slot in slots[..*slot_count as usize]
                .iter_mut()
                .filter(|slot| slot.item_key == item_key && slot.quantity < max_stack)
            {
                if quantity == 0 {
                    break;
                }
                let capacity = max_stack.saturating_sub(slot.quantity);
                if capacity == 0 {
                    continue;
                }
                let to_add = quantity.min(capacity);
                slot.quantity = slot.quantity.saturating_add(to_add);
                quantity -= to_add;
            }

            while quantity > 0 && (*slot_count as usize) < MAX_ITEMS {
                let to_add = quantity.min(max_stack);
                slots[*slot_count as usize] = ItemSlot {
                    item_key,
                    quantity: to_add,
                };
                *slot_count = slot_count.saturating_add(1);
                quantity -= to_add;
            }
        }
    }
}

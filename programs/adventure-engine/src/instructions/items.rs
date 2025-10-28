use anchor_lang::prelude::*;

use crate::errors::AdventureError;
use crate::state::{AdventureSession, ItemSlot};
use crate::ManageItems;

use player_economy::state::{ItemDefinition, ItemKey};

/// Pick up an item found in the dungeon (from chest or combat)
/// Validates pending loot availability and inventory capacity before applying changes.
pub fn pickup_item(ctx: Context<ManageItems>, item_key: u8, quantity: u16) -> Result<()> {
    require!(item_key < 7, AdventureError::InvalidItemKey);
    require!(quantity > 0, AdventureError::InvalidItemQuantity);

    let adventure = &mut ctx.accounts.adventure;
    let owner = ctx.accounts.owner.key();
    let authority = ctx.accounts.authority.key();

    enforce_authority(adventure, &owner, &authority)?;

    require!(adventure.is_active, AdventureError::AdventureNotActive);
    require!(adventure.heroes_inside, AdventureError::AdventureNotActive);

    let item_enum = resolve_item_enum(item_key)?;
    let definition = item_enum.definition();

    ensure_pending_available(adventure, item_key, quantity)?;
    ensure_inventory_capacity(adventure, item_key, quantity, definition)?;

    apply_inventory_add(adventure, item_key, quantity, definition)?;
    consume_pending_loot(adventure, item_key, quantity)?;

    Ok(())
}

/// Drop an item from inventory.
pub fn drop_item(ctx: Context<ManageItems>, item_key: u8, quantity: u16) -> Result<()> {
    require!(item_key < 7, AdventureError::InvalidItemKey);
    require!(quantity > 0, AdventureError::InvalidItemQuantity);

    let adventure = &mut ctx.accounts.adventure;
    let owner = ctx.accounts.owner.key();
    let authority = ctx.accounts.authority.key();

    enforce_authority(adventure, &owner, &authority)?;

    require!(adventure.is_active, AdventureError::AdventureNotActive);
    require!(adventure.heroes_inside, AdventureError::AdventureNotActive);

    let slot = adventure
        .items
        .iter_mut()
        .find(|s| s.item_key == item_key && s.quantity > 0)
        .ok_or(AdventureError::ItemNotFound)?;

    require!(
        slot.quantity >= quantity,
        AdventureError::InsufficientItemQuantity
    );

    slot.quantity -= quantity;
    if slot.quantity == 0 {
        *slot = ItemSlot::empty();
        adventure.item_count = adventure.item_count.saturating_sub(1);
    }

    Ok(())
}

/// Swap items when inventory is full - drop old item and pickup new one.
pub fn swap_item(
    ctx: Context<ManageItems>,
    drop_item_key: u8,
    drop_quantity: u16,
    pickup_item_key: u8,
    pickup_quantity: u16,
) -> Result<()> {
    require!(drop_item_key < 7, AdventureError::InvalidItemKey);
    require!(pickup_item_key < 7, AdventureError::InvalidItemKey);
    require!(drop_quantity > 0, AdventureError::InvalidItemQuantity);
    require!(pickup_quantity > 0, AdventureError::InvalidItemQuantity);

    let adventure = &mut ctx.accounts.adventure;
    let owner = ctx.accounts.owner.key();
    let authority = ctx.accounts.authority.key();

    enforce_authority(adventure, &owner, &authority)?;

    require!(adventure.is_active, AdventureError::AdventureNotActive);
    require!(adventure.heroes_inside, AdventureError::AdventureNotActive);

    let pickup_enum = resolve_item_enum(pickup_item_key)?;
    let pickup_definition = pickup_enum.definition();

    ensure_pending_available(adventure, pickup_item_key, pickup_quantity)?;

    // First drop the requested amount from inventory.
    {
        let slot = adventure
            .items
            .iter_mut()
            .find(|s| s.item_key == drop_item_key && s.quantity > 0)
            .ok_or(AdventureError::ItemNotFound)?;

        require!(
            slot.quantity >= drop_quantity,
            AdventureError::InsufficientItemQuantity
        );

        slot.quantity -= drop_quantity;
        if slot.quantity == 0 {
            *slot = ItemSlot::empty();
            adventure.item_count = adventure.item_count.saturating_sub(1);
        }
    }

    ensure_inventory_capacity(
        adventure,
        pickup_item_key,
        pickup_quantity,
        pickup_definition,
    )?;
    apply_inventory_add(
        adventure,
        pickup_item_key,
        pickup_quantity,
        pickup_definition,
    )?;
    consume_pending_loot(adventure, pickup_item_key, pickup_quantity)?;

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

fn resolve_item_enum(item_key: u8) -> Result<ItemKey> {
    let item = match item_key {
        0 => ItemKey::PouchGold,
        1 => ItemKey::StressTonic,
        2 => ItemKey::MinorTorch,
        3 => ItemKey::HealingSalve,
        4 => ItemKey::MysteryRelic,
        5 => ItemKey::CalmingIncense,
        6 => ItemKey::PhoenixFeather,
        _ => return Err(error!(AdventureError::InvalidItemKey)),
    };
    Ok(item)
}

fn ensure_pending_available(
    adventure: &AdventureSession,
    item_key: u8,
    quantity: u16,
) -> Result<()> {
    if quantity == 0 {
        return Err(error!(AdventureError::InvalidItemQuantity));
    }

    let available = adventure
        .pending_loot
        .iter()
        .filter(|slot| slot.item_key == item_key && slot.quantity > 0)
        .fold(0u16, |acc, slot| acc.saturating_add(slot.quantity));

    require!(available >= quantity, AdventureError::LootNotAvailable);
    Ok(())
}

fn consume_pending_loot(
    adventure: &mut AdventureSession,
    item_key: u8,
    mut quantity: u16,
) -> Result<()> {
    if quantity == 0 {
        return Err(error!(AdventureError::InvalidItemQuantity));
    }

    for slot in adventure
        .pending_loot
        .iter_mut()
        .filter(|slot| slot.item_key == item_key && slot.quantity > 0)
    {
        if quantity == 0 {
            break;
        }

        let take = slot.quantity.min(quantity);
        slot.quantity -= take;
        quantity -= take;

        if slot.quantity == 0 {
            *slot = ItemSlot::empty();
            adventure.pending_loot_count = adventure.pending_loot_count.saturating_sub(1);
        }
    }

    require!(quantity == 0, AdventureError::LootNotAvailable);

    if adventure.pending_loot.iter().all(ItemSlot::is_empty) {
        adventure.pending_loot_count = 0;
        adventure.pending_loot_source = u8::MAX;
    }

    Ok(())
}

fn ensure_inventory_capacity(
    adventure: &AdventureSession,
    item_key: u8,
    quantity: u16,
    definition: &ItemDefinition,
) -> Result<()> {
    if quantity == 0 {
        return Err(error!(AdventureError::InvalidItemQuantity));
    }

    match definition.max_stack {
        1 => {
            // Non-stackable: require one empty slot per item.
            let empty_slots = adventure
                .items
                .iter()
                .filter(|slot| slot.is_empty())
                .count() as u16;
            require!(empty_slots >= quantity, AdventureError::InventoryFull);
        }
        0 => {
            // Unlimited stack: require either an existing slot or a single empty slot.
            let has_existing = adventure
                .items
                .iter()
                .any(|slot| slot.item_key == item_key && slot.quantity > 0);
            if !has_existing {
                let empty_slots = adventure
                    .items
                    .iter()
                    .filter(|slot| slot.is_empty())
                    .count();
                require!(empty_slots > 0, AdventureError::InventoryFull);
            }
        }
        max_stack => {
            let mut capacity: u32 = 0;
            for slot in adventure.items.iter() {
                if slot.item_key == item_key && slot.quantity > 0 {
                    let remaining = max_stack.saturating_sub(slot.quantity);
                    capacity = capacity.saturating_add(remaining as u32);
                } else if slot.is_empty() {
                    capacity = capacity.saturating_add(max_stack as u32);
                }
            }
            require!(capacity >= quantity as u32, AdventureError::InventoryFull);
        }
    }

    Ok(())
}

fn apply_inventory_add(
    adventure: &mut AdventureSession,
    item_key: u8,
    mut quantity: u16,
    definition: &ItemDefinition,
) -> Result<()> {
    if quantity == 0 {
        return Err(error!(AdventureError::InvalidItemQuantity));
    }

    match definition.max_stack {
        1 => {
            while quantity > 0 {
                let slot = adventure
                    .items
                    .iter_mut()
                    .find(|slot| slot.is_empty())
                    .ok_or(AdventureError::InventoryFull)?;
                slot.item_key = item_key;
                slot.quantity = 1;
                adventure.item_count = adventure.item_count.saturating_add(1);
                quantity -= 1;
            }
        }
        0 => {
            if let Some(slot) = adventure
                .items
                .iter_mut()
                .find(|slot| slot.item_key == item_key && slot.quantity > 0)
            {
                slot.quantity = slot
                    .quantity
                    .checked_add(quantity)
                    .ok_or(AdventureError::ItemStackOverflow)?;
            } else {
                let slot = adventure
                    .items
                    .iter_mut()
                    .find(|slot| slot.is_empty())
                    .ok_or(AdventureError::InventoryFull)?;
                slot.item_key = item_key;
                slot.quantity = quantity;
                adventure.item_count = adventure.item_count.saturating_add(1);
            }
        }
        max_stack => {
            // Fill existing stacks first.
            for slot in adventure
                .items
                .iter_mut()
                .filter(|slot| slot.item_key == item_key && slot.quantity > 0)
            {
                if quantity == 0 {
                    break;
                }
                let capacity = max_stack.saturating_sub(slot.quantity);
                if capacity == 0 {
                    continue;
                }
                let to_add = quantity.min(capacity);
                slot.quantity = slot
                    .quantity
                    .checked_add(to_add)
                    .ok_or(AdventureError::ItemStackOverflow)?;
                quantity -= to_add;
            }

            // Use empty slots for any remaining quantity.
            while quantity > 0 {
                let to_add = quantity.min(max_stack);
                let slot = adventure
                    .items
                    .iter_mut()
                    .find(|slot| slot.is_empty())
                    .ok_or(AdventureError::InventoryFull)?;
                slot.item_key = item_key;
                slot.quantity = to_add;
                adventure.item_count = adventure.item_count.saturating_add(1);
                quantity -= to_add;
            }
        }
    }

    Ok(())
}

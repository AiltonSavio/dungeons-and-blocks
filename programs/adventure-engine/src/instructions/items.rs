use anchor_lang::prelude::*;

use crate::errors::AdventureError;
use crate::state::ItemSlot;
use crate::ManageItems;

/// Pick up an item found in the dungeon (from chest or combat)
/// If inventory is full and item can't stack, this will fail
pub fn pickup_item(
    ctx: Context<ManageItems>,
    item_key: u8,
    quantity: u16,
) -> Result<()> {
    require!(item_key < 7, AdventureError::InvalidItemKey);
    require!(quantity > 0, AdventureError::InvalidItemQuantity);

    let adventure = &mut ctx.accounts.adventure;

    require!(adventure.is_active, AdventureError::AdventureNotActive);
    require_keys_eq!(
        adventure.player,
        ctx.accounts.player.key(),
        AdventureError::AdventureOwnerMismatch
    );

    // Try to find existing slot with this item to stack
    if let Some(slot) = adventure.items.iter_mut().find(|s| s.item_key == item_key) {
        slot.quantity = slot
            .quantity
            .checked_add(quantity)
            .ok_or(AdventureError::ItemStackOverflow)?;
        return Ok(());
    }

    // No existing slot, need to find empty one
    if let Some(empty_slot) = adventure.items.iter_mut().find(|s| s.is_empty()) {
        *empty_slot = ItemSlot { item_key, quantity };
        adventure.item_count = adventure.item_count.saturating_add(1);
        Ok(())
    } else {
        Err(AdventureError::InventoryFull.into())
    }
}

/// Drop an item from inventory
pub fn drop_item(
    ctx: Context<ManageItems>,
    item_key: u8,
    quantity: u16,
) -> Result<()> {
    require!(item_key < 7, AdventureError::InvalidItemKey);
    require!(quantity > 0, AdventureError::InvalidItemQuantity);

    let adventure = &mut ctx.accounts.adventure;

    require!(adventure.is_active, AdventureError::AdventureNotActive);
    require_keys_eq!(
        adventure.player,
        ctx.accounts.player.key(),
        AdventureError::AdventureOwnerMismatch
    );

    // Find the item slot
    let slot = adventure
        .items
        .iter_mut()
        .find(|s| s.item_key == item_key)
        .ok_or(AdventureError::ItemNotFound)?;

    require!(
        slot.quantity >= quantity,
        AdventureError::InsufficientItemQuantity
    );

    slot.quantity -= quantity;

    // If quantity reaches zero, mark slot as empty
    if slot.quantity == 0 {
        *slot = ItemSlot::empty();
        adventure.item_count = adventure.item_count.saturating_sub(1);
    }

    Ok(())
}

/// Swap items when inventory is full - drop old item and pickup new one
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

    require!(adventure.is_active, AdventureError::AdventureNotActive);
    require_keys_eq!(
        adventure.player,
        ctx.accounts.player.key(),
        AdventureError::AdventureOwnerMismatch
    );

    // First drop the item
    let drop_slot = adventure
        .items
        .iter_mut()
        .find(|s| s.item_key == drop_item_key)
        .ok_or(AdventureError::ItemNotFound)?;

    require!(
        drop_slot.quantity >= drop_quantity,
        AdventureError::InsufficientItemQuantity
    );

    drop_slot.quantity -= drop_quantity;

    let drop_empty = drop_slot.quantity == 0;
    if drop_empty {
        *drop_slot = ItemSlot::empty();
        adventure.item_count = adventure.item_count.saturating_sub(1);
    }

    // Then pickup the new item - try to stack first
    if let Some(slot) = adventure.items.iter_mut().find(|s| s.item_key == pickup_item_key) {
        slot.quantity = slot
            .quantity
            .checked_add(pickup_quantity)
            .ok_or(AdventureError::ItemStackOverflow)?;
        return Ok(());
    }

    // Find empty slot for pickup
    if let Some(empty_slot) = adventure.items.iter_mut().find(|s| s.is_empty()) {
        *empty_slot = ItemSlot {
            item_key: pickup_item_key,
            quantity: pickup_quantity,
        };
        adventure.item_count = adventure.item_count.saturating_add(1);
        Ok(())
    } else {
        Err(AdventureError::InventoryFull.into())
    }
}

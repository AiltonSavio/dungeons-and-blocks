use anchor_lang::prelude::*;

use crate::{
    constants::{ADVENTURE_ENGINE_PROGRAM_ID, PLAYER_ECONOMY_SEED},
    errors::PlayerEconomyError,
    state::*,
};

#[derive(Accounts)]
pub struct ModifyItemStock<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_ECONOMY_SEED, owner.key().as_ref()],
        bump = player_economy.bump
    )]
    pub player_economy: Account<'info, PlayerEconomy>,
}

#[derive(Accounts)]
pub struct ConsumeItems<'info> {
    /// The authority (owner or delegated program) consuming items
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_ECONOMY_SEED, player_economy.owner.as_ref()],
        bump = player_economy.bump
    )]
    pub player_economy: Account<'info, PlayerEconomy>,
}

#[derive(Accounts)]
pub struct DepositLoot<'info> {
    /// Authority adding loot (player or trusted adventure signer)
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [PLAYER_ECONOMY_SEED, player_economy.owner.as_ref()],
        bump = player_economy.bump
    )]
    pub player_economy: Account<'info, PlayerEconomy>,
}

pub fn buy_item(ctx: Context<ModifyItemStock>, item: ItemKey, quantity: u16) -> Result<()> {
    require!(quantity > 0, PlayerEconomyError::InvalidQuantity);

    let definition = item.definition();
    let price = definition
        .buy_price
        .ok_or(PlayerEconomyError::ItemNotPurchasable)?;
    let account = &mut ctx.accounts.player_economy;

    require_keys_eq!(
        account.owner,
        ctx.accounts.owner.key(),
        PlayerEconomyError::Unauthorized
    );

    let total_price = price
        .checked_mul(quantity as u64)
        .ok_or(PlayerEconomyError::MathOverflow)?;

    require!(
        account.gold >= total_price,
        PlayerEconomyError::InsufficientGold
    );

    let index = item.index();
    let current = account.items[index];
    let new_total = current
        .checked_add(quantity)
        .ok_or(PlayerEconomyError::InventoryOverflow)?;

    if definition.max_stack > 0 {
        require!(
            new_total as u64 <= definition.max_stack as u64,
            PlayerEconomyError::StackLimitExceeded
        );
    }

    account.gold -= total_price;
    account.items[index] = new_total;

    emit!(ItemPurchased {
        owner: account.owner,
        item: item as u8,
        quantity,
        unit_price: price,
    });

    Ok(())
}

pub fn sell_item(ctx: Context<ModifyItemStock>, item: ItemKey, quantity: u16) -> Result<()> {
    require!(quantity > 0, PlayerEconomyError::InvalidQuantity);

    let definition = item.definition();
    let price = definition
        .sell_price
        .ok_or(PlayerEconomyError::ItemNotSellable)?;
    let account = &mut ctx.accounts.player_economy;

    require_keys_eq!(
        account.owner,
        ctx.accounts.owner.key(),
        PlayerEconomyError::Unauthorized
    );

    let index = item.index();
    let current = account.items[index];
    require!(current >= quantity, PlayerEconomyError::InsufficientStock);

    let total_value = price
        .checked_mul(quantity as u64)
        .ok_or(PlayerEconomyError::MathOverflow)?;

    account.items[index] = current - quantity;
    account.gold = account
        .gold
        .checked_add(total_value)
        .ok_or(PlayerEconomyError::MathOverflow)?;

    emit!(ItemSold {
        owner: account.owner,
        item: item as u8,
        quantity,
        unit_price: price,
    });

    Ok(())
}

pub fn consume_items(ctx: Context<ConsumeItems>, items: Vec<ItemConsumption>) -> Result<()> {
    require!(!items.is_empty(), PlayerEconomyError::InvalidQuantity);

    let account = &mut ctx.accounts.player_economy;
    let authority = ctx.accounts.authority.key();

    require_keys_eq!(account.owner, authority, PlayerEconomyError::Unauthorized);

    // First pass: validate all items are available
    for item_consumption in &items {
        require!(
            item_consumption.quantity > 0,
            PlayerEconomyError::InvalidQuantity
        );

        let index = item_consumption.item.index();
        let current = account.items[index];
        require!(
            current >= item_consumption.quantity,
            PlayerEconomyError::InsufficientStock
        );
    }

    // Second pass: deduct items
    for item_consumption in &items {
        let index = item_consumption.item.index();
        account.items[index] -= item_consumption.quantity;

        emit!(ItemConsumed {
            owner: account.owner,
            item: item_consumption.item as u8,
            quantity: item_consumption.quantity,
        });
    }

    Ok(())
}

pub fn deposit_loot(
    ctx: Context<DepositLoot>,
    gold: u64,
    items: Vec<LootDepositItem>,
) -> Result<()> {
    let authority = ctx.accounts.authority.key();
    let authority_is_owner = authority == ctx.accounts.player_economy.owner;
    let authority_is_adventure = *ctx.accounts.authority.owner == ADVENTURE_ENGINE_PROGRAM_ID;

    require!(
        authority_is_owner || authority_is_adventure,
        PlayerEconomyError::Unauthorized
    );

    require!(
        ctx.accounts.player_economy.to_account_info().data_len() >= PlayerEconomy::LEN,
        PlayerEconomyError::AccountNotInitialized
    );

    let account = &mut ctx.accounts.player_economy;

    if gold > 0 {
        account.gold = account
            .gold
            .checked_add(gold)
            .ok_or(PlayerEconomyError::MathOverflow)?;
    }

    for deposit in items {
        if deposit.quantity == 0 {
            continue;
        }

        let definition = deposit.item.definition();
        let index = deposit.item.index();
        let current = account.items[index];
        let new_total = current
            .checked_add(deposit.quantity)
            .ok_or(PlayerEconomyError::InventoryOverflow)?;

        if definition.max_stack > 0 {
            require!(
                new_total as u64 <= definition.max_stack as u64,
                PlayerEconomyError::StackLimitExceeded
            );
        }

        account.items[index] = new_total;
    }

    emit!(LootDeposited {
        owner: account.owner,
        gold,
    });

    Ok(())
}

#[event]
pub struct LootDeposited {
    pub owner: Pubkey,
    pub gold: u64,
}

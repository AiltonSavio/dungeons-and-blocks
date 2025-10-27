use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::{constants::*, DelegateAdventure, SetDelegate};

/// Write-only step: store who is allowed to act ephemerally.
pub fn set_delegate(ctx: Context<SetDelegate>, delegate: Option<Pubkey>) -> Result<()> {
    let payer = ctx.accounts.payer.key();
    let delegate_key = delegate.unwrap_or(payer);
    ctx.accounts.adventure.delegate = Some(delegate_key);
    Ok(())
}

/// Delegate-only step: calls the SDK to delegate the PDA. No account data is mutated here.
pub fn delegate_adventure(ctx: Context<DelegateAdventure>) -> Result<()> {
    // Derive the seeds from the passed accounts
    let owner = ctx.accounts.owner.key();
    let dungeon_mint = ctx.accounts.dungeon_mint.key();

    let seeds: &[&[u8]] = &[ADVENTURE_SEED, owner.as_ref(), dungeon_mint.as_ref()];

    let mut config = DelegateConfig::default();
    config.commit_frequency_ms = DEFAULT_COMMIT_FREQUENCY_MS;
    if let Some(validator) = ctx.remaining_accounts.first() {
        config.validator = Some(validator.key());
    }

    ctx.accounts
        .delegate_pda(&ctx.accounts.payer, seeds, config)?;

    Ok(())
}

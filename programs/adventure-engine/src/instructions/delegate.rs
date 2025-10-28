use anchor_lang::prelude::*;

use crate::{DelegateAdventure, SetDelegate};

/// Write-only step: store who is allowed to act ephemerally.
pub fn set_delegate(ctx: Context<SetDelegate>, delegate: Option<Pubkey>) -> Result<()> {
    let payer = ctx.accounts.payer.key();
    let delegate_key = delegate.unwrap_or(payer);
    ctx.accounts.adventure.delegate = Some(delegate_key);
    Ok(())
}

/// Delegate-only step: calls the SDK to delegate the PDA. No account data is mutated here.
pub fn delegate_adventure(ctx: Context<DelegateAdventure>) -> Result<()> {
    // MagicBlock delegation is disabled while developing/testing on the main chain.
    // The context is kept so this instruction signature remains intact for future re-enablement.
    let _ = ctx;
    Ok(())
}

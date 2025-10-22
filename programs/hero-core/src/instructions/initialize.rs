use anchor_lang::prelude::*;

use crate::constants::PLAYER_PROFILE_SEED;
use crate::state::{PlayerInitialized, PlayerProfile};

pub fn initialize_player(ctx: Context<InitializePlayer>) -> Result<()> {
    let profile = &mut ctx.accounts.player_profile;
    profile.owner = ctx.accounts.payer.key();
    profile.bump = ctx.bumps.player_profile;
    profile.hero_count = 0;
    profile.free_mints_claimed = false;
    profile.free_mint_count = 0;
    profile.next_hero_id = 0;
    profile.soulbound_hero_ids = Default::default();
    profile.reserved = [0; 32];

    emit!(PlayerInitialized {
        player: ctx.accounts.payer.key()
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializePlayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = PlayerProfile::LEN,
        seeds = [PLAYER_PROFILE_SEED, payer.key().as_ref()],
        bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    pub system_program: Program<'info, System>,
}

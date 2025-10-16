use anchor_lang::prelude::*;

declare_id!("7bguoQnx61Fa3XUYAAMgapejbL2MEB4Hgo1ZuQHypJGQ");

#[program]
pub mod hero_core {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

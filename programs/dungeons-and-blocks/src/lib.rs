use bolt_lang::prelude::*;

declare_id!("EgnVbCLMmHm9tR6sqJPTMGks6aGvEbCuBaNnGmhHx4Gc");

#[program]
pub mod dungeons_and_blocks {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

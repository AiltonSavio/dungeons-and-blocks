use bolt_lang::*;

declare_id!("9vTYcetJxWb7xEkry3ukmGkbTyrumU7UYUehs7xZBKfV");

#[component]
#[derive(Default)]
pub struct Position {
    pub x: i64,
    pub y: i64,
    #[max_len(20)]
    pub description: String,
}
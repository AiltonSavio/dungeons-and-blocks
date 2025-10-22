use anchor_lang::prelude::*;

use crate::constants::{MAX_EDGES, MAX_ROOMS};
use crate::errors::DungeonError;
use crate::state::{DungeonEdge, DungeonRect};

pub struct GeneratedDungeon {
    pub grid: Vec<u8>,
    pub rooms: Vec<DungeonRect>,
    pub edges: Vec<DungeonEdge>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tile {
    Floor = 0,
    Wall = 1,
}

struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    fn next_f32(&mut self) -> f32 {
        self.next_u32() as f32 / 4_294_967_296.0
    }
}

pub fn generate_dungeon(width: u16, height: u16, seed: u32) -> GeneratedDungeon {
    let mut rng = Mulberry32::new(seed);
    let w = width as usize;
    let h = height as usize;
    let mut grid = vec![Tile::Wall as u8; w * h];
    let mut rooms: Vec<DungeonRect> = Vec::with_capacity(MAX_ROOMS);

    for _ in 0..MAX_ROOMS {
        let rw = 4 + (rng.next_f32() * 9.0) as u16;
        let rh = 4 + (rng.next_f32() * 7.0) as u16;
        if rw + 2 >= width || rh + 2 >= height {
            continue;
        }
        let rx = 1 + (rng.next_f32() * ((width - rw - 2) as f32)) as u16;
        let ry = 1 + (rng.next_f32() * ((height - rh - 2) as f32)) as u16;

        for y in ry..ry + rh {
            for x in rx..rx + rw {
                set_tile(&mut grid, w, x as usize, y as usize, Tile::Floor);
            }
        }
        rooms.push(DungeonRect {
            x: rx,
            y: ry,
            w: rw,
            h: rh,
        });
    }

    rooms.sort_by_key(|r| r.x);

    let mut edges: Vec<DungeonEdge> = Vec::with_capacity(MAX_EDGES);

    for i in 1..rooms.len() {
        let a = rooms[i - 1];
        let b = rooms[i];
        let ax = a.x + (a.w >> 1);
        let ay = a.y + (a.h >> 1);
        let bx = b.x + (b.w >> 1);
        let by = b.y + (b.h >> 1);

        carve_h(&mut grid, w, ax as usize, bx as usize, ay as usize);
        carve_v(&mut grid, w, ay as usize, by as usize, bx as usize);
        edges.push(DungeonEdge {
            a: (i - 1) as u16,
            b: i as u16,
        });
    }

    GeneratedDungeon { grid, rooms, edges }
}

fn carve_h(grid: &mut [u8], width: usize, x0: usize, x1: usize, y: usize) {
    let (min, max) = if x0 <= x1 { (x0, x1) } else { (x1, x0) };
    for x in min..=max {
        set_tile(grid, width, x, y, Tile::Floor);
    }
}

fn carve_v(grid: &mut [u8], width: usize, y0: usize, y1: usize, x: usize) {
    let (min, max) = if y0 <= y1 { (y0, y1) } else { (y1, y0) };
    for y in min..=max {
        set_tile(grid, width, x, y, Tile::Floor);
    }
}

fn set_tile(grid: &mut [u8], width: usize, x: usize, y: usize, tile: Tile) {
    let idx = y * width + x;
    grid[idx] = tile as u8;
}

pub fn validate_grid_dimensions(grid_width: u16, grid_height: u16) -> Result<()> {
    require!(grid_width > 4 && grid_height > 4, DungeonError::InvalidGrid);
    let cell_count = (grid_width as usize)
        .checked_mul(grid_height as usize)
        .ok_or(DungeonError::MathOverflow)?;
    require!(cell_count <= 10_000, DungeonError::GridTooLarge);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reference_dungeon_matches_offchain_generator() {
        let generated = generate_dungeon(80, 56, 1337);
        assert_eq!(generated.grid.len(), 80 * 56);
        assert_eq!(generated.rooms.len(), 40);
        assert_eq!(generated.edges.len(), 39);
        let floor_count = generated
            .grid
            .iter()
            .filter(|&&t| t == Tile::Floor as u8)
            .count();
        assert_eq!(floor_count, 1817);
    }
}

use crate::constants::*;
use crate::state::{DungeonPoint, DungeonRoom, HeroSnapshot};

pub struct GeneratedAdventure {
    pub grid: Vec<u8>,
    pub rooms: Vec<DungeonRoom>,
    pub doors: Vec<DungeonPoint>,
    pub chests: Vec<DungeonPoint>,
    pub portals: Vec<DungeonPoint>,
}

#[derive(Clone, Copy)]
pub(crate) struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub(crate) fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    pub(crate) fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    pub(crate) fn next_f32(&mut self) -> f32 {
        self.next_u32() as f32 / 4_294_967_296.0
    }

    pub(crate) fn next_range(&mut self, min: u16, max: u16) -> u16 {
        let span = max.saturating_sub(min);
        min + ((self.next_u32() % (span as u32 + 1)) as u16)
    }
}

pub fn generate_adventure(seed: u32, width: u16, height: u16) -> GeneratedAdventure {
    let w = width.max(8) as usize;
    let h = height.max(8) as usize;
    let mut rng = Mulberry32::new(seed);

    let mut grid = vec![TILE_WALL; w * h];
    let mut rooms: Vec<DungeonRoom> = Vec::with_capacity(MAX_ROOMS);

    for _ in 0..MAX_ROOMS {
        let rw = rng.next_range(4, 12);
        let rh = rng.next_range(4, 10);
        if rw + 2 >= width || rh + 2 >= height {
            continue;
        }
        let rx = 1 + (rng.next_f32() * ((width - rw - 2) as f32)) as u16;
        let ry = 1 + (rng.next_f32() * ((height - rh - 2) as f32)) as u16;

        carve_room(
            &mut grid,
            w,
            rx as usize,
            ry as usize,
            rw as usize,
            rh as usize,
        );

        rooms.push(DungeonRoom {
            x: rx,
            y: ry,
            w: rw,
            h: rh,
        });
    }

    if rooms.is_empty() {
        let rw = width.saturating_sub(4).max(4);
        let rh = height.saturating_sub(4).max(4);
        let rx = (width.saturating_sub(rw)) / 2;
        let ry = (height.saturating_sub(rh)) / 2;
        carve_room(
            &mut grid,
            w,
            rx as usize,
            ry as usize,
            rw as usize,
            rh as usize,
        );
        rooms.push(DungeonRoom {
            x: rx,
            y: ry,
            w: rw,
            h: rh,
        });
    }

    rooms.sort_by_key(|r| (r.x, r.y));

    let mut doors: Vec<DungeonPoint> = Vec::with_capacity(MAX_DOORS);

    for i in 1..rooms.len() {
        let prev = rooms[i - 1];
        let next = rooms[i];
        let prev_center = prev.center();
        let next_center = next.center();

        carve_horizontal(
            &mut grid,
            w,
            prev_center.x as usize,
            next_center.x as usize,
            prev_center.y as usize,
        );
        carve_vertical(
            &mut grid,
            w,
            prev_center.y as usize,
            next_center.y as usize,
            next_center.x as usize,
        );

        if doors.len() < MAX_DOORS {
            push_unique_point(&mut doors, prev_center);
        }
        if doors.len() < MAX_DOORS {
            push_unique_point(&mut doors, next_center);
        }
    }

    let mut chests: Vec<DungeonPoint> = Vec::with_capacity(MAX_CHESTS);
    for room in &rooms {
        if chests.len() >= MAX_CHESTS {
            break;
        }
        if rng.next_f32() < 0.55 {
            if let Some(point) = sample_room_point(&mut rng, room) {
                push_unique_point(&mut chests, point);
            }
        }
    }

    let mut portals: Vec<DungeonPoint> = Vec::with_capacity(MAX_PORTALS);
    // Don't place portal at center of first room (that's where player starts)
    // Place it somewhere else in the first room or skip it
    if let Some(last) = rooms.last() {
        if rooms.len() > 1 {
            // If there are multiple rooms, place portal at center of last room
            push_unique_point(&mut portals, last.center());
        }
    }
    // Add portals to random rooms (skip the first room to avoid spawn position)
    for room in rooms.iter().skip(1) {
        if portals.len() >= MAX_PORTALS {
            break;
        }
        if rng.next_f32() < 0.25 {
            push_unique_point(&mut portals, room.center());
        }
    }

    ensure_floor_tiles(&mut chests, &rooms);

    GeneratedAdventure {
        grid,
        rooms,
        doors,
        chests,
        portals,
    }
}

pub fn is_floor(grid: &[u8], width: u16, x: u16, y: u16) -> bool {
    let idx = tile_index(width, x, y);
    grid.get(idx).copied().unwrap_or(TILE_WALL) == TILE_FLOOR
}

pub fn tile_index(width: u16, x: u16, y: u16) -> usize {
    let w = width as usize;
    (y as usize).saturating_mul(w) + (x as usize)
}

fn carve_room(grid: &mut [u8], width: usize, x: usize, y: usize, w: usize, h: usize) {
    for iy in y..y + h {
        for ix in x..x + w {
            grid[iy * width + ix] = TILE_FLOOR;
        }
    }
}

fn carve_horizontal(grid: &mut [u8], width: usize, x0: usize, x1: usize, y: usize) {
    let (start, end) = if x0 <= x1 { (x0, x1) } else { (x1, x0) };
    for x in start..=end {
        grid[y * width + x] = TILE_FLOOR;
    }
}

fn carve_vertical(grid: &mut [u8], width: usize, y0: usize, y1: usize, x: usize) {
    let (start, end) = if y0 <= y1 { (y0, y1) } else { (y1, y0) };
    for y in start..=end {
        grid[y * width + x] = TILE_FLOOR;
    }
}

fn sample_room_point(rng: &mut Mulberry32, room: &DungeonRoom) -> Option<DungeonPoint> {
    if room.w <= 2 || room.h <= 2 {
        return None;
    }
    let x = room.x + 1 + (rng.next_u32() % (room.w as u32 - 2)) as u16;
    let y = room.y + 1 + (rng.next_u32() % (room.h as u32 - 2)) as u16;
    Some(DungeonPoint { x, y })
}

fn push_unique_point(collection: &mut Vec<DungeonPoint>, point: DungeonPoint) {
    if !collection.iter().any(|p| *p == point) {
        collection.push(point);
    }
}

fn ensure_floor_tiles(chests: &mut [DungeonPoint], rooms: &[DungeonRoom]) {
    if rooms.is_empty() {
        return;
    }

    // Check if each chest is within ANY room, not just the first one
    for chest in chests.iter_mut() {
        let mut is_in_room = false;
        for room in rooms {
            if chest.x >= room.x
                && chest.x < room.x + room.w
                && chest.y >= room.y
                && chest.y < room.y + room.h
            {
                is_in_room = true;
                break;
            }
        }

        // If chest is not in any room, move it to the center of first room
        if !is_in_room {
            *chest = rooms[0].center();
        }
    }
}

/// Calculate stat buffs based on torch level
/// - Torch > 66: No buff (returns 0)
/// - Torch <= 66: First tier buff (returns 2 points per stat)
/// - Torch <= 33: Second tier buff (returns 5 points per stat)
pub fn get_torch_stat_buff(torch: u8) -> u8 {
    if torch <= 33 {
        5
    } else if torch <= 66 {
        2
    } else {
        0
    }
}

/// Apply torch-based stat buffs to a hero snapshot
/// Returns a modified copy of the hero with buffed stats
pub fn apply_torch_buffs(hero: &HeroSnapshot, torch: u8) -> HeroSnapshot {
    let buff = get_torch_stat_buff(torch);

    if buff == 0 {
        return *hero;
    }

    let mut buffed = *hero;
    buffed.attack = buffed.attack.saturating_add(buff);
    buffed.defense = buffed.defense.saturating_add(buff);
    buffed.magic = buffed.magic.saturating_add(buff);
    buffed.resistance = buffed.resistance.saturating_add(buff);
    buffed.speed = buffed.speed.saturating_add(buff);
    buffed.luck = buffed.luck.saturating_add(buff);

    buffed
}

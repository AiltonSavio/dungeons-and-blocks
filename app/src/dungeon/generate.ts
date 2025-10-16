import { Grid, Tile, Rect, Edge, Dungeon } from "./tiles";

export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDungeon(w: number, h: number, seed = 1337): Dungeon {
  const rnd = mulberry32(seed);
  const g: Grid = Array.from({ length: h }, () => Array(w).fill(Tile.Wall));
  const rooms: Rect[] = [];

  const roomAttempts = 40;
  for (let i = 0; i < roomAttempts; i++) {
    const rw = 4 + ((rnd() * 9) | 0);
    const rh = 4 + ((rnd() * 7) | 0);
    const rx = 1 + ((rnd() * (w - rw - 2)) | 0);
    const ry = 1 + ((rnd() * (h - rh - 2)) | 0);
    for (let y = ry; y < ry + rh; y++)
      for (let x = rx; x < rx + rw; x++) g[y][x] = Tile.Floor;
    rooms.push({ x: rx, y: ry, w: rw, h: rh });
  }

  rooms.sort((a, b) => a.x - b.x);

  const edges: Edge[] = [];
  const doorTiles: { x: number; y: number }[] = [];

  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1],
      b = rooms[i];
    const ax = a.x + (a.w >> 1),
      ay = a.y + (a.h >> 1);
    const bx = b.x + (b.w >> 1),
      by = b.y + (b.h >> 1);

    carveH(g, ax, bx, ay, doorTiles);
    carveV(g, ay, by, bx, doorTiles);
    edges.push({ a: i - 1, b: i });
  }

  const chests = placeChests(g, rooms, rnd, seed);
  const portals = placePortals(g, seed, chests);

  return { grid: g, rooms, edges, doorTiles, chests, portals };
}

function carveH(
  g: Grid,
  x0: number,
  x1: number,
  y: number,
  doors: { x: number; y: number }[]
) {
  const [min, max] = [Math.min(x0, x1), Math.max(x0, x1)];
  for (let x = min; x <= max; x++) g[y][x] = Tile.Floor;
  doors.push({ x: min, y });
  doors.push({ x: max, y }); // endpoints ≈ door frames
}
function carveV(
  g: Grid,
  y0: number,
  y1: number,
  x: number,
  doors: { x: number; y: number }[]
) {
  const [min, max] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let y = min; y <= max; y++) g[y][x] = Tile.Floor;
  doors.push({ x, y: min });
  doors.push({ x, y: max });
}

function placeChests(
  grid: Grid,
  rooms: Rect[],
  rnd: () => number,
  seed: number
): { x: number; y: number }[] {
  const floors: { x: number; y: number }[] = [];
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[0].length - 1; x++) {
      if (grid[y][x] !== Tile.Floor) continue;
      const nearWall =
        grid[y - 1][x] === Tile.Wall ||
        grid[y + 1][x] === Tile.Wall ||
        grid[y][x - 1] === Tile.Wall ||
        grid[y][x + 1] === Tile.Wall;
      if (nearWall) floors.push({ x, y });
    }
  }
  if (floors.length === 0) return [];
  const rr = mulberry32(seed ^ 0x9e3779b1);
  const count = Math.min(6, Math.max(2, Math.floor(floors.length / 150)));
  const result: { x: number; y: number }[] = [];
  while (result.length < count && floors.length > 0) {
    const idx = Math.floor(rr() * floors.length);
    const tile = floors.splice(idx, 1)[0];
    result.push(tile);
  }
  return result;
}

function placePortals(
  grid: Grid,
  seed: number,
  chests: { x: number; y: number }[]
): { x: number; y: number }[] {
  const rr = mulberry32(seed ^ 0x51a8d5b5);
  const candidates: { x: number; y: number }[] = [];
  const chestSet = new Set(chests.map((c) => `${c.x},${c.y}`));

  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[0].length - 1; x++) {
      if (grid[y][x] !== Tile.Floor) continue;
      if (chestSet.has(`${x},${y}`)) continue;
      const openNeighbors =
        (grid[y][x + 1] === Tile.Floor ? 1 : 0) +
        (grid[y][x - 1] === Tile.Floor ? 1 : 0) +
        (grid[y + 1][x] === Tile.Floor ? 1 : 0) +
        (grid[y - 1][x] === Tile.Floor ? 1 : 0);
      if (openNeighbors < 3) continue;
      candidates.push({ x, y });
    }
  }
  if (!candidates.length) return [];

  const portalCount = 4 + Math.round(rr());
  const result: { x: number; y: number }[] = [];
  while (result.length < portalCount && candidates.length > 0) {
    const idx = Math.floor(rr() * candidates.length);
    const candidate = candidates.splice(idx, 1)[0];
    result.push(candidate);
  }
  return result;
}

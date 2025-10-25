import { Grid, Tile, Rect, Edge } from "./tiles";

export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveDoorTilesFromRooms(
  rooms: Rect[],
  edges: Edge[]
): { x: number; y: number }[] {
  const doors: { x: number; y: number }[] = [];
  const seen = new Set<string>();

  const addDoor = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    doors.push({ x, y });
  };

  edges.forEach((edge) => {
    const roomA = rooms[edge.a];
    const roomB = rooms[edge.b];
    if (!roomA || !roomB) return;

    const ax = roomA.x + (roomA.w >> 1);
    const ay = roomA.y + (roomA.h >> 1);
    const bx = roomB.x + (roomB.w >> 1);
    const by = roomB.y + (roomB.h >> 1);

    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    addDoor(minX, ay);
    addDoor(maxX, ay);

    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    addDoor(bx, minY);
    addDoor(bx, maxY);
  });

  return doors;
}

export function generateChestTiles(
  grid: Grid,
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

export function generatePortalTiles(
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

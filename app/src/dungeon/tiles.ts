export enum Tile {
  Floor = 0,
  Wall = 1,
}
export type Grid = Tile[][];

export type Rect = { x: number; y: number; w: number; h: number };
export type Edge = { a: number; b: number }; // indices into rooms[]
export type Dungeon = {
  grid: Grid;
  rooms: Rect[];
  edges: Edge[];
  doorTiles: { x: number; y: number }[];
  chests: { x: number; y: number }[];
  portals: { x: number; y: number }[];
};

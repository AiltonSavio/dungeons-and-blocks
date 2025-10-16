import type Phaser from "phaser";
import type { HeroClassKey } from "../../content/units";
export { Tile, type Grid, type Rect, type Edge } from "../../dungeon/tiles";

export type { Dungeon } from "../../dungeon/tiles";

export type DungeonLike = {
  grid: import("../../dungeon/tiles").Grid;
  rooms?: import("../../dungeon/tiles").Rect[];
  edges?: import("../../dungeon/tiles").Edge[];
  doorTiles?: { x: number; y: number }[];
  chests?: { x: number; y: number }[];
  portals?: { x: number; y: number }[];
};

export type GameConfig = { tile: number; gridW: number; gridH: number };

export enum RoomState {
  Unseen = 0,
  Seen = 1,
  Cleared = 2,
}

export type RoomMeta = {
  state: RoomState;
  rolled?: "empty" | "monster" | "treasure" | "trap";
};

export type PartyMember = {
  cls: HeroClassKey;
  x: number;
  y: number;
  sprite?: Phaser.GameObjects.Sprite;
};

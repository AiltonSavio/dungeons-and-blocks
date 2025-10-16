import type Phaser from "phaser";
import type { UnitAssets } from "../../combat/types";

export type Side = "heroes" | "enemies";

export type UIMode =
  | "idle"
  | "heroMoving"
  | "mainMenu"
  | "skillsMenu"
  | "targeting";

export type Battler = {
  side: Side;
  ix: number;
  assets: UnitAssets;
  sprite: Phaser.GameObjects.Sprite;
  idleKey: string;
  hurtKey: string;
  deathKey: string;
  atkKeys: string[];
  basePos: Phaser.Math.Vector2;
  baseScale: number;
  alive: boolean;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
};

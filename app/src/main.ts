import Phaser from "phaser";
import Game from "./scenes/Game";
import Combat from "./scenes/Combat";
import { TownScene } from "./scenes/TownScene";
import { EmbarkScene } from "./scenes/EmbarkScene";

const TILE = 16;
const GRID_W = 80;
const GRID_H = 56;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root", // ← mount into the dedicated box
  backgroundColor: "#0e0f12",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE, // ← canvas always == #game-root size
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: { default: "arcade", arcade: { debug: false } },
  scene: [
    new TownScene(),
    new EmbarkScene(),
    new Game({ tile: TILE, gridW: GRID_W, gridH: GRID_H }),
    Combat,
  ],
};

// HMR/dev guard to avoid multiple canvases
declare global {
  interface Window {
    __PHASER_GAME__?: Phaser.Game;
  }
}
if (window.__PHASER_GAME__) window.__PHASER_GAME__.destroy(true);
window.__PHASER_GAME__ = new Phaser.Game(config);

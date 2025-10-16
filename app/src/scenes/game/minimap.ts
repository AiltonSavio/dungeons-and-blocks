import type Phaser from "phaser";
import { Tile, type Grid } from "./types";

type MinimapOptions = {
  scene: Phaser.Scene;
  grid: Grid;
  gridWidth: number;
  gridHeight: number;
  tileSize: number;
  uiLayer: Phaser.GameObjects.Layer;
  padding?: number;
  debugColor?: number;
  debugRadius?: number;
};

export class MinimapController {
  private grid: Grid;
  private readonly gridWidth: number;
  private readonly gridHeight: number;
  private readonly tileSize: number;
  private readonly padding: number;
  private readonly graphics: Phaser.GameObjects.Graphics;

  private explored: boolean[][];
  private mmTile = 3;
  private mmW = 0;
  private mmH = 0;
  private lastTileX = -1;
  private lastTileY = -1;

  constructor(private readonly opts: MinimapOptions) {
    this.grid = opts.grid;
    this.gridWidth = opts.gridWidth;
    this.gridHeight = opts.gridHeight;
    this.tileSize = opts.tileSize;
    this.padding = opts.padding ?? 10;
    this.explored = this.createExploredGrid();
    this.graphics = opts.scene.add.graphics().setVisible(true);
    opts.uiLayer.add(this.graphics);
    this.autosize();
  }

  /** Reset explored grid (call if dungeon regenerated). */
  reset(grid: Grid): void {
    this.grid = grid;
    this.explored = this.createExploredGrid();
    this.lastTileX = -1;
    this.lastTileY = -1;
    this.redraw();
  }

  updateLeaderWorld(xPx: number, yPx: number): boolean {
    const tx = Math.floor(xPx / this.tileSize);
    const ty = Math.floor(yPx / this.tileSize);
    if (!this.inBounds(tx, ty)) return false;

    const tileChanged = tx !== this.lastTileX || ty !== this.lastTileY;
    this.lastTileX = tx;
    this.lastTileY = ty;
    if (!tileChanged) return false;

    if (this.grid[ty][tx] === Tile.Floor && !this.explored[ty][tx]) {
      this.explored[ty][tx] = true;
      return true;
    }
    return false;
  }

  redraw(): void {
    const g = this.graphics;
    g.clear();

    // background panel
    g.fillStyle(0x000000, 0.7);
    g.fillRoundedRect(-6, -6, this.mmW + 12, this.mmH + 12, 6);
    g.lineStyle(2, 0xffffff, 0.25);
    g.strokeRoundedRect(-6, -6, this.mmW + 12, this.mmH + 12, 6);

    const s = this.mmTile;

    // draw explored floors only (NO room outlines)
    let drawnAny = false;
    g.fillStyle(0xc8d1e1, 1);
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (this.explored[y][x]) {
          g.fillRect(x * s, y * s, s, s);
          drawnAny = true;
        }
      }
    }

    // faint grid if nothing drawn yet
    if (!drawnAny) {
      g.lineStyle(1, 0xffffff, 0.06);
      for (let x = 0; x <= this.gridWidth; x++)
        g.lineBetween(x * s, 0, x * s, this.mmH);
      for (let y = 0; y <= this.gridHeight; y++)
        g.lineBetween(0, y * s, this.mmW, y * s);
    }

    // leader marker (green and bigger)
    if (this.lastTileX >= 0) {
      const cx = this.lastTileX * s + s / 2;
      const cy = this.lastTileY * s + s / 2;
      const baseR = Math.max(2, Math.floor(s * 0.45));
      const r = baseR * 3; // 3× bigger
      g.fillStyle(0x00ff66, 1);
      g.fillCircle(cx, cy, r);
      g.lineStyle(2, 0x003300, 0.8);
      g.strokeCircle(cx, cy, r);
    }
  }

  updateViewport(width: number, height: number): void {
    this.graphics.setPosition(
      width - this.padding - this.mmW,
      height - this.padding - this.mmH
    );
  }

  handleResize(width: number, height: number): void {
    this.autosize();
    this.updateViewport(width, height);
    this.redraw();
  }

  drawMarker(x: number, y: number, color: number, shape: "circle" | "cross") {
    const s = this.mmTile;
    const px = x * s + s / 2;
    const py = y * s + s / 2;
    const g = this.graphics;

    g.lineStyle(2, color, 1);
    g.fillStyle(color, 1);

    if (shape === "circle") {
      const r = Math.max(2, s * 0.45);
      g.fillCircle(px, py, r);
    } else {
      const size = Math.max(2, s * 0.5);
      g.lineBetween(px - size, py - size, px + size, py + size);
      g.lineBetween(px - size, py + size, px + size, py - size);
    }
  }

  private createExploredGrid(): boolean[][] {
    return Array.from({ length: this.gridHeight }, () =>
      Array(this.gridWidth).fill(false)
    );
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
  }

  private autosize(): void {
    const maxW = 220;
    const maxH = 160;
    const sX = Math.floor(maxW / this.gridWidth);
    const sY = Math.floor(maxH / this.gridHeight);
    this.mmTile = Math.max(1, Math.min(sX, sY));
    this.mmW = this.gridWidth * this.mmTile;
    this.mmH = this.gridHeight * this.mmTile;
  }
}

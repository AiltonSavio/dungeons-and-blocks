import Phaser from "phaser";

type TorchOptions = {
  scene: Phaser.Scene;
  worldLayer: Phaser.GameObjects.Layer;
  worldWidth: number;
  worldHeight: number;
  tileSize: number;
  visibleTiles: { width: number; height: number };
  textureKey?: string;
};

export class TorchSystem {
  private readonly scene: Phaser.Scene;
  private readonly worldLayer: Phaser.GameObjects.Layer;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly tileSize: number;
  private readonly visibleTiles: { width: number; height: number };
  private readonly textureKey: string;

  private overlay!: Phaser.GameObjects.Rectangle;
  private torchMask!: Phaser.Display.Masks.BitmapMask;
  private torchImage!: Phaser.GameObjects.Image;
  private colorOverlay!: Phaser.GameObjects.Rectangle;
  private colorStencil!: Phaser.GameObjects.Graphics;
  private colorGeoMask!: Phaser.Display.Masks.GeometryMask;
  private useMultiply = false;

  private baseTorchRadiusPx = 0;
  private torchScale = 1;
  private torchPercent = 100;
  private torchCount = 4;
  private distAccum = 0;

  constructor(options: TorchOptions) {
    this.scene = options.scene;
    this.worldLayer = options.worldLayer;
    this.worldWidth = options.worldWidth;
    this.worldHeight = options.worldHeight;
    this.tileSize = options.tileSize;
    this.visibleTiles = options.visibleTiles;
    this.textureKey = options.textureKey ?? "torchTex";
  }

  initialize(startX: number, startY: number): void {
    this.baseTorchRadiusPx =
      Math.floor(
        Math.min(this.visibleTiles.width, this.visibleTiles.height) / 1.25
      ) * this.tileSize;

    this.createTorchTexture(this.textureKey, this.baseTorchRadiusPx);

    this.overlay = this.scene.add
      .rectangle(0, 0, this.worldWidth, this.worldHeight, 0x000000, 1)
      .setOrigin(0)
      .setAlpha(1)
      .setDepth(99999);
    this.worldLayer.add(this.overlay);

    this.torchImage = this.scene.add
      .image(startX, startY, this.textureKey)
      .setVisible(false)
      .setScale(1);
    this.worldLayer.add(this.torchImage);

    this.torchMask = new Phaser.Display.Masks.BitmapMask(
      this.scene,
      this.torchImage
    );
    this.torchMask.invertAlpha = true;
    this.overlay.setMask(this.torchMask);

    this.useMultiply =
      this.scene.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer;
    this.colorOverlay = this.scene.add
      .rectangle(0, 0, this.worldWidth, this.worldHeight, 0xffffff, 0)
      .setOrigin(0)
      .setDepth(99990)
      .setBlendMode(
        this.useMultiply ? Phaser.BlendModes.MULTIPLY : Phaser.BlendModes.NORMAL
      );
    this.worldLayer.add(this.colorOverlay);

    this.colorStencil = this.scene.add.graphics().setVisible(false);
    this.worldLayer.add(this.colorStencil);
    this.colorGeoMask = this.colorStencil.createGeometryMask();
    this.colorOverlay.setMask(this.colorGeoMask);

    this.updateTorchVisual();
    this.updateColorMaskCircle(startX, startY);
  }

  updateLeaderPosition(x: number, y: number): void {
    this.torchImage.setPosition(x, y);
    this.updateColorMaskCircle(x, y);
  }

  handleTravel(distancePx: number): void {
    if (distancePx <= 0) return;
    this.distAccum += distancePx;
    while (this.distAccum >= this.tileSize) {
      this.distAccum -= this.tileSize;
      this.modifyTorch(-1);
    }
  }

  consumeTorch(): void {
    if (this.torchCount <= 0) return;
    this.torchCount--;
    this.modifyTorch(+25);
  }

  modifyTorch(delta: number): void {
    const before = this.torchPercent;
    this.torchPercent = Phaser.Math.Clamp(this.torchPercent + delta, 0, 100);
    if (this.torchPercent !== before) {
      this.updateTorchVisual();
    }
  }

  adjust(delta: number): void {
    this.modifyTorch(delta);
  }

  get percent(): number {
    return this.torchPercent;
  }

  get count(): number {
    return this.torchCount;
  }

  private updateTorchVisual(): void {
    const pct = this.torchPercent / 100;
    const minScale = 0.25;
    this.torchScale = Math.max(minScale, pct);
    this.torchImage.setScale(this.torchScale);

    if (this.torchPercent < 33) {
      const color = this.useMultiply ? 0x5e0000 : 0x2a0000;
      const alpha = this.useMultiply
        ? Phaser.Math.Linear(0.25, 0.4, (33 - this.torchPercent) / 33)
        : Phaser.Math.Linear(0.4, 0.55, (33 - this.torchPercent) / 33);
      this.colorOverlay.setFillStyle(color, alpha).setVisible(true);
    } else if (this.torchPercent < 66) {
      const color = this.useMultiply ? 0x7a3f00 : 0x251200;
      const alpha = this.useMultiply
        ? Phaser.Math.Linear(0.15, 0.28, (66 - this.torchPercent) / 33)
        : Phaser.Math.Linear(0.3, 0.42, (66 - this.torchPercent) / 33);
      this.colorOverlay.setFillStyle(color, alpha).setVisible(true);
    } else {
      this.colorOverlay.setVisible(false);
    }
  }

  private updateColorMaskCircle(cx: number, cy: number): void {
    const r = this.baseTorchRadiusPx * this.torchScale;
    this.colorStencil.clear();
    this.colorStencil.fillStyle(0xffffff, 1);
    this.colorStencil.beginPath();
    this.colorStencil.arc(cx, cy, r, 0, Math.PI * 2);
    this.colorStencil.fillPath();
    this.colorOverlay.setMask(this.colorGeoMask);
  }

  private createTorchTexture(key: string, radius: number): void {
    if (this.scene.textures.exists(key)) return;
    const size = radius * 2;
    const tex = this.scene.textures.createCanvas(key, size, size);

    if (!tex) throw new Error("Failed to create torch texture");

    const ctx = tex.context;
    const grad = ctx.createRadialGradient(
      radius,
      radius,
      0,
      radius,
      radius,
      radius
    );
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.9, "rgba(255,255,255,1)");
    grad.addColorStop(0.95, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.fill();
    tex.refresh();
  }
}

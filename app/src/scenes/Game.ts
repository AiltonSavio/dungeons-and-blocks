import Phaser from "phaser";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  HERO_ANIM_KEYS,
  HERO_SHEETS,
  HERO_CLASS_TO_KEY,
  PARTY_ORDER,
  type HeroClassKey,
} from "../content/units";
import { MinimapController } from "./game/minimap";
import { ChainDungeon, fetchDungeonByAddress } from "../state/dungeonChain";
import {
  ChainAdventure,
  createMoveHeroInstruction,
  directionFromDelta,
  fetchAdventureSessionSmart,
  deriveAdventurePda,
  getAdventureProgram,
  type AdventureDirection,
} from "../state/adventureChain";
import { deriveTempKeypair, isTempKeypairFunded } from "../state/tempKeypair";
import type { HeroClass } from "../state/models";

// ==================== TYPES ====================

enum Tile {
  Floor = 0,
  Wall = 1,
}

type Grid = number[][];

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type DungeonLike = {
  grid: Grid;
  rooms: Rect[];
  chests: { x: number; y: number }[];
  portals: { x: number; y: number }[];
};

type PartyMember = {
  cls: HeroClassKey;
  x: number;
  y: number;
  sprite?: Phaser.GameObjects.Sprite;
};

type Chest = {
  tileX: number;
  tileY: number;
  sprite: Phaser.GameObjects.Image;
  opened: boolean;
};

type Portal = {
  tileX: number;
  tileY: number;
  sprite: Phaser.GameObjects.Image;
};

type PartyHeroSnapshot = {
  id: string;
  cls: HeroClass;
  name: string;
};

type DungeonLaunchPayload = {
  dungeon: ChainDungeon;
};

type GameLaunchData = {
  seed?: number;
  heroes?: PartyHeroSnapshot[];
  dungeon?: DungeonLaunchPayload;
  adventure?: ChainAdventure;
  player?: string;
};

type GameConfig = {
  tile: number;
  gridW: number;
  gridH: number;
};

// ==================== GAME SCENE ====================

export default class Game extends Phaser.Scene {
  private tileSize: number;
  private gw: number;
  private gh: number;

  private dun!: DungeonLike;
  private grid!: Grid;

  private party: PartyMember[] = [];
  private partyHeroes: PartyHeroSnapshot[] = [];
  private partyKeys: HeroClassKey[] = PARTY_ORDER.slice();
  private partyLength = PARTY_ORDER.length;

  // Movement config
  private speed = 1.5;
  private radius!: number;
  private pxSpeed!: number;

  // Trail for followers
  private trail: Phaser.Math.Vector2[] = [];
  private trailMax = 3000;
  private followerSpacingPx = 18;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  // Camera
  private VISIBLE_TILES_W = 12;
  private VISIBLE_TILES_H = 7;
  private leaderFacing: 1 | -1 = 1;

  // Minimap
  private minimap!: MinimapController;
  private chests: Chest[] = [];
  private portals: Portal[] = [];

  // Layers
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  // Chain data
  private dungeonSeed = 1337;
  private onChainDungeon?: ChainDungeon;
  private dungeonFetchPromise?: Promise<ChainDungeon | null>;
  private adventureSession?: ChainAdventure;
  private adventureFetchPromise?: Promise<ChainAdventure | null>;
  private adventurePda?: PublicKey;
  private solanaConnection?: Connection;
  private ephemeralConnection?: Connection;
  private playerPublicKey?: PublicKey;
  private tempKeypair?: Keypair;
  private adventureSubscriptionId?: number;

  // Movement tracking
  private lastConfirmedTile?: { x: number; y: number }; // Last on-chain confirmed position
  private optimisticTile?: { x: number; y: number }; // Current optimistic position
  private movementQueue: Array<{
    direction: AdventureDirection;
    targetTile: { x: number; y: number };
    seq: number;
  }> = [];
  private movementBusy = false;
  private isDelegated = false;
  private maxDelegationCheckAttempts = 5;
  private isNearInteractable = false; // Blocks movement when near chest/portal

  // Performance tracking
  private perfSeq = 0;
  private sceneReady = false;

  private get leader(): PartyMember | undefined {
    return this.party[0];
  }

  constructor(cfg: GameConfig) {
    super("game");
    this.tileSize = cfg.tile;
    this.gw = cfg.gridW;
    this.gh = cfg.gridH;
  }

  // ==================== LIFECYCLE ====================

  init(data?: GameLaunchData) {
    this.partyHeroes = [];

    // Parse player public key
    if (data?.player) {
      try {
        this.playerPublicKey = new PublicKey(data.player);
      } catch (err) {
        console.error("Invalid player public key", err);
        this.playerPublicKey = undefined;
      }
    }

    // Parse adventure session
    if (data?.adventure) {
      this.adventureSession = data.adventure;
      try {
        this.adventurePda = new PublicKey(data.adventure.publicKey);
      } catch (err) {
        console.error("Invalid adventure public key", err);
      }
      this.adventureFetchPromise = Promise.resolve(data.adventure);
    }

    // Parse seed
    if (data?.seed !== undefined && typeof data.seed === "number") {
      this.dungeonSeed = Math.floor(data.seed);
    }

    // Parse heroes
    if (Array.isArray(data?.heroes)) {
      this.partyHeroes = data.heroes.map((hero) => ({ ...hero }));
    }

    // Parse dungeon
    const providedDungeon = data?.dungeon?.dungeon;
    if (providedDungeon) {
      this.onChainDungeon = providedDungeon;
      try {
        const publicKey = new PublicKey(providedDungeon.publicKey);
        const connection = this.getSolanaConnection();
        if (connection) {
          this.dungeonFetchPromise = fetchDungeonByAddress(
            connection,
            publicKey
          )
            .then((account) => account ?? providedDungeon)
            .catch(() => providedDungeon);
        } else {
          this.dungeonFetchPromise = Promise.resolve(providedDungeon);
        }
      } catch (err) {
        this.dungeonFetchPromise = Promise.resolve(providedDungeon);
      }
    }

    // Setup party keys
    const heroKeys = this.partyHeroes
      .map((hero) => HERO_CLASS_TO_KEY[hero.cls])
      .filter((key): key is HeroClassKey => Boolean(key));
    this.partyKeys = heroKeys.length
      ? heroKeys.slice(0, 4)
      : PARTY_ORDER.slice();
    this.partyLength = this.partyKeys.length;
  }

  preload() {
    // Character spritesheets
    (Object.keys(HERO_SHEETS) as HeroClassKey[]).forEach((c) => {
      this.load.spritesheet(HERO_ANIM_KEYS.idle(c), HERO_SHEETS[c].idle, {
        frameWidth: 100,
        frameHeight: 100,
      });
      this.load.spritesheet(HERO_ANIM_KEYS.walk(c), HERO_SHEETS[c].walk, {
        frameWidth: 100,
        frameHeight: 100,
      });
    });

    // Tiles
    this.load.image("floor_clean_tile", "assets/tiles/floor_clean_tile.png");
    this.load.image("floor_below_wall", "assets/tiles/floor_below_wall.png");
    this.load.image("wall_fill_dirt", "assets/tiles/wall_fill_dirt.png");

    // Items
    this.load.image("loot_chest_01", "assets/items/chest/chest_01.png");
    this.load.image("loot_chest_02", "assets/items/chest/chest_02.png");
    this.load.image("loot_chest_03", "assets/items/chest/chest_03.png");
    this.load.image("portal_tile", "assets/tiles/portal.png");
  }

  async create(): Promise<void> {
    // Setup cleanup
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanup();
    });

    // Reset state
    this.sceneReady = false;
    this.party = [];
    this.trail = [];
    this.chests = [];
    this.portals = [];
    this.movementQueue = [];
    this.movementBusy = false;
    this.lastConfirmedTile = undefined;
    this.optimisticTile = undefined;
    this.isNearInteractable = false;

    // Initialize temp keypair
    if (this.playerPublicKey) {
      this.initializeTempKeypair();
    }

    // Resolve adventure and dungeon data
    const adventureAccount = await this.resolveAdventureSession();
    if (adventureAccount && this.adventurePda) {
      await this.pollForDelegation();
      if (this.isDelegated) {
        await this.subscribeToAdventureAccount();
        console.log("[Game] Subscribed to adventure account changes");
      }
    }

    const resolvedDungeon = await this.resolveDungeonAccount();
    if (resolvedDungeon) {
      this.onChainDungeon = resolvedDungeon;
    }

    // Build dungeon layout
    if (adventureAccount) {
      this.applyAdventureSession(adventureAccount);
    } else {
      this.buildFallbackDungeon();
    }

    this.grid = this.dun.grid;

    // Create layers
    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer();

    // Render dungeon
    this.renderStatic();
    this.spawnChests();
    this.spawnPortals();

    // Create animations
    this.createAnimations();

    // Setup party
    this.radius = (this.tileSize - 4) * 0.5;
    this.pxSpeed = this.speed * this.tileSize;

    const adventureStart = this.adventureSession?.heroPositions?.[0];
    const hasAdventureStart =
      adventureStart &&
      Number.isFinite(adventureStart.x) &&
      Number.isFinite(adventureStart.y) &&
      this.inBounds(adventureStart.x, adventureStart.y);
    const startTile = hasAdventureStart
      ? { x: adventureStart!.x, y: adventureStart!.y }
      : this.findAnyFloor();
    this.lastConfirmedTile = { x: startTile.x, y: startTile.y };
    this.optimisticTile = { x: startTile.x, y: startTile.y };

    // Create party members
    for (let i = 0; i < this.partyLength; i++) {
      const cls = this.partyKeys[i];
      this.party.push({
        cls,
        x: (startTile.x + 0.5) * this.tileSize,
        y: (startTile.y + 0.5) * this.tileSize + i * (this.radius * 2 + 2),
      });
    }

    // Create sprites
    const BASE = 1000;
    this.party.forEach((p, i) => {
      const spr = (p.sprite = this.add
        .sprite(p.x, p.y, HERO_ANIM_KEYS.idle(p.cls), 0)
        .setOrigin(0.5));
      spr.setScale(0.55);
      spr.setDepth(BASE + (this.partyLength - i));
      spr.anims.play(HERO_ANIM_KEYS.idle(p.cls), true);
      spr.setFlipX(false);
      this.worldLayer.add(spr);
    });

    // Seed trail
    for (let i = 0; i < 10; i++) {
      this.trail.push(
        new Phaser.Math.Vector2(this.party[0].x, this.party[0].y)
      );
    }

    // Camera setup
    const leader = this.party[0];
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.gw * this.tileSize, this.gh * this.tileSize);
    cam.setRoundPixels(true);
    cam.startFollow(leader.sprite!, true, 1, 1);
    this.updateCameraZoom();

    // Input
    if (!this.input.keyboard) throw new Error("keyboard not available");
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    }) as unknown as Game["wasd"];

    // Minimap
    this.minimap = new MinimapController({
      scene: this,
      grid: this.grid,
      gridWidth: this.gw,
      gridHeight: this.gh,
      tileSize: this.tileSize,
      uiLayer: this.uiLayer,
    });
    this.minimap.updateLeaderWorld(leader.x, leader.y);
    this.minimap.redraw();
    this.minimap.updateViewport(this.scale.width, this.scale.height);

    // UI camera
    this.cameras.main.ignore(this.uiLayer.getChildren());
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.setScroll(0, 0);
    this.uiCam.setZoom(1);
    this.uiCam.ignore(this.worldLayer.getChildren());

    // Resize handling
    this.scale.on("resize", () => {
      this.updateCameraZoom();
      this.uiCam.setSize(this.scale.width, this.scale.height);
      this.minimap.handleResize(this.scale.width, this.scale.height);
    });

    // Mark scene as ready
    this.sceneReady = true;
  }

  update(_time: number, deltaMs: number): void {
    if (!this.sceneReady) return;

    const dt = Math.min(deltaMs, 50) / 1000;

    const uiW = this.uiCam?.width ?? this.scale.width;
    const uiH = this.uiCam?.height ?? this.scale.height;
    this.minimap.updateViewport(uiW, uiH);

    // Check if near interactable
    this.checkNearInteractable();

    // Block movement if near interactable and queue is not empty
    const blockMovement =
      this.isNearInteractable && this.movementQueue.length > 0;

    // Input direction
    const dir = new Phaser.Math.Vector2(
      (this.isDown(this.cursors.right) || this.isDown(this.wasd.D) ? 1 : 0) +
        (this.isDown(this.cursors.left) || this.isDown(this.wasd.A) ? -1 : 0),
      (this.isDown(this.cursors.down) || this.isDown(this.wasd.S) ? 1 : 0) +
        (this.isDown(this.cursors.up) || this.isDown(this.wasd.W) ? -1 : 0)
    );
    const moving = dir.lengthSq() > 0;
    if (moving) dir.normalize();

    // Update facing
    if (Math.abs(dir.x) > 0.01) {
      this.leaderFacing = dir.x > 0 ? 1 : -1;
      const flip = this.leaderFacing < 0;
      for (const p of this.party) p.sprite!.setFlipX(flip);
    }

    const leader = this.party[0];
    const movePx = this.pxSpeed * dt;

    // Move leader (only if not blocked)
    if (!blockMovement) {
      if (dir.x !== 0)
        leader.x = this.moveAxis(leader.x, leader.y, dir.x * movePx, "x");
      if (dir.y !== 0)
        leader.y = this.moveAxis(leader.x, leader.y, dir.y * movePx, "y");
      leader.sprite!.setPosition(leader.x, leader.y);
    }

    // Update animations
    for (const p of this.party) {
      const desired =
        moving && !blockMovement
          ? HERO_ANIM_KEYS.walk(p.cls)
          : HERO_ANIM_KEYS.idle(p.cls);
      const cur = p.sprite!.anims.currentAnim?.key;
      if (cur !== desired) p.sprite!.anims.play(desired, true);
    }

    // Update followers
    this.pushTrail(leader.x, leader.y);
    this.updateFollowers();

    // Update minimap
    this.minimap.updateLeaderWorld(leader.x, leader.y);

    // Track tile changes for on-chain movement based on visual position
    const tx = Math.floor(leader.x / this.tileSize);
    const ty = Math.floor(leader.y / this.tileSize);

    if (Number.isFinite(tx) && Number.isFinite(ty) && this.optimisticTile) {
      const dx = tx - this.optimisticTile.x;
      const dy = ty - this.optimisticTile.y;
      if ((dx !== 0 || dy !== 0) && !blockMovement) {
        const direction = directionFromDelta(dx, dy);
        if (direction && this.adventurePda && this.playerPublicKey) {
          this.queueMovement(direction, { x: tx, y: ty });
        }
      }
    }

    // Check chest proximity (but don't open if queue is processing)
    if (this.movementQueue.length === 0) {
      this.checkChestProximity();
    }
  }

  // ==================== MOVEMENT ====================

  private isDown(k?: Phaser.Input.Keyboard.Key) {
    return !!k && k.isDown;
  }

  private moveAxis(
    x: number,
    y: number,
    delta: number,
    axis: "x" | "y"
  ): number {
    let nx = x,
      ny = y;
    if (axis === "x") nx += delta;
    else ny += delta;

    const r = this.radius;
    const points = [
      { x: nx - r, y: ny - r },
      { x: nx + r, y: ny - r },
      { x: nx - r, y: ny + r },
      { x: nx + r, y: ny + r },
    ];

    for (const p of points) {
      const tx = Math.floor(p.x / this.tileSize);
      const ty = Math.floor(p.y / this.tileSize);
      if (!this.inBounds(tx, ty) || this.grid[ty][tx] === Tile.Wall) {
        return axis === "x" ? x : y;
      }
    }
    return axis === "x" ? nx : ny;
  }

  private inBounds(tx: number, ty: number) {
    return ty >= 0 && ty < this.gh && tx >= 0 && tx < this.gw;
  }

  private queueMovement(
    direction: AdventureDirection,
    targetTile: { x: number; y: number }
  ) {
    if (!this.isDelegated) {
      return;
    }

    const seq = ++this.perfSeq;
    const now = performance.now();
    console.log(
      `[Perf] Move#${seq} queued at ${now.toFixed(0)} -> (${targetTile.x},${
        targetTile.y
      })`
    );

    // Update optimistic position immediately
    this.optimisticTile = { x: targetTile.x, y: targetTile.y };

    // Add to queue with sequence number for tracking
    this.movementQueue.push({ direction, targetTile, seq });
    void this.processMovementQueue();
  }

  private async processMovementQueue(): Promise<void> {
    if (!this.adventurePda || !this.playerPublicKey || !this.tempKeypair)
      return;
    const eph = this.getEphemeralConnection();
    const connection = this.getSolanaConnection();
    if (!eph || !connection) return;

    if (this.movementBusy || this.movementQueue.length === 0) return;
    this.movementBusy = true;

    try {
      const move = this.movementQueue[0]; // Peek, don't shift yet

      // Check funding once
      const funded = await this.checkTempKeypairFunded();
      if (!funded) {
        console.error("[Game] Temp keypair not funded");
        this.rollbackToConfirmed();
        return;
      }

      // Create single move instruction
      const ix = await createMoveHeroInstruction({
        connection,
        owner: this.playerPublicKey,
        authority: this.tempKeypair.publicKey,
        adventurePda: this.adventurePda,
        heroIndex: 0,
        direction: move.direction,
      });

      // Build and send transaction with retry logic
      const maxRetries = 3;
      let success = false;

      for (let attempt = 0; attempt < maxRetries && !success; attempt++) {
        try {
          const { blockhash } = await eph.getLatestBlockhash("processed");
          const tx = new Transaction();
          tx.feePayer = this.tempKeypair.publicKey;
          tx.recentBlockhash = blockhash;
          tx.add(ix);
          tx.sign(this.tempKeypair);

          const t0 = performance.now();
          const sig = await eph.sendRawTransaction(tx.serialize(), {
            skipPreflight: true,
          });
          const dt = performance.now() - t0;
          console.log(
            `[Perf] Move#${move.seq} sent in ${dt.toFixed(0)}ms, sig: ${sig}`
          );
          success = true;

          // Remove from queue only after successful send
          this.movementQueue.shift();
        } catch (err) {
          console.error(`[Game] Move attempt ${attempt + 1} failed:`, err);
          if (attempt === maxRetries - 1) {
            // All retries failed - rollback
            console.error(
              `[Game] Move#${move.seq} failed after ${maxRetries} retries. Rolling back.`
            );
            this.rollbackToConfirmed();
            return;
          }
          // Wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, 100 * (attempt + 1))
          );
        }
      }
    } finally {
      this.movementBusy = false;
      // Process next move if any
      if (this.movementQueue.length > 0) {
        void this.processMovementQueue();
      }
    }
  }

  private rollbackToConfirmed() {
    if (!this.lastConfirmedTile) return;

    console.log(
      `[Game] Rolling back to confirmed position: (${this.lastConfirmedTile.x}, ${this.lastConfirmedTile.y})`
    );

    // Clear movement queue
    this.movementQueue = [];

    // Reset optimistic position to confirmed
    this.optimisticTile = { ...this.lastConfirmedTile };

    // Teleport sprite to confirmed position
    const leader = this.leader;
    if (leader) {
      const targetX = (this.lastConfirmedTile.x + 0.5) * this.tileSize;
      const targetY = (this.lastConfirmedTile.y + 0.5) * this.tileSize;

      leader.x = targetX;
      leader.y = targetY;
      leader.sprite?.setPosition(targetX, targetY);

      // Reset trail
      this.trail = [];
      for (let i = 0; i < 10; i++) {
        this.trail.push(new Phaser.Math.Vector2(targetX, targetY));
      }

      this.updateFollowers();
    }
  }

  private checkNearInteractable() {
    if (!this.optimisticTile) {
      this.isNearInteractable = false;
      return;
    }

    const checkRadius = 1.5; // tiles

    // Check chests
    for (const chest of this.chests) {
      if (chest.opened) continue;
      const dx = this.optimisticTile.x - chest.tileX;
      const dy = this.optimisticTile.y - chest.tileY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= checkRadius) {
        this.isNearInteractable = true;
        return;
      }
    }

    // Check portals
    for (const portal of this.portals) {
      const dx = this.optimisticTile.x - portal.tileX;
      const dy = this.optimisticTile.y - portal.tileY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= checkRadius) {
        this.isNearInteractable = true;
        return;
      }
    }

    this.isNearInteractable = false;
  }

  // ==================== FOLLOWERS ====================

  private pushTrail(x: number, y: number) {
    this.trail.push(new Phaser.Math.Vector2(x, y));
    if (this.trail.length > this.trailMax) this.trail.shift();
  }

  private updateFollowers() {
    const leader = this.party[0];
    const spacing = this.followerSpacingPx;
    for (let i = 1; i < this.party.length; i++) {
      const distBack = spacing * i;
      const idx = this.sampleTrailIndexByDistance(distBack);
      const p =
        this.trail[idx] ??
        this.trail[0] ??
        new Phaser.Math.Vector2(leader.x, leader.y);
      this.party[i].x = p.x;
      this.party[i].y = p.y;
      this.party[i].sprite!.setPosition(p.x, p.y);
      this.party[i].sprite!.setFlipX(this.leaderFacing < 0);
    }
  }

  private sampleTrailIndexByDistance(distBack: number): number {
    let acc = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      acc += Phaser.Math.Distance.Between(
        this.trail[i].x,
        this.trail[i].y,
        this.trail[i - 1].x,
        this.trail[i - 1].y
      );
      if (acc >= distBack) return i - 1;
    }
    return 0;
  }

  // ==================== RENDERING ====================

  private renderStatic() {
    const s = this.tileSize;
    for (let y = 0; y < this.gh; y++) {
      for (let x = 0; x < this.gw; x++) {
        if (this.grid[y][x] === Tile.Wall) {
          const img = this.add
            .image(x * s, y * s, "wall_fill_dirt")
            .setOrigin(0, 0)
            .setDisplaySize(s, s);
          this.worldLayer.add(img);
        } else {
          const isBelowWall = y > 0 && this.grid[y - 1][x] === Tile.Wall;
          const key = isBelowWall ? "floor_below_wall" : "floor_clean_tile";
          const img = this.add
            .image(x * s, y * s, key)
            .setOrigin(0, 0)
            .setDisplaySize(s, s);
          this.worldLayer.add(img);
        }
      }
    }
  }

  private createAnimations() {
    const make = (key: string, frames: number, rate = 8) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, {
          start: 0,
          end: frames - 1,
        }),
        frameRate: rate,
        repeat: -1,
      });
    };

    (Object.keys(HERO_SHEETS) as HeroClassKey[]).forEach((c) => {
      make(HERO_ANIM_KEYS.idle(c), 6, 8);
      make(HERO_ANIM_KEYS.walk(c), 8, 10);
    });
  }

  private updateCameraZoom() {
    const targetWpx = this.VISIBLE_TILES_W * this.tileSize;
    const targetHpx = this.VISIBLE_TILES_H * this.tileSize;
    const zoomX = this.scale.width / targetWpx;
    const zoomY = this.scale.height / targetHpx;
    const raw = Math.min(zoomX, zoomY);
    const snapped = Math.max(1, Math.floor(raw));
    this.cameras.main.setZoom(snapped);
  }

  // ==================== CHESTS & PORTALS ====================

  private spawnChests() {
    const chests = this.dun.chests ?? [];
    const openedStates = this.adventureSession?.openedChests ?? [];
    chests.forEach((tile, index) => {
      const sprite = this.add
        .image(
          tile.x * this.tileSize + this.tileSize / 2,
          tile.y * this.tileSize + this.tileSize / 2,
          "loot_chest_01"
        )
        .setOrigin(0.5)
        .setDisplaySize(this.tileSize * 0.6, this.tileSize * 0.6)
        .setDepth(35);
      this.worldLayer.add(sprite);

      const alreadyOpened = openedStates[index] === 1;
      if (alreadyOpened) {
        sprite.setTexture("loot_chest_03");
      }

      this.chests.push({
        tileX: tile.x,
        tileY: tile.y,
        sprite,
        opened: alreadyOpened,
      });
    });
  }

  private spawnPortals() {
    const portals = this.dun.portals ?? [];
    const usedPortals = this.adventureSession?.usedPortals ?? [];
    portals.forEach((tile, index) => {
      const sprite = this.add
        .image(
          tile.x * this.tileSize + this.tileSize / 2,
          tile.y * this.tileSize + this.tileSize / 2,
          "portal_tile"
        )
        .setOrigin(0.5)
        .setDisplaySize(this.tileSize, this.tileSize)
        .setDepth(34)
        .setAlpha(0.9);
      sprite.setBlendMode(Phaser.BlendModes.ADD);
      if (usedPortals[index] === 1) {
        sprite.setAlpha(0.35);
      }
      this.worldLayer.add(sprite);
      this.portals.push({
        tileX: tile.x,
        tileY: tile.y,
        sprite,
      });
    });
  }

  private checkChestProximity() {
    const leader = this.party[0];
    this.chests.forEach((chest) => {
      if (chest.opened) return;
      const dx = leader.x - chest.sprite.x;
      const dy = leader.y - chest.sprite.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= this.tileSize * this.tileSize * 1.2) {
        this.openChest(chest);
      }
    });
  }

  private openChest(chest: Chest) {
    if (chest.opened) return;
    chest.opened = true;
    chest.sprite.setTexture("loot_chest_02");
    this.time.delayedCall(200, () => chest.sprite.setTexture("loot_chest_03"));
    console.log(`[Game] Opened chest at (${chest.tileX}, ${chest.tileY})`);
  }

  // ==================== CHAIN INTEGRATION ====================

  private getSolanaConnection(): Connection | undefined {
    if (typeof window === "undefined") return undefined;
    if (!this.solanaConnection) {
      const env =
        (import.meta as unknown as { env?: Record<string, string | undefined> })
          .env ?? {};
      const endpoint =
        env.VITE_SOLANA_RPC_URL ??
        (window as unknown as { __DNB_SOLANA_RPC__?: string })
          .__DNB_SOLANA_RPC__ ??
        clusterApiUrl("devnet");
      this.solanaConnection = new Connection(endpoint, "confirmed");
    }
    return this.solanaConnection;
  }

  private getEphemeralConnection(): Connection | undefined {
    if (typeof window === "undefined") return undefined;
    if (!this.ephemeralConnection) {
      const env =
        (import.meta as unknown as { env?: Record<string, string | undefined> })
          .env ?? {};
      const http =
        env.VITE_MAGICBLOCK_RPC_URL ??
        (window as unknown as { __DNB_MAGICBLOCK_RPC__?: string })
          .__DNB_MAGICBLOCK_RPC__ ??
        "https://devnet.magicblock.app";

      this.ephemeralConnection = new Connection(http, {
        commitment: "processed",
        confirmTransactionInitialTimeout: 20_000,
      } as any);
    }
    return this.ephemeralConnection;
  }

  private initializeTempKeypair(): void {
    if (!this.playerPublicKey || this.tempKeypair) return;
    this.tempKeypair = deriveTempKeypair(this.playerPublicKey);
    console.log(
      "[Game] Temp keypair initialized:",
      this.tempKeypair.publicKey.toBase58()
    );
  }

  private async checkTempKeypairFunded(): Promise<boolean> {
    if (!this.tempKeypair) return false;
    const connection = this.getSolanaConnection();
    if (!connection) return false;
    return isTempKeypairFunded(connection, this.tempKeypair);
  }

  private async verifyAdventureDelegation(): Promise<boolean> {
    if (!this.adventurePda) return false;
    const ephemeralConnection = this.getEphemeralConnection();
    if (!ephemeralConnection) return false;

    try {
      const accountInfo = await ephemeralConnection.getAccountInfo(
        this.adventurePda
      );
      if (!accountInfo) {
        console.warn(
          "[Game] Adventure account not found on ephemeral validator"
        );
        return false;
      }
      console.log("[Game] Adventure account verified on ephemeral validator");
      return true;
    } catch (err) {
      console.error("[Game] Failed to verify adventure delegation:", err);
      return false;
    }
  }

  private async subscribeToAdventureAccount(): Promise<void> {
    if (!this.adventurePda) return;
    const eph = this.getEphemeralConnection();
    if (!eph) return;

    // Clear old subscription
    if (this.adventureSubscriptionId !== undefined) {
      try {
        await eph.removeAccountChangeListener(this.adventureSubscriptionId);
      } catch {}
      this.adventureSubscriptionId = undefined;
    }

    // Subscribe to account changes
    this.adventureSubscriptionId = eph.onAccountChange(
      this.adventurePda,
      (info) => {
        if (!info) return;
        try {
          const program = getAdventureProgram(eph, this.playerPublicKey);
          const decodedData = program.coder.accounts.decode(
            "adventureSession",
            info.data
          );
          const heroPositions = decodedData.heroPositions.map((p: any) => ({
            x: Number(p.x),
            y: Number(p.y),
          }));
          if (heroPositions.length === 0) return;

          const pos = heroPositions[0];
          console.log(
            `[Game] Position confirmed on-chain: (${pos.x}, ${pos.y})`
          );

          // Update confirmed position
          this.lastConfirmedTile = { x: pos.x, y: pos.y };

          // Remove confirmed moves from queue
          this.movementQueue = this.movementQueue.filter(
            (move) => move.targetTile.x !== pos.x || move.targetTile.y !== pos.y
          );

          // If position doesn't match optimistic, rollback
          if (
            this.optimisticTile &&
            (this.optimisticTile.x !== pos.x || this.optimisticTile.y !== pos.y)
          ) {
            // Check if this is an expected intermediate position
            const isExpected = this.movementQueue.some(
              (move) =>
                move.targetTile.x === pos.x && move.targetTile.y === pos.y
            );

            if (!isExpected && this.movementQueue.length === 0) {
              // Position mismatch with empty queue - rollback
              console.warn(
                `[Game] Position mismatch: optimistic (${this.optimisticTile.x},${this.optimisticTile.y}) vs confirmed (${pos.x},${pos.y}). Rolling back.`
              );
              this.rollbackToConfirmed();
            }
          }
        } catch (err) {
          console.error(
            "[Game] Failed to handle adventure account change:",
            err
          );
        }
      },
      "processed"
    );

    console.log(
      "[Game] Subscribed to adventure PDA via WS:",
      this.adventurePda.toBase58()
    );
  }

  private async pollForDelegation(): Promise<void> {
    console.log("[Game] Polling for adventure delegation...");

    for (let i = 0; i < this.maxDelegationCheckAttempts; i++) {
      const verified = await this.verifyAdventureDelegation();

      if (verified) {
        this.isDelegated = true;
        console.log(`[Game] Delegation verified on attempt ${i + 1}`);
        return;
      }

      const delay = Math.min(500 * Math.pow(2, i), 8000);
      console.log(
        `[Game] Delegation not ready, retrying in ${delay}ms (attempt ${
          i + 1
        }/${this.maxDelegationCheckAttempts})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    console.warn(
      "[Game] Failed to verify delegation after max attempts. Movement will be disabled."
    );
    this.isDelegated = false;
  }

  private async resolveAdventureSession(): Promise<ChainAdventure | null> {
    if (this.adventureFetchPromise) {
      try {
        return await this.adventureFetchPromise;
      } catch (err) {
        console.error("Failed to resolve adventure session:", err);
        return this.adventureSession ?? null;
      }
    }

    if (!this.playerPublicKey) {
      return this.adventureSession ?? null;
    }

    const dungeonAddress = this.onChainDungeon?.publicKey;
    if (!dungeonAddress) {
      return this.adventureSession ?? null;
    }

    let dungeonMint: PublicKey;
    try {
      dungeonMint = new PublicKey(dungeonAddress);
    } catch (err) {
      console.error("Invalid dungeon address for adventure lookup", err);
      return this.adventureSession ?? null;
    }

    const connection = this.getSolanaConnection();
    const ephemeralConnection = this.getEphemeralConnection();
    if (!connection || !ephemeralConnection) {
      return this.adventureSession ?? null;
    }

    try {
      const [adventurePda] = deriveAdventurePda(
        this.playerPublicKey,
        dungeonMint
      );
      this.adventurePda = adventurePda;

      this.adventureFetchPromise = fetchAdventureSessionSmart(
        connection,
        ephemeralConnection,
        adventurePda
      );
      return await this.adventureFetchPromise;
    } catch (err) {
      console.error("Failed to derive adventure PDA", err);
      return this.adventureSession ?? null;
    }
  }

  private async resolveDungeonAccount(): Promise<ChainDungeon | null> {
    if (this.dungeonFetchPromise) {
      try {
        return await this.dungeonFetchPromise;
      } catch (err) {
        console.error("Failed to resolve dungeon account:", err);
        return this.onChainDungeon ?? null;
      }
    }
    return this.onChainDungeon ?? null;
  }

  private applyAdventureSession(session: ChainAdventure) {
    this.adventureSession = session;
    if (session.publicKey) {
      try {
        this.adventurePda = new PublicKey(session.publicKey);
      } catch (err) {
        console.error("Failed to parse adventure public key", err);
      }
    }

    const width = Math.max(1, session.width || this.gw);
    const height = Math.max(1, session.height || this.gh);
    const grid: number[][] = [];
    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        row.push(session.grid[idx] ?? 1);
      }
      grid.push(row);
    }

    this.gw = width;
    this.gh = height;
    if (typeof session.seed === "number") {
      this.dungeonSeed = session.seed;
    }

    const chests = session.chests ?? [];
    const portals = session.portals ?? [];
    const rooms = session.rooms ?? [];

    this.dun = {
      grid,
      rooms,
      chests,
      portals,
    };
  }

  private buildFallbackDungeon() {
    const width = Math.max(3, this.gw);
    const height = Math.max(3, this.gh);
    const grid: Grid = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => {
        const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        return edge ? Tile.Wall : Tile.Floor;
      })
    );

    this.gw = width;
    this.gh = height;

    const rooms: Rect[] = [
      {
        x: 1,
        y: 1,
        w: Math.max(1, width - 2),
        h: Math.max(1, height - 2),
      },
    ];

    this.dun = {
      grid,
      rooms,
      chests: [],
      portals: [],
    };
  }

  private findAnyFloor(): { x: number; y: number } {
    for (let y = 0; y < this.gh; y++) {
      for (let x = 0; x < this.gw; x++) {
        if (this.grid[y][x] === Tile.Floor) return { x, y };
      }
    }
    return { x: 1, y: 1 };
  }

  private cleanup() {
    if (this.adventureSubscriptionId !== undefined) {
      const eph = this.getEphemeralConnection();
      if (eph) {
        eph
          .removeAccountChangeListener(this.adventureSubscriptionId)
          .catch((err) =>
            console.error(
              "[Game] Failed to remove adventure subscription:",
              err
            )
          );
      }
      this.adventureSubscriptionId = undefined;
    }
    this.movementQueue = [];
    this.movementBusy = false;
  }
}

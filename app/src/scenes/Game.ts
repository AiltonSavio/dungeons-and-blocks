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
  ChainHeroSnapshot,
  createMoveHeroInstruction,
  directionFromDelta,
  fetchAdventureSessionSmart,
  deriveAdventurePda,
  getAdventureProgram,
  mapAdventureAccount,
  TRAIT_NONE,
  type AdventureDirection,
} from "../state/adventureChain";
import { findTrait } from "../state/traitCatalog";
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

const STATUS_EFFECT_NAMES = ["Bleeding", "Poison", "Burn", "Chill"];

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

  // Portal modal
  private portalModalOverlay?: Phaser.GameObjects.Rectangle;
  private portalModalPanel?: Phaser.GameObjects.Container;
  private currentPortalForExit?: Portal;
  private isExitingDungeon = false;
  private lastPortalTileShown?: { x: number; y: number }; // Track which portal we've shown

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
  private heroHudTexts: Phaser.GameObjects.Text[] = [];

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
    this.lastPortalTileShown = undefined;
    this.isExitingDungeon = false;

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

    const adventureStart = this.adventureSession?.partyPosition;
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

    // Minimap with dungeon-specific storage key
    const dungeonKey =
      this.onChainDungeon?.publicKey ??
      this.dungeonSeed.toString() ??
      "default";
    this.minimap = new MinimapController({
      scene: this,
      grid: this.grid,
      gridWidth: this.gw,
      gridHeight: this.gh,
      tileSize: this.tileSize,
      uiLayer: this.uiLayer,
      storageKey: `minimap_${dungeonKey}`,
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
      this.rebuildHeroHud();
    });

    // Mark scene as ready
    this.sceneReady = true;
    this.rebuildHeroHud();
  }

  update(_time: number, deltaMs: number): void {
    if (!this.sceneReady) return;

    const dt = Math.min(deltaMs, 50) / 1000;

    const uiW = this.uiCam?.width ?? this.scale.width;
    const uiH = this.uiCam?.height ?? this.scale.height;
    this.minimap.updateViewport(uiW, uiH);

    // Check if near interactable
    this.checkNearInteractable();

    // Block movement if:
    // 1. Near interactable and queue is not empty
    // 2. Portal modal is open
    const blockMovement =
      (this.isNearInteractable && this.movementQueue.length > 0) ||
      !!this.portalModalOverlay;

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
      this.checkPortalProximity();
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

    // Mark on minimap
    this.minimap.markChestOpened(chest.tileX, chest.tileY);

    console.log(`[Game] Opened chest at (${chest.tileX}, ${chest.tileY})`);
  }

  private checkPortalProximity() {
    // Don't check if modal is already open or currently exiting
    if (this.portalModalOverlay || this.isExitingDungeon) return;

    if (this.movementQueue.length > 0) return; // Wait for queue to finish

    const leader = this.party[0];

    // Check which tile the leader is on
    const leaderTileX = Math.floor(leader.x / this.tileSize);
    const leaderTileY = Math.floor(leader.y / this.tileSize);

    // Check if player moved away from last shown portal
    if (this.lastPortalTileShown) {
      const movedAway =
        leaderTileX !== this.lastPortalTileShown.x ||
        leaderTileY !== this.lastPortalTileShown.y;
      if (movedAway) {
        // Player moved away, clear the tracking
        this.lastPortalTileShown = undefined;
      } else {
        // Still on the same portal tile that we already showed - don't re-show
        return;
      }
    }

    // Only trigger when player is ON the portal tile (not just near it)
    for (const portal of this.portals) {
      if (portal.tileX === leaderTileX && portal.tileY === leaderTileY) {
        this.showPortalPrompt(portal);
        // Track that we've shown this portal
        this.lastPortalTileShown = { x: portal.tileX, y: portal.tileY };
        break;
      }
    }
  }

  private showPortalPrompt(portal: Portal) {
    console.log(`[Game] Near portal at (${portal.tileX}, ${portal.tileY})`);

    // Don't show modal if already exiting or modal is already open
    if (this.isExitingDungeon || this.portalModalOverlay) return;

    this.currentPortalForExit = portal;

    // Create overlay
    const uiW = this.uiCam?.width ?? this.scale.width;
    const uiH = this.uiCam?.height ?? this.scale.height;

    this.portalModalOverlay = this.add
      .rectangle(0, 0, uiW, uiH, 0x000000, 0.75)
      .setOrigin(0, 0)
      .setInteractive();
    this.uiLayer.add(this.portalModalOverlay);

    // Create modal panel
    const panelW = 400;
    const panelH = 220;
    const panelX = uiW / 2;
    const panelY = uiH / 2;

    this.portalModalPanel = this.add.container(panelX, panelY);
    this.uiLayer.add(this.portalModalPanel);

    // Panel background
    const bg = this.add
      .rectangle(0, 0, panelW, panelH, 0x1a1a2e)
      .setStrokeStyle(2, 0x6dd5ff);
    this.portalModalPanel.add(bg);

    // Title
    const title = this.add
      .text(0, -panelH / 2 + 30, "Portal Discovered", {
        fontSize: "24px",
        color: "#6dd5ff",
        fontFamily: "Arial",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.portalModalPanel.add(title);

    // Description
    const desc = this.add
      .text(
        0,
        -20,
        "This portal will take you back to town.\nYour progress will be saved.",
        {
          fontSize: "16px",
          color: "#c8d1e1",
          fontFamily: "Arial",
          align: "center",
        }
      )
      .setOrigin(0.5);
    this.portalModalPanel.add(desc);

    // "Leave Dungeon" button
    const leaveBtn = this.add.rectangle(0, 50, 180, 40, 0xff6b6b);
    const leaveBtnText = this.add
      .text(0, 50, "Leave Dungeon", {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "Arial",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    leaveBtn.setInteractive({ useHandCursor: true });
    leaveBtn.on("pointerover", () => leaveBtn.setFillStyle(0xff5252));
    leaveBtn.on("pointerout", () => leaveBtn.setFillStyle(0xff6b6b));
    leaveBtn.on("pointerdown", () => {
      void this.exitViaPortal(portal);
    });

    this.portalModalPanel.add(leaveBtn);
    this.portalModalPanel.add(leaveBtnText);

    // "Keep Exploring" button
    const continueBtn = this.add.rectangle(0, 100, 180, 40, 0x4ecca3);
    const continueBtnText = this.add
      .text(0, 100, "Keep Exploring", {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "Arial",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    continueBtn.setInteractive({ useHandCursor: true });
    continueBtn.on("pointerover", () => continueBtn.setFillStyle(0x3dbb92));
    continueBtn.on("pointerout", () => continueBtn.setFillStyle(0x4ecca3));
    continueBtn.on("pointerdown", () => {
      this.closePortalModal();
    });

    this.portalModalPanel.add(continueBtn);
    this.portalModalPanel.add(continueBtnText);
  }

  private closePortalModal() {
    if (this.portalModalOverlay) {
      this.portalModalOverlay.destroy();
      this.portalModalOverlay = undefined;
    }
    if (this.portalModalPanel) {
      this.portalModalPanel.destroy();
      this.portalModalPanel = undefined;
    }
    this.currentPortalForExit = undefined;
  }

  private async exitViaPortal(portal: Portal) {
    // Prevent multiple exit attempts
    if (this.isExitingDungeon) {
      console.log("[Game] Already exiting, ignoring duplicate call");
      return;
    }
    this.isExitingDungeon = true;

    console.log(
      `[Game] Exiting via portal at (${portal.tileX}, ${portal.tileY})`
    );

    // Mark portal as used on minimap
    this.minimap.markPortalUsed(portal.tileX, portal.tileY);

    // Show loading state by updating modal text
    if (this.portalModalPanel) {
      const loadingText = this.add
        .text(0, 50, "Processing exit...", {
          fontSize: "16px",
          color: "#ffe66d",
          fontFamily: "Arial",
        })
        .setOrigin(0.5);
      this.portalModalPanel.add(loadingText);
    }

    // Call exit_adventure if we have the necessary data
    if (this.adventurePda && this.playerPublicKey && this.adventureSession) {
      try {
        console.log("[Game] Getting connections...");
        const connection = this.getSolanaConnection();
        const eph = this.getEphemeralConnection();

        if (!connection || !eph) {
          console.error("[Game] No connection available for exit");
          this.showExitError("Connection unavailable");
          return;
        }

        // Get wallet provider
        console.log("[Game] Getting wallet provider...");
        const walletProvider = this.getWalletProvider();
        console.log(
          "[Game] Wallet provider:",
          walletProvider
            ? {
                hasPublicKey: !!walletProvider.publicKey,
                publicKey: walletProvider.publicKey?.toString(),
                hasSignTransaction: !!walletProvider.signTransaction,
                hasSignAndSend: !!walletProvider.signAndSendTransaction,
              }
            : "null"
        );

        if (!walletProvider || !walletProvider.publicKey) {
          console.error("[Game] Wallet not connected");
          this.showExitError("Please connect your wallet");
          return;
        }

        // Import the function
        console.log("[Game] Importing createExitAdventureInstruction...");
        const { createExitAdventureInstruction } = await import(
          "../state/adventureChain"
        );

        // Get hero mints from adventure session
        console.log(
          "[Game] Hero mints from session:",
          this.adventureSession.heroMints
        );
        const heroMints = this.adventureSession.heroMints
          .filter((mint) => mint !== "11111111111111111111111111111111")
          .map((mint) => new PublicKey(mint));

        console.log("[Game] Filtered hero mints:", heroMints.length);

        if (heroMints.length === 0) {
          console.warn("[Game] No heroes to unlock");
          this.closePortalModal();
          this.isExitingDungeon = false;
          this.scene.start("TownScene");
          return;
        }

        // Create exit instruction using actual wallet
        console.log(
          "[Game] Creating wallet pubkey from:",
          walletProvider.publicKey.toString()
        );
        const walletPubkey = new PublicKey(walletProvider.publicKey.toString());

        console.log("[Game] Creating exit instruction...");
        console.log("[Game] - owner:", this.playerPublicKey.toBase58());
        console.log("[Game] - authority:", walletPubkey.toBase58());
        console.log("[Game] - adventurePda:", this.adventurePda.toBase58());
        console.log(
          "[Game] - heroMints:",
          heroMints.map((m) => m.toBase58())
        );

        const ix = await createExitAdventureInstruction({
          connection,
          owner: this.playerPublicKey,
          authority: walletPubkey,
          adventurePda: this.adventurePda,
          heroMints,
          fromEphemeral: true, // Exiting from delegated state
        });

        console.log("[Game] Exit instruction created successfully");

        // Build transaction for wallet signing
        console.log("[Game] Getting latest blockhash from ephemeral...");
        const { blockhash } = await eph.getLatestBlockhash("processed");
        console.log("[Game] Blockhash:", blockhash);

        const tx = new Transaction();
        tx.feePayer = walletPubkey;
        tx.recentBlockhash = blockhash;
        tx.add(ix);

        console.log("[Game] Transaction built, preparing to sign and send...");

        console.log(
          "[Game] Note: Exit with #[commit] macro MUST be sent to EPHEMERAL (hero mints are readonly now)"
        );

        // Simulate on EPHEMERAL where the delegated adventure account lives
        console.log("[Game] Attempting transaction simulation on EPHEMERAL connection...");
        try {
          const simulation = await eph.simulateTransaction(tx);
          if (simulation.value.err) {
            console.error("[Game] Simulation error:", simulation.value.err);
            console.error("[Game] Simulation logs:", simulation.value.logs);
            throw new Error(
              `Simulation failed: ${JSON.stringify(simulation.value.err)}`
            );
          } else {
            console.log("[Game] Simulation successful!");
            console.log("[Game] Simulation logs:", simulation.value.logs);
          }
        } catch (simErr) {
          console.error(
            "[Game] Simulation attempt failed:",
            simErr
          );
          throw new Error("Transaction simulation failed.");
        }

        // Sign with wallet and send to EPHEMERAL
        let signature: string;
        if (walletProvider.signTransaction) {
          console.log("[Game] Signing transaction with wallet...");
          const signed = await walletProvider.signTransaction(tx);
          console.log("[Game] Transaction signed, sending to ephemeral...");
          signature = await eph.sendRawTransaction(signed.serialize(), {
            skipPreflight: true,
          });
          console.log("[Game] Transaction sent to ephemeral:", signature);
        } else {
          throw new Error("Wallet does not support transaction signing");
        }

        console.log(`[Game] Exit transaction sent successfully: ${signature}`);

        // Success - close modal and return to town
        this.closePortalModal();
        this.isExitingDungeon = false;
        this.scene.start("TownScene");
      } catch (err: any) {
        console.error("[Game] Failed to exit adventure:", err);

        // Handle user rejection separately
        const message = err?.message ?? String(err);
        if (
          message.includes("User rejected") ||
          message.includes("user rejected") ||
          message.includes("cancelled") ||
          message.includes("canceled")
        ) {
          this.showExitError("Transaction cancelled");
        } else {
          this.showExitError("Transaction failed. Please try again.");
        }
      }
    } else {
      // No adventure session, just go back to town
      this.closePortalModal();
      this.isExitingDungeon = false;
      this.scene.start("TownScene");
    }
  }

  private showExitError(message: string) {
    this.isExitingDungeon = false;

    // Update modal to show error
    if (this.portalModalPanel) {
      // Clear children and rebuild modal with error message
      this.portalModalPanel.removeAll(true);

      const panelW = 400;
      const panelH = 220;

      // Panel background
      const bg = this.add
        .rectangle(0, 0, panelW, panelH, 0x1a1a2e)
        .setStrokeStyle(2, 0xff6b6b);
      this.portalModalPanel.add(bg);

      // Title
      const title = this.add
        .text(0, -panelH / 2 + 30, "Exit Failed", {
          fontSize: "24px",
          color: "#ff6b6b",
          fontFamily: "Arial",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.portalModalPanel.add(title);

      // Error message
      const errorText = this.add
        .text(0, -20, message, {
          fontSize: "16px",
          color: "#c8d1e1",
          fontFamily: "Arial",
          align: "center",
        })
        .setOrigin(0.5);
      this.portalModalPanel.add(errorText);

      // "Try Again" button
      const retryBtn = this.add.rectangle(0, 50, 180, 40, 0xff6b6b);
      const retryBtnText = this.add
        .text(0, 50, "Try Again", {
          fontSize: "16px",
          color: "#ffffff",
          fontFamily: "Arial",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      retryBtn.setInteractive({ useHandCursor: true });
      retryBtn.on("pointerover", () => retryBtn.setFillStyle(0xff5252));
      retryBtn.on("pointerout", () => retryBtn.setFillStyle(0xff6b6b));
      retryBtn.on("pointerdown", () => {
        if (this.currentPortalForExit) {
          // Rebuild the original modal
          this.closePortalModal();
          this.showPortalPrompt(this.currentPortalForExit);
        }
      });

      this.portalModalPanel.add(retryBtn);
      this.portalModalPanel.add(retryBtnText);

      // "Keep Exploring" button
      const continueBtn = this.add.rectangle(0, 100, 180, 40, 0x4ecca3);
      const continueBtnText = this.add
        .text(0, 100, "Keep Exploring", {
          fontSize: "16px",
          color: "#ffffff",
          fontFamily: "Arial",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      continueBtn.setInteractive({ useHandCursor: true });
      continueBtn.on("pointerover", () => continueBtn.setFillStyle(0x3dbb92));
      continueBtn.on("pointerout", () => continueBtn.setFillStyle(0x4ecca3));
      continueBtn.on("pointerdown", () => {
        this.closePortalModal();
      });

      this.portalModalPanel.add(continueBtn);
      this.portalModalPanel.add(continueBtnText);
    }
  }

  private getWalletProvider():
    | {
        publicKey?: { toString(): string } | null;
        signTransaction?: (tx: Transaction) => Promise<Transaction>;
        signAndSendTransaction?: (tx: Transaction) => Promise<string | any>;
      }
    | undefined {
    if (typeof window === "undefined") return undefined;
    const w = window as unknown as {
      solana?: {
        publicKey?: { toString(): string } | null;
        signTransaction?: (tx: Transaction) => Promise<Transaction>;
        signAndSendTransaction?: (tx: Transaction) => Promise<string | any>;
      };
    };
    return w.solana;
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
          const mapped = mapAdventureAccount(
            this.adventurePda!,
            decodedData as any
          );
          const pos = decodedData.partyPosition
            ? {
                x: Number(decodedData.partyPosition.x),
                y: Number(decodedData.partyPosition.y),
              }
            : null;
          if (!pos) return;
          console.log(
            `[Game] Position confirmed on-chain: (${pos.x}, ${pos.y})`
          );

          if (this.adventureSession) {
            this.adventureSession.heroSnapshots = mapped.heroSnapshots;
            this.adventureSession.heroCount = mapped.heroCount;
            this.adventureSession.heroMints = mapped.heroMints;
            this.adventureSession.partyPosition = mapped.partyPosition;
          } else {
            this.adventureSession = mapped;
          }
          this.rebuildHeroHud();

          // Update confirmed position
          this.lastConfirmedTile = { x: pos.x, y: pos.y };

          // Mark tile as explored in minimap
          this.minimap.markTileExplored(pos.x, pos.y);

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

    if (this.uiLayer) {
      this.rebuildHeroHud();
    }
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
    this.closePortalModal();
    this.lastPortalTileShown = undefined;
    this.isExitingDungeon = false;
    this.heroHudTexts.forEach((text) => text.destroy());
    this.heroHudTexts = [];
  }

  private rebuildHeroHud() {
    this.heroHudTexts.forEach((text) => text.destroy());
    this.heroHudTexts = [];
    if (!this.uiLayer) return;

    const snapshots = this.adventureSession?.heroSnapshots ?? [];
    if (!snapshots.length) return;

    const startX = 16;
    let cursorY = 16;
    const maxHeroes = Math.min(this.partyLength, snapshots.length);

    for (let index = 0; index < maxHeroes; index++) {
      const snapshot = snapshots[index];
      const label = this.formatHeroHud(snapshot, index);
      const text = this.add
        .text(startX, cursorY, label, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#dedede",
          align: "left",
          lineSpacing: 2,
        })
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(10_000);

      this.heroHudTexts.push(text);
      this.uiLayer.add(text);
      cursorY += text.height + 8;
    }
  }

  private formatHeroHud(snapshot: ChainHeroSnapshot, index: number): string {
    const heroMeta = this.partyHeroes[index];
    const name = heroMeta?.name ?? `Hero ${snapshot.heroId}`;
    const cls = heroMeta?.cls ?? "Unknown";
    const stressCap = snapshot.stressMax > 0 ? snapshot.stressMax : 200;
    const stressValue = Math.min(snapshot.stress, stressCap);
    const hpLine = `HP ${snapshot.currentHp}/${snapshot.maxHp} | Stress ${stressValue}/${stressCap}`;
    const statsLine = `ATK ${snapshot.attack} DEF ${snapshot.defense} MAG ${snapshot.magic} RES ${snapshot.resistance} SPD ${snapshot.speed} LCK ${snapshot.luck}`;
    const statusLine = `Status: ${this.describeStatuses(snapshot.statusEffects)}`;
    const traitsLine = `Traits: ${this.describeTraits(snapshot)}`;
    return `${name} (${cls}) Lv ${snapshot.level}\n${hpLine}\n${statsLine}\n${statusLine}\n${traitsLine}`;
  }

  private describeStatuses(mask: number): string {
    const active: string[] = [];
    STATUS_EFFECT_NAMES.forEach((label, idx) => {
      if ((mask & (1 << idx)) !== 0) {
        active.push(label);
      }
    });
    return active.length ? active.join(", ") : "None";
  }

  private describeTraits(snapshot: ChainHeroSnapshot): string {
    const positives = (snapshot.positiveTraits ?? []).filter(
      (id) => id !== TRAIT_NONE
    );
    const negatives = (snapshot.negativeTraits ?? []).filter(
      (id) => id !== TRAIT_NONE
    );

    const positiveLabels = positives
      .map((id) => findTrait("positive", id)?.name ?? `+${id}`)
      .join(", ");
    const negativeLabels = negatives
      .map((id) => findTrait("negative", id)?.name ?? `-${id}`)
      .join(", ");

    const posText = positiveLabels || "None";
    const negText = negativeLabels || "None";
    return `+ ${posText} | - ${negText}`;
  }
}

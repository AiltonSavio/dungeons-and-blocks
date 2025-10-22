import Phaser from "phaser";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  deriveDoorTilesFromRooms,
  generateChestTiles,
  generatePortalTiles,
} from "../dungeon/generate";
import {
  ENEMY_ASSETS,
  HERO_ANIM_KEYS,
  HERO_ASSETS,
  HERO_CLASS_TO_KEY,
  HERO_SHEETS,
  PARTY_ORDER,
  type HeroClassKey,
} from "../content/units";
import type { UnitAssets } from "../combat/types";
import {
  RoomState,
  type DungeonLike,
  type GameConfig,
  type Grid,
  type PartyMember,
  type Rect,
  type Edge,
  type RoomMeta,
  Tile,
} from "./game/types";
import { MinimapController } from "./game/minimap";
import { TorchSystem } from "./game/torch";
import { EncounterPrompt } from "./game/encounterPrompt";
import { RunState, type RunSnapshot } from "../state/runState";
import { StressPanel } from "../ui/stressPanel";
import { InventoryPanel } from "../ui/inventoryPanel";
import { LootModal } from "../ui/lootModal";
import type { LootReward } from "../state/loot";
import type { CombatResolution } from "../state/combatEvents";
import type { ItemId } from "../state/items";
import type { HeroClass } from "../state/models";
import { ChainDungeon, fetchDungeonByAddress } from "../state/dungeonChain";
import { setInventoryVisible } from "../ui/hudControls";

type Chest = {
  tileX: number;
  tileY: number;
  sprite: Phaser.GameObjects.Image;
  opened: boolean;
  loot: LootReward;
};

type Portal = {
  tileX: number;
  tileY: number;
  sprite: Phaser.GameObjects.Image;
};

export { Tile, RoomState };
export type { Grid, Rect, Edge, GameConfig };
export type { DungeonLike as Dungeon } from "./game/types";

type ClassKey = HeroClassKey;
type Dungeon = DungeonLike;
const AK = HERO_ANIM_KEYS;
const SHEETS = HERO_SHEETS;

type PartyHeroSnapshot = {
  id: string;
  cls: HeroClass;
  name: string;
};

type DungeonLaunchPayload = {
  source?: string;
  dungeon: ChainDungeon;
};

type GameLaunchData = {
  seed?: number;
  heroes?: PartyHeroSnapshot[];
  supplies?: Partial<Record<ItemId, number>>;
  dungeon?: DungeonLaunchPayload;
};

type SavedRunRecord = {
  snapshot: RunSnapshot;
  lastPortal: { x: number; y: number };
};

const SAVED_RUNS = new Map<string, SavedRunRecord>();

export default class Game extends Phaser.Scene {
  private tileSize: number;
  private gw: number;
  private gh: number;

  private dun!: Dungeon;
  private grid!: Grid;

  private party: PartyMember[] = [];
  private partyHeroes: PartyHeroSnapshot[] = [];
  private partyKeys: HeroClassKey[] = PARTY_ORDER.slice();
  private partyLength = PARTY_ORDER.length;

  // free-move
  private speed = 3; // tiles per second
  private radius!: number; // collision radius in px
  private pxSpeed!: number; // pixels per second

  // trail for smooth following
  private trail: Phaser.Math.Vector2[] = [];
  private trailMax = 3000;
  private followerSpacingPx = 18;

  // torch/lighting
  private torch!: TorchSystem;

  // keyboard
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  // CAMERA zoom target
  private VISIBLE_TILES_W = 12;
  private VISIBLE_TILES_H = 7;

  // facing: +1 = right (default), -1 = left
  private leaderFacing: 1 | -1 = 1;

  // ---------- Minimap ----------
  private minimap!: MinimapController;
  private run!: RunState;
  private stressPanel!: StressPanel;
  private inventoryPanel!: InventoryPanel;
  private lootModal?: LootModal;
  private chests: Chest[] = [];
  private portals: Portal[] = [];
  private inChestInteraction = false;
  private minimapMarkers: { x: number; y: number; shape: "circle" | "cross"; color: number }[] = [];
  private awaitingPortalDecision = false;
  private portalPrompt?: Phaser.GameObjects.Container;
  private portalOverlay?: Phaser.GameObjects.Rectangle;
  private currentPortal?: Portal;
  private declinedPortals = new Set<string>();
  private runKey = "";
  private savedRun?: SavedRunRecord;

  private dungeonSeed = 1337;
  private launchDungeonPayload?: DungeonLaunchPayload;
  private onChainDungeon?: ChainDungeon;
  private dungeonFetchPromise?: Promise<ChainDungeon | null>;
  private solanaConnection?: Connection;
  private launchData?: GameLaunchData;
  private sceneReady = false;

  // ---------- Layers & UI camera ----------
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  // ---------- Hybrid room + encounter ----------
  private lastRoomId: number = -2;
  private roomMeta: RoomMeta[] = [];
  private encounterPrompt?: EncounterPrompt;
  private awaitingEncounterDecision = false;
  private pendingEncounter?: { roomId: number | null; enemies: UnitAssets[] };

  // Random encounter control
  private inEncounter = false;
  private encounterCooldownS = 0; // seconds left on cooldown
  private distSinceRoll = 0; // tiles since last roll attempt
  private minTilesBetweenRolls = 2; // roll every N tiles
  private basePerTileAtFullLight = 0.02; // 2% per tile at 100% light
  private extraPerTileAtDark = 0.1; // +10% per tile at 0% light
  private minEncounterCooldownS = 4; // avoid immediate re-trigger
  private keyboardBindings: { event: string; handler: () => void }[] = [];

  constructor(cfg: GameConfig) {
    super("game");
    this.tileSize = cfg.tile;
    this.gw = cfg.gridW;
    this.gh = cfg.gridH;
  }

  init(data?: GameLaunchData) {
    this.partyHeroes = [];
    if (data && data.seed) {
      this.dungeonSeed = data.seed;
      this.launchData = data;
      this.launchDungeonPayload = data.dungeon;
      const maybeSeed = (data as GameLaunchData & { seed?: unknown }).seed;
      if (typeof maybeSeed === "number" && Number.isFinite(maybeSeed)) {
        this.dungeonSeed = Math.floor(maybeSeed);
      } else if (typeof maybeSeed === "string") {
        const parsed = Number(maybeSeed);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
          this.dungeonSeed = Math.floor(parsed);
        }
      }
      if (Array.isArray(data.heroes)) {
        this.partyHeroes = data.heroes.map((hero) => ({ ...hero }));
      }
      const dungeonPayload = data.dungeon;
      const providedDungeon = dungeonPayload?.dungeon;
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
              .catch((err) => {
                console.error("Failed to fetch dungeon account:", err);
                return providedDungeon;
              });
          } else {
            this.dungeonFetchPromise = Promise.resolve(providedDungeon);
          }
        } catch (err) {
          console.error("Invalid dungeon public key", err);
          this.dungeonFetchPromise = Promise.resolve(providedDungeon);
        }
      }
    } else {
      this.launchData = undefined;
    }

    const heroKeys = this.partyHeroes
      .map((hero) => HERO_CLASS_TO_KEY[hero.cls])
      .filter((key): key is HeroClassKey => Boolean(key));
    this.partyKeys = heroKeys.length ? heroKeys.slice(0, 4) : PARTY_ORDER.slice();
    this.partyLength = this.partyKeys.length;

    this.runKey = this.makeRunKey();
    this.savedRun = SAVED_RUNS.get(this.runKey);
  }

  preload() {
    // --- Character spritesheets (100x100 frames) ---
    (Object.keys(SHEETS) as ClassKey[]).forEach((c) => {
      this.load.spritesheet(AK.idle(c), SHEETS[c].idle, {
        frameWidth: 100,
        frameHeight: 100,
      });
      this.load.spritesheet(AK.walk(c), SHEETS[c].walk, {
        frameWidth: 100,
        frameHeight: 100,
      });
    });

    // --- Simple tiles (walls / floors) ---
    this.load.image("floor_clean_tile", "assets/tiles/floor_clean_tile.png");
   this.load.image("floor_below_wall", "assets/tiles/floor_below_wall.png");
    this.load.image("wall_fill_dirt", "assets/tiles/wall_fill_dirt.png");

    // Loot chest frames
    this.load.image("loot_chest_01", "assets/items/chest/chest_01.png");
    this.load.image("loot_chest_02", "assets/items/chest/chest_02.png");
    this.load.image("loot_chest_03", "assets/items/chest/chest_03.png");
    this.load.image("portal_tile", "assets/tiles/portal.png");
  }

  async create(): Promise<void> {
    setInventoryVisible(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => setInventoryVisible(false));
    this.releaseKeyboardBindings();

    // Reset run-scoped state when the scene restarts.
    this.sceneReady = false;
    this.party = [];
    this.trail = [];
    this.minimapMarkers = [];
    this.pendingEncounter = undefined;
    this.awaitingEncounterDecision = false;
    this.awaitingPortalDecision = false;
    this.declinedPortals.clear();
    this.currentPortal = undefined;
    this.destroyPortalPrompt();
    if (!this.partyKeys.length) {
      this.partyKeys = PARTY_ORDER.slice();
    }
    this.partyLength = this.partyKeys.length;

    // 1) Dungeon
    const resolvedDungeon = await this.resolveDungeonAccount();
    if (resolvedDungeon) {
      this.onChainDungeon = resolvedDungeon;
      this.applyDungeonAccount(resolvedDungeon);
    } else {
      this.buildFallbackDungeon();
    }
    this.grid = this.dun.grid;
    this.roomMeta = (this.dun.rooms ?? []).map(() => ({
      state: RoomState.Unseen,
    }));

    // Layers: world & UI
    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer();
    this.chests = [];
    this.portals = [];

    // 2) Draw static world
    this.renderStatic();

    // 3) Animations
    this.createAnimations();

    // 4) Party setup (continuous positions)
    this.radius = (this.tileSize - 4) * 0.5;
    this.pxSpeed = this.speed * this.tileSize;

    const startTile = this.savedRun?.lastPortal
      ? this.findReentryTile(this.savedRun.lastPortal)
      : this.findAnyFloor();
    const start = startTile;

    for (let i = 0; i < this.partyLength; i++) {
      const cls = this.partyKeys[i];
      this.party.push({
        cls,
        x: (start.x + 0.5) * this.tileSize,
        y: (start.y + 0.5) * this.tileSize + i * (this.radius * 2 + 2),
      });
    }

    // Create sprites and play idle; ensure render order: leader on top
    const BASE = 1000;
    this.party.forEach((p, i) => {
      const spr = (p.sprite = this.add
        .sprite(p.x, p.y, AK.idle(p.cls), 0)
        .setOrigin(0.5));

      spr.setScale(0.55);
      spr.setDepth(BASE + (this.partyLength - i));
      spr.anims.play(AK.idle(p.cls), true);
      spr.setFlipX(false);

      this.worldLayer.add(spr);
    });

    // seed trail
    for (let i = 0; i < 10; i++)
      this.trail.push(
        new Phaser.Math.Vector2(this.party[0].x, this.party[0].y)
      );

    // 5) Camera
    const leader = this.party[0];
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.gw * this.tileSize, this.gh * this.tileSize);
    cam.setRoundPixels(true);
    cam.startFollow(leader.sprite!, true, 1, 1);
    const startRoomId = this.roomAt(start.x, start.y);
    this.lastRoomId = startRoomId; // we are "already" in this room
    if (startRoomId >= 0) {
      this.roomMeta[startRoomId] = { state: RoomState.Cleared };
    }
    // small grace cooldown so walking rolls can't fire instantly either
    this.encounterCooldownS = this.minEncounterCooldownS;
    this.updateCameraZoom();
    (window as any).__CAMERA_ZOOM__ = this.cameras.main.zoom;

    // 6) Keyboard
    if (!this.input.keyboard) throw new Error("keyboard not available");
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    }) as unknown as Game["wasd"];
    this.bindKey("keydown-E", () => {
      if (!this.awaitingEncounterDecision) this.torch.consumeTorch();
    });

    // 7) Torch & fog
    this.torch = new TorchSystem({
      scene: this,
      worldLayer: this.worldLayer,
      worldWidth: this.gw * this.tileSize,
      worldHeight: this.gh * this.tileSize,
      tileSize: this.tileSize,
      visibleTiles: {
        width: this.VISIBLE_TILES_W,
        height: this.VISIBLE_TILES_H,
      },
    });
    this.torch.initialize(leader.x, leader.y);

    // 9) Minimap init (UI layer)
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
    this.spawnPortals();
    this.spawnChests();
    this.applyMinimapMarkers();
    this.minimap.updateViewport(this.scale.width, this.scale.height);

    // Cameras: split world/UI
    this.cameras.main.ignore(this.uiLayer.getChildren());
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.setScroll(0, 0);
    this.uiCam.setZoom(1);
    this.uiCam.ignore(this.worldLayer.getChildren());

    // Resize handling
    this.scale.on("resize", () => {
      this.updateCameraZoom();
      (window as any).__CAMERA_ZOOM__ = this.cameras.main.zoom;
      this.uiCam.setSize(this.scale.width, this.scale.height);
      this.minimap.handleResize(this.scale.width, this.scale.height);
      this.encounterPrompt?.handleResize(this.scale.width, this.scale.height);
      this.stressPanel?.refresh();
      this.repositionPortalPrompt(this.scale.width, this.scale.height);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearEncounterPrompt();
      this.stressPanel?.destroy();
      this.inventoryPanel?.destroy();
      this.lootModal?.destroy();
      this.releaseKeyboardBindings();
      this.destroyPortalPrompt();
    });

    this.run = new RunState(this.partyKeys.slice());
    if (this.savedRun?.snapshot) {
      this.run.load(this.savedRun.snapshot);
    }
    this.stressPanel = new StressPanel(this, this.run, this.uiLayer);
    this.inventoryPanel = new InventoryPanel(
      this,
      this.run.inventory,
      {
        onUse: (slot) => this.handleUseItem(slot),
        onDiscard: (slot) => this.handleDiscardItem(slot),
      },
      this.uiLayer
    );
    this.game.events.on("combatEnd", (result: CombatResolution) => {
      this.handleCombatResolution(result);
    });
    this.sceneReady = true;
  }

  update(_time: number, deltaMs: number): void {
    if (!this.sceneReady) return;
    const dt = Math.min(deltaMs, 50) / 1000;

    const uiW = this.uiCam?.width ?? this.scale.width;
    const uiH = this.uiCam?.height ?? this.scale.height;
    this.minimap.updateViewport(uiW, uiH);

    if (this.awaitingEncounterDecision || this.awaitingPortalDecision || this.inChestInteraction || this.lootModal) {
      this.checkChestProximity(true);
      this.applyMinimapMarkers();
      return;
    }

    const dir = new Phaser.Math.Vector2(
      (this.isDown(this.cursors.right) || this.isDown(this.wasd.D) ? 1 : 0) +
        (this.isDown(this.cursors.left) || this.isDown(this.wasd.A) ? -1 : 0),
      (this.isDown(this.cursors.down) || this.isDown(this.wasd.S) ? 1 : 0) +
        (this.isDown(this.cursors.up) || this.isDown(this.wasd.W) ? -1 : 0)
    );
    const moving = dir.lengthSq() > 0;
    if (moving) dir.normalize();

    // facing
    if (Math.abs(dir.x) > 0.01) {
      this.leaderFacing = dir.x > 0 ? 1 : -1;
      const flip = this.leaderFacing < 0;
      for (const p of this.party) p.sprite!.setFlipX(flip);
    }

    const leader = this.party[0];
    const prevX = leader.x,
      prevY = leader.y;
    const movePx = this.pxSpeed * dt;

    if (dir.x !== 0)
      leader.x = this.moveAxis(leader.x, leader.y, dir.x * movePx, "x");
    if (dir.y !== 0)
      leader.y = this.moveAxis(leader.x, leader.y, dir.y * movePx, "y");
    leader.sprite!.setPosition(leader.x, leader.y);

    // anim state
    for (const p of this.party) {
      const desired = moving ? AK.walk(p.cls) : AK.idle(p.cls);
      const cur = p.sprite!.anims.currentAnim?.key;
      if (cur !== desired) p.sprite!.anims.play(desired, true);
    }

    // followers
    this.pushTrail(leader.x, leader.y);
    this.updateFollowers();

    this.torch.updateLeaderPosition(leader.x, leader.y);

    const moved = Phaser.Math.Distance.Between(
      prevX,
      prevY,
      leader.x,
      leader.y
    );
    this.torch.handleTravel(moved);
    const darkness = Phaser.Math.Clamp(1 - this.torch.percent / 100, 0, 1);
    this.applyStressFromMovement(moved / this.tileSize, darkness);
    this.checkChestProximity();
    this.updateDeclinedPortalMemory(leader.x, leader.y);
    this.checkPortalProximity();

    // minimap exploration
    this.minimap.updateLeaderWorld(leader.x, leader.y);

    // room enter semantics (not shown on minimap)
    const tx = Math.floor(leader.x / this.tileSize);
    const ty = Math.floor(leader.y / this.tileSize);
    const roomId = this.roomAt(tx, ty);
    if (roomId !== this.lastRoomId) {
      this.lastRoomId = roomId;
      if (roomId >= 0) this.onEnterRoom(roomId);
    }

    // ---- random encounters while walking (torch-scaled) ----
    if (this.encounterCooldownS > 0) this.encounterCooldownS -= dt;

    // convert moved px to tiles and accumulate
    const movedTiles = moved / this.tileSize;
    this.distSinceRoll += movedTiles;

    // attempt a roll every N tiles traveled
    while (
      !this.inEncounter &&
      this.encounterCooldownS <= 0 &&
      this.distSinceRoll >= this.minTilesBetweenRolls
    ) {
      this.distSinceRoll -= this.minTilesBetweenRolls;

      // chance grows in the dark; clamp 0..1
      const perTile =
        this.basePerTileAtFullLight + this.extraPerTileAtDark * darkness;

      if (Math.random() < perTile) {
        this.startEncounter();
        break;
      }
    }

    this.applyMinimapMarkers();
  }

  // ================= Animations =================

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

    (Object.keys(SHEETS) as ClassKey[]).forEach((c) => {
      make(AK.idle(c), 6, 8);
      make(AK.walk(c), 8, 10);
    });
  }

  // ================= Movement / Collision =================

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

  // ================= Trail / Followers =================

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

  // ================= Rendering (WORLD -> worldLayer) =================

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

  // ================= Utils =================

  private makeRunKey(): string {
    const dungeon = this.launchDungeonPayload?.dungeon;
    if (dungeon) {
      if (dungeon.publicKey) {
        return `dungeon:${dungeon.publicKey}`;
      }
      if (dungeon.mintId !== undefined && dungeon.mintId !== null) {
        return `dungeon:${String(dungeon.mintId)}`;
      }
    }
    return `seed:${this.dungeonSeed}`;
  }

  private findAnyFloor(): { x: number; y: number } {
    for (let y = 0; y < this.gh; y++)
      for (let x = 0; x < this.gw; x++)
        if (this.grid[y][x] === Tile.Floor) return { x, y };
    return { x: 1, y: 1 };
  }

  private getSolanaConnection(): Connection | undefined {
    if (typeof window === "undefined") return undefined;
    if (!this.solanaConnection) {
      const env =
        (
          import.meta as unknown as {
            env?: Record<string, string | undefined>;
          }
        ).env ?? {};
      const endpoint =
        env.VITE_SOLANA_RPC_URL ??
        (window as unknown as { __DNB_SOLANA_RPC__?: string })
          .__DNB_SOLANA_RPC__ ??
        clusterApiUrl("devnet");
      this.solanaConnection = new Connection(endpoint, "confirmed");
    }
    return this.solanaConnection;
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

  private applyDungeonAccount(account: ChainDungeon) {
    const width = Math.max(1, account.gridWidth);
    const height = Math.max(1, account.gridHeight);
    const tiles = account.grid;
    const grid: number[][] = [];
    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        row.push(tiles[idx] ?? 1);
      }
      grid.push(row);
    }

    this.gw = width;
    this.gh = height;
    this.dungeonSeed = account.seed || this.dungeonSeed;
    const rooms = [...(account.rooms ?? [])];
    const edges = [...(account.edges ?? [])];
    const doorTiles = deriveDoorTilesFromRooms(rooms, edges);
    const chests = generateChestTiles(grid, this.dungeonSeed);
    const portals = generatePortalTiles(grid, this.dungeonSeed, chests);

    this.dun = {
      grid,
      rooms,
      edges,
      doorTiles,
      chests,
      portals,
    };
  }

  private buildFallbackDungeon() {
    const width = Math.max(3, this.gw);
    const height = Math.max(3, this.gh);
    const grid: Grid = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => {
        const edge =
          x === 0 || y === 0 || x === width - 1 || y === height - 1;
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
    const edges: Edge[] = [];
    const doorTiles = deriveDoorTilesFromRooms(rooms, edges);
    const chests = generateChestTiles(grid, this.dungeonSeed);
    const portals = generatePortalTiles(grid, this.dungeonSeed, chests);

    this.dun = {
      grid,
      rooms,
      edges,
      doorTiles,
      chests,
      portals,
    };
  }

  private findReentryTile(portal: { x: number; y: number }): { x: number; y: number } {
    const order = [
      { x: portal.x + 1, y: portal.y },
      { x: portal.x - 1, y: portal.y },
      { x: portal.x, y: portal.y - 1 },
      { x: portal.x, y: portal.y + 1 },
    ];
    for (const pos of order) {
      if (this.isWalkableTile(pos.x, pos.y)) return pos;
    }
    if (this.isWalkableTile(portal.x, portal.y)) return { ...portal };
    return this.findAnyFloor();
  }

  private isWalkableTile(x: number, y: number): boolean {
    if (y < 0 || y >= this.grid.length) return false;
    if (x < 0 || x >= this.grid[0].length) return false;
    return this.grid[y][x] === Tile.Floor;
  }

  // ================= Camera / Torch =================

  private updateCameraZoom() {
    const targetWpx = this.VISIBLE_TILES_W * this.tileSize; // 12*16=192
    const targetHpx = this.VISIBLE_TILES_H * this.tileSize; // 7*16=112
    const zoomX = this.scale.width / targetWpx;
    const zoomY = this.scale.height / targetHpx;
    const raw = Math.min(zoomX, zoomY);

    // Integer zoom only
    const snapped = Math.max(1, Math.floor(raw));
    this.cameras.main.setZoom(snapped);
    (window as any).__CAMERA_ZOOM__ = snapped;
  }

  private createTorchTexture(key: string, radius: number) {
    const size = radius * 2;
    const tex = this.textures.createCanvas(key, size, size);
    if (!tex) throw new Error("could not create canvas texture");

    const ctx = tex.getContext();
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

  // ================= Hybrid Room helpers (logic only) =================

  /** Returns room index at tile coords or -1 for corridors/none. */
  private roomAt(tx: number, ty: number): number {
    const rooms = this.dun.rooms ?? [];
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return i;
    }
    return -1;
  }

  private onEnterRoom(roomId: number) {
    const meta = this.roomMeta[roomId];
    if (!meta) return;

    if (meta.state === RoomState.Unseen) {
      meta.state = RoomState.Seen;

      // roll a hidden room flavor (not shown on minimap)
      const roll = Math.random();
      meta.rolled =
        roll < 0.55
          ? "monster"
          : roll < 0.8
          ? "treasure"
          : roll < 0.95
          ? "trap"
          : "empty";

      if (
        meta.rolled === "monster" &&
        !this.inEncounter &&
        this.encounterCooldownS <= 0
      ) {
        this.startEncounter(roomId);
      } else if (meta.rolled !== "monster") {
        meta.state = RoomState.Cleared;
      }
    }
  }

  // ================= Encounter stubs =================

  private startEncounter(roomId?: number) {
    if (this.inEncounter || this.awaitingEncounterDecision) return;
    this.inEncounter = true;
    this.encounterCooldownS = this.minEncounterCooldownS;
    this.awaitingEncounterDecision = true;

    const pick = <T>(arr: T[], n: number) => {
      const results: T[] = [];
      for (let i = 0; i < n; i++) {
        results.push(Phaser.Utils.Array.GetRandom(arr));
      }
      return results;
    };
    this.pendingEncounter = {
      roomId: roomId ?? null,
      enemies: pick(ENEMY_ASSETS, 4),
    };

    this.party.forEach((p) => p.sprite?.anims.play(AK.idle(p.cls), true));

    this.encounterPrompt = new EncounterPrompt({
      scene: this,
      uiLayer: this.uiLayer,
      durationSeconds: 10,
      torchPercent: () => this.torch.percent,
      enemies: this.pendingEncounter.enemies,
      onConfirm: () => this.enterPendingEncounter(),
      onFlee: () => this.cancelPendingEncounter(),
    });
    this.encounterPrompt.show(this.scale.width, this.scale.height);
  }

  private enterPendingEncounter() {
    if (!this.pendingEncounter) {
      this.awaitingEncounterDecision = false;
      return;
    }
    const { enemies } = this.pendingEncounter;
    this.clearEncounterPrompt();
    this.awaitingEncounterDecision = false;

    const heroes = this.partyKeys.map((key) => HERO_ASSETS[key]);

    // Pause overworld
    this.scene.pause();

    // Hand off to Combat scene with torch% and parties
    this.scene.launch("Combat", {
      torchPercent: this.torch.percent,
      heroes,
      enemies,
    });
  }

  private cancelPendingEncounter() {
    const roomId = this.pendingEncounter?.roomId ?? null;
    this.clearEncounterPrompt();
    this.pendingEncounter = undefined;
    this.awaitingEncounterDecision = false;
    this.inEncounter = false;
    this.encounterCooldownS = this.minEncounterCooldownS;
    this.distSinceRoll = 0;
    if (roomId !== null && this.roomMeta[roomId]) {
      this.roomMeta[roomId].state = RoomState.Unseen;
      this.roomMeta[roomId].rolled = "monster";
    }
  }

  private clearEncounterPrompt() {
    this.encounterPrompt?.destroy();
    this.encounterPrompt = undefined;
  }

  private handleCombatResolution(result: CombatResolution) {
    this.applyStressDelta(result.stressDelta);
    if (result.victory) {
      this.awaitingEncounterDecision = true;
      this.showLootModal(result.loot, () => {
        this.finalizeEncounter(true);
      });
    } else {
      this.finalizeEncounter(false);
    }
  }

  private showLootModal(loot: LootReward, onDone: () => void) {
    if (this.lootModal) this.lootModal.destroy();
    this.lootModal = new LootModal(this, loot, {
      onComplete: () => {
        this.inventoryPanel.refresh();
        this.lootModal = undefined;
        onDone();
      },
      onTakeItem: (id, qty) => {
        const success = this.run.inventory.addItem(id, qty);
        if (success) {
          this.inventoryPanel.refresh();
        }
        return success;
      },
    });
    this.lootModal.show();
  }

  private finalizeEncounter(victory: boolean) {
    const roomId = this.pendingEncounter?.roomId ?? null;
    this.clearEncounterPrompt();
    this.pendingEncounter = undefined;
    this.inEncounter = false;
    this.awaitingEncounterDecision = false;
    this.encounterCooldownS = this.minEncounterCooldownS; // brief shield
    this.distSinceRoll = 0;
    if (victory && roomId !== null && this.roomMeta[roomId]) {
      this.roomMeta[roomId].state = RoomState.Cleared;
    }

    const leaderTile = {
      x: Math.floor(this.party[0].x / this.tileSize),
      y: Math.floor(this.party[0].y / this.tileSize),
    };
    this.minimapMarkers.push({
      x: leaderTile.x,
      y: leaderTile.y,
      shape: "cross",
      color: 0xff5252,
    });
    this.applyMinimapMarkers();
  }

  private applyStressFromMovement(tiles: number, darkness: number) {
    if (tiles <= 0) return;
    if (darkness > 0.35) {
      const stress = tiles * darkness * 8;
      this.modifyPartyStress(stress);
    } else if (darkness < 0.2) {
      const relief = tiles * (0.25 - darkness) * 6;
      if (relief > 0) this.modifyPartyStress(-relief);
    }
  }

  private applyStressDelta(delta: number) {
    if (delta === 0) return;
    this.modifyPartyStress(delta);
  }

  private modifyPartyStress(delta: number) {
    this.run.partyStress.forEach((entry) => {
      this.run.modifyStress(entry.cls, delta);
    });
    this.stressPanel.refresh();
  }

  private handleUseItem(slotIndex: number) {
    const slot = this.run.inventory.getSlots()[slotIndex];
    if (!slot || !slot.def.usable) return;

    let consumed = false;
    switch (slot.def.id) {
      case "stress_tonic":
        this.modifyPartyStress(-12);
        consumed = this.run.inventory.decrementSlot(slotIndex, 1);
        break;
      case "calming_incense":
        this.modifyPartyStress(-20);
        consumed = this.run.inventory.decrementSlot(slotIndex, 1);
        break;
      case "minor_torch":
        this.torch.adjust(15);
        consumed = this.run.inventory.decrementSlot(slotIndex, 1);
        break;
      case "healing_salve":
        this.modifyPartyStress(-6);
        consumed = this.run.inventory.decrementSlot(slotIndex, 1);
        break;
      case "mystery_relic":
        consumed = false;
        break;
      case "phoenix_feather":
        consumed = false;
        break;
    }

    if (consumed) {
      this.inventoryPanel.refresh();
    }
  }

  private handleDiscardItem(slotIndex: number) {
    const removed = this.run.inventory.removeSlot(slotIndex);
    if (!removed) return;
    this.inventoryPanel.refresh();
  }

  private applyMinimapMarkers() {
    this.minimap.redraw();
    this.minimapMarkers.forEach((marker) => {
      this.minimap.drawMarker(marker.x, marker.y, marker.color, marker.shape);
    });
  }

  private spawnPortals() {
    const portals = this.dun.portals ?? [];
    portals.forEach((tile) => {
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
      this.worldLayer.add(sprite);
      this.portals.push({
        tileX: tile.x,
        tileY: tile.y,
        sprite,
      });
    });
  }

  private portalKey(portal: { tileX: number; tileY: number }): string {
    return `${portal.tileX},${portal.tileY}`;
  }

  private updateDeclinedPortalMemory(px: number, py: number) {
    if (!this.declinedPortals.size) return;
    const threshold = this.tileSize * this.tileSize * 1.4;
    const remove: string[] = [];
    for (const portal of this.portals) {
      const key = this.portalKey(portal);
      if (!this.declinedPortals.has(key)) continue;
      const cx = portal.tileX * this.tileSize + this.tileSize / 2;
      const cy = portal.tileY * this.tileSize + this.tileSize / 2;
      const distSq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (distSq > threshold) remove.push(key);
    }
    remove.forEach((key) => this.declinedPortals.delete(key));
  }

  private checkPortalProximity() {
    if (this.awaitingPortalDecision || this.portals.length === 0) return;
    const leader = this.party[0];
    const threshold = this.tileSize * this.tileSize * 1.1;
    for (const portal of this.portals) {
      const key = this.portalKey(portal);
      if (this.declinedPortals.has(key)) continue;
      const cx = portal.tileX * this.tileSize + this.tileSize / 2;
      const cy = portal.tileY * this.tileSize + this.tileSize / 2;
      const distSq = (leader.x - cx) * (leader.x - cx) + (leader.y - cy) * (leader.y - cy);
      if (distSq <= threshold) {
        this.showPortalPrompt(portal);
        break;
      }
    }
  }

  private spawnChests() {
    const chests = this.dun.chests ?? [];
    chests.forEach((tile) => {
      const loot = this.rollChestLoot();
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
      this.chests.push({
        tileX: tile.x,
        tileY: tile.y,
        sprite,
        opened: false,
        loot,
      });
    });
  }

  private checkChestProximity(skipOpen = false) {
    const leader = this.party[0];
    this.chests.forEach((chest) => {
      if (chest.opened) return;
      const dx = leader.x - chest.sprite.x;
      const dy = leader.y - chest.sprite.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= (this.tileSize * this.tileSize) * 1.2) {
        if (!skipOpen) this.openChest(chest);
      }
    });
  }

  private openChest(chest: Chest) {
    if (chest.opened || this.lootModal) return;
    chest.opened = true;
    chest.sprite.setTexture("loot_chest_02");
    this.time.delayedCall(200, () => chest.sprite.setTexture("loot_chest_03"));
    this.minimapMarkers.push({
      x: chest.tileX,
      y: chest.tileY,
      shape: "circle",
      color: 0xffe66d,
    });
    this.applyMinimapMarkers();
    this.inChestInteraction = true;
    this.showLootModal(chest.loot, () => {
      this.inChestInteraction = false;
    });
  }

  private rollChestLoot(): LootReward {
    const loot: LootReward = {
      gold: 0,
      items: [],
    };
    loot.items.push({ id: "pouch_gold", quantity: Phaser.Math.Between(1, 3) });
    const extras: ItemId[] = [
      "stress_tonic",
      "minor_torch",
      "healing_salve",
      "mystery_relic",
    ];
    const bonusCount = Phaser.Math.Between(1, 3);
    for (let i = 0; i < bonusCount; i++) {
      loot.items.push({ id: Phaser.Utils.Array.GetRandom(extras), quantity: 1 });
    }
    return loot;
  }

  private showPortalPrompt(portal: Portal) {
    if (this.awaitingPortalDecision && this.currentPortal === portal) return;
    this.destroyPortalPrompt();
    this.awaitingPortalDecision = true;
    this.currentPortal = portal;

    const width = this.scale.width;
    const height = this.scale.height;

    this.portalOverlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.65)
      .setOrigin(0)
      .setDepth(1850)
      .setInteractive();
    this.uiLayer.add(this.portalOverlay);

    const panelWidth = Math.min(460, width * 0.85);
    const panelHeight = 220;
    this.portalPrompt = this.add.container(width / 2, height / 2).setDepth(1860);
    this.uiLayer.add(this.portalPrompt);

    const bg = this.add
      .rectangle(0, 0, panelWidth, panelHeight, 0x0b0c10, 0.92)
      .setStrokeStyle(2, 0x2d3343, 1)
      .setOrigin(0.5);
    const title = this.add
      .text(0, -panelHeight / 2 + 42, "Portal Discovered", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "24px",
        color: "#f4f6fd",
      })
      .setOrigin(0.5);
    const body = this.add
      .text(0, -10, "Leave the dungeon with your haul or keep exploring?", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "16px",
        color: "#b7c4df",
        align: "center",
        wordWrap: { width: panelWidth - 80 },
      })
      .setOrigin(0.5);

    const buttons = this.add.container(0, panelHeight / 2 - 58);
    const leave = this.createPromptButton("Leave", 0x3aa3ff, () =>
      this.exitViaPortal(portal)
    ).setPosition(-110, 0);
    const stay = this.createPromptButton("Keep Exploring", 0x2f8f4d, () =>
      this.dismissPortalPrompt(true)
    ).setPosition(110, 0);
    buttons.add([leave, stay]);

    this.portalPrompt.add([bg, title, body, buttons]);
    this.repositionPortalPrompt(width, height);
  }

  private dismissPortalPrompt(declined: boolean) {
    if (this.currentPortal) {
      if (declined) {
        this.declinedPortals.add(this.portalKey(this.currentPortal));
      } else {
        this.minimapMarkers.push({
          x: this.currentPortal.tileX,
          y: this.currentPortal.tileY,
          shape: "cross",
          color: 0x6dd5ff,
        });
        this.applyMinimapMarkers();
      }
    }
    this.portalPrompt?.destroy(true);
    this.portalOverlay?.destroy();
    this.portalPrompt = undefined;
    this.portalOverlay = undefined;
    this.awaitingPortalDecision = false;
    this.currentPortal = undefined;
  }

  private destroyPortalPrompt() {
    if (!this.portalPrompt && !this.portalOverlay) return;
    this.portalPrompt?.destroy(true);
    this.portalOverlay?.destroy();
    this.portalPrompt = undefined;
    this.portalOverlay = undefined;
    this.awaitingPortalDecision = false;
    this.currentPortal = undefined;
  }

  private repositionPortalPrompt(width: number, height: number) {
    this.portalOverlay?.setSize(width, height).setPosition(0, 0);
    this.portalPrompt?.setPosition(width / 2, height / 2);
  }

  private createPromptButton(
    label: string,
    fill: number,
    handler: () => void
  ): Phaser.GameObjects.Container {
    const rect = this.add
      .rectangle(0, 0, 200, 48, fill, 1)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0xffffff, 0.25)
      .setInteractive({ useHandCursor: true });
    rect.on("pointerover", () => rect.setFillStyle(fill, 0.85));
    rect.on("pointerout", () => rect.setFillStyle(fill, 1));
    rect.on("pointerdown", handler);

    const text = this.add
      .text(0, 0, label, {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "18px",
        color: "#f4f6fd",
      })
      .setOrigin(0.5);

    return this.add.container(0, 0, [rect, text]);
  }

  private exitViaPortal(portal: Portal) {
    this.dismissPortalPrompt(false);
    const record: SavedRunRecord = {
      snapshot: this.run.toJSON(),
      lastPortal: { x: portal.tileX, y: portal.tileY },
    };
    SAVED_RUNS.set(this.runKey, record);
    this.savedRun = record;
    this.scene.start("TownScene");
  }

  private bindKey(event: string, handler: () => void) {
    const kb = this.input.keyboard;
    if (!kb) return;
    const wrapped = () => handler();
    kb.on(event, wrapped);
    this.keyboardBindings.push({ event, handler: wrapped });
  }

  private releaseKeyboardBindings() {
    const kb = this.input.keyboard;
    if (!kb) {
      this.keyboardBindings = [];
      return;
    }
    this.keyboardBindings.forEach(({ event, handler }) => {
      kb.off(event, handler);
    });
    this.keyboardBindings = [];
  }
}

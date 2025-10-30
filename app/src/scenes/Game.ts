import Phaser from "phaser";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  HERO_ANIM_KEYS,
  HERO_SHEETS,
  HERO_CLASS_TO_KEY,
  PARTY_ORDER,
  ENEMY_ASSETS,
  type HeroClassKey,
} from "../content/units";
import { MinimapController } from "./game/minimap";
import { ChainDungeon, fetchDungeonByAddress } from "../state/dungeonChain";
import {
  ChainAdventure,
  ChainHeroSnapshot,
  TRAIT_NONE,
  createExitAdventureInstruction,
  createMoveHeroInstruction,
  createOpenChestInstruction,
  createPickupItemInstruction,
  createDropItemInstruction,
  deriveAdventurePda,
  directionFromDelta,
  fetchAdventureSessionSmart,
  createBeginEncounterInstruction,
  createDeclineEncounterInstruction,
  createUseItemInstruction,
  type AdventureDirection,
  fetchAdventureSession,
} from "../state/adventureChain";
import { findTrait } from "../state/traitCatalog";
import type { HeroClass, ItemDefinition } from "../state/models";
import { deriveTempKeypair, isTempKeypairFunded } from "../state/tempKeypair";
import {
  InventoryItemParam,
  InventorySlotView,
  ITEM_DEFINITIONS,
  ITEM_ID_TO_KEY,
  ITEM_KEY_TO_ID,
  ITEM_SLOT_EMPTY,
  SupplySlot,
  type ItemId,
} from "../state/items";
import { Inventory, type InventorySnapshot } from "../state/inventory";
import {
  ChestLootModal,
  type ChestLootRow,
  type ChestInventoryRow,
  type ChestLootSelection,
} from "../ui/chestLootModal";
import { EncounterPrompt } from "./game/encounterPrompt";
import type { UnitAssets } from "../combat/types";

function isDefaultPubkey(pk: PublicKey | undefined) {
  return !pk || pk.equals(PublicKey.default);
}

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
  index: number;
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
  supplies?: SupplySlot[];
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
const COMBAT_SCENE_KEY = "Combat";

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
  private chestModal?: ChestLootModal;
  private processingChest = false;
  private lastChestModalDismissed = 0;
  private lastChestLootSource = 255;
  private readonly chestModalCooldownMs = 800;
  private activeChestIndex: number | null = null;
  private dismissedChestIndex: number | null = null;
  private dismissedChestTile?: { x: number; y: number };
  private encounterPrompt?: EncounterPrompt;

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
  private playerPublicKey?: PublicKey;
  private tempKeypair?: Keypair;
  private tempWalletAdapter?: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
    signAndSendTransaction: (tx: Transaction) => Promise<string>;
  };
  private heroHudTexts: Phaser.GameObjects.Text[] = [];
  private heroHudPanel?: Phaser.GameObjects.Container;
  private heroHudBg?: Phaser.GameObjects.Graphics;

  private inventoryPanel?: Phaser.GameObjects.Container;
  private inventorySlots: InventorySlotView[] = [];
  private INVENTORY_SLOTS = 6;
  private inventoryMargin = 12;
  private inventoryPad = 10;
  private inventoryCols = 3;
  private inventoryCell = 48;
  private inventoryGap = 8;
  private inventoryPanelW = 0;
  private inventoryPanelH = 0;

  private initialSupplies?: SupplySlot[];

  // Movement tracking
  private lastConfirmedTile?: { x: number; y: number }; // Last on-chain confirmed position
  private optimisticTile?: { x: number; y: number }; // Current optimistic position
  private movementQueue: Array<{
    direction: AdventureDirection;
    targetTile: { x: number; y: number };
    seq: number;
  }> = [];
  private movementBusy = false;
  private isWaitingForCombat = false;
  private isNearInteractable = false; // Blocks movement when near chest/portal

  // Performance tracking
  private perfSeq = 0;
  private sceneReady = false;

  private latencyMsEWMA = 350;
  private readonly latencyAlpha = 0.55;
  private readonly minLatencyMs = 80;
  private readonly maxLatencyMs = 800;
  private readonly safetyFactor = 0.8;
  private readonly minTPS = 0.4;
  private readonly maxTPS = 2.2;

  // Camera mask-based fog
  private fogMaskG?: Phaser.GameObjects.Image;
  private fogCamMask?: Phaser.Display.Masks.BitmapMask;
  private fogEnabled = true;

  // Torch / fog UI
  private torchPct: number = 100; // 0..100
  private lastTorchPct: number = -1;
  private torchHud?: {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Rectangle;
    fill: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
  };
  private tintOverlay?: Phaser.GameObjects.Rectangle;

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
    console.log("[Game] init", data);

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

    if (Array.isArray(data?.supplies)) {
      this.initialSupplies = data!.supplies;
    }

    if (this.playerPublicKey) {
      this.initializeTempKeypair();
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

    const itemIcons = [
      "pouch_gold",
      "stress_tonic",
      "minor_torch",
      "healing_salve",
      "mystery_relic",
      "calming_incense",
      "phoenix_feather",
    ];
    itemIcons.forEach((k) => {
      this.load.image(`item_${k}`, `assets/items/${k}.png`);
    });
  }

  async create(): Promise<void> {
    // Setup cleanup
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanup();
    });
    this.events.on(Phaser.Scenes.Events.RESUME, this.handleSceneResume, this);

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

    // Resolve adventure and dungeon data
    const adventureAccount = await this.resolveAdventureSession();

    const resolvedDungeon = await this.resolveDungeonAccount();
    if (resolvedDungeon) {
      this.onChainDungeon = resolvedDungeon;
    }

    // Build dungeon layout
    if (adventureAccount) {
      this.applyAdventureSession(adventureAccount);
      if (adventureAccount && Number.isFinite(adventureAccount.torch)) {
        this.setTorchPct(adventureAccount.torch);
      }
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

    this.buildInventoryHud();
    this.positionInventoryHud();

    if (this.initialSupplies) {
      const hudItems = this.suppliesToHudItems(this.initialSupplies);
      this.setInventory(hudItems);
    }

    this.syncInventoryFromAdventure();

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

    this.recomputeMovementSpeed();

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

    this.buildTorchHud();

    // Resize handling
    this.scale.on("resize", () => {
      this.updateCameraZoom();
      this.uiCam.setSize(this.scale.width, this.scale.height);
      this.minimap.handleResize(this.scale.width, this.scale.height);
      this.positionInventoryHud();
      this.rebuildHeroHud();
      this.positionTorchHud();
      this.applyScreenTintForTorch(this.torchPct);
      this.updateCameraFogUsingTorch();
      this.encounterPrompt?.handleResize(this.scale.width, this.scale.height);
    });

    // Mark scene as ready
    this.sceneReady = true;
    this.rebuildHeroHud();

    this.initCameraFog();

    await this.resumeCombatIfActive();
  }

  update(_time: number, deltaMs: number): void {
    if (!this.sceneReady) return;

    const currentPct = this.adventureSession?.torch;
    if (Number.isFinite(currentPct) && currentPct !== this.lastTorchPct) {
      this.lastTorchPct = currentPct as number;
      this.setTorchPct(this.lastTorchPct);
    }

    const dt = Math.min(deltaMs, 50) / 1000;

    const uiW = this.uiCam?.width ?? this.scale.width;
    const uiH = this.uiCam?.height ?? this.scale.height;
    this.minimap.updateViewport(uiW, uiH);

    // Check if near interactable
    this.checkNearInteractable();

    // Block movement if:
    // 1. Near interactable and queue is not empty
    // 2. Portal modal is open
    // 3. Waiting for combat to start
    const blockMovement =
      (this.isNearInteractable && this.movementQueue.length > 0) ||
      !!this.portalModalOverlay ||
      !!this.chestModal ||
      this.processingChest ||
      this.isWaitingForCombat;

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

      if (
        this.dismissedChestIndex !== null &&
        this.dismissedChestTile &&
        (this.dismissedChestTile.x !== tx || this.dismissedChestTile.y !== ty)
      ) {
        this.dismissedChestIndex = null;
        this.dismissedChestTile = undefined;
      }
    }

    if (this.sceneReady && this.fogEnabled) {
      this.updateCameraFog();
    }

    // Check chest proximity (but don't open if queue is processing)
    if (this.movementQueue.length === 0) {
      this.checkChestProximity();
      this.checkPortalProximity();
    }
  }

  // ==================== MOVEMENT ====================

  private recomputeMovementSpeed() {
    const ms = Phaser.Math.Clamp(
      this.latencyMsEWMA,
      this.minLatencyMs,
      this.maxLatencyMs
    );
    const chainTPS = 1000 / ms; // confirmations per second
    const desiredTPS = Phaser.Math.Clamp(
      chainTPS * this.safetyFactor,
      this.minTPS,
      this.maxTPS
    );
    this.speed = desiredTPS; // tiles per second
    this.pxSpeed = this.speed * this.tileSize; // pixels per second
    // (Optional) adjust follower spacing so trains look natural at higher speed
    this.followerSpacingPx = Phaser.Math.Clamp(18 * (this.speed / 1.5), 12, 36);
  }

  private registerMoveLatency(ms: number) {
    this.latencyMsEWMA =
      this.latencyAlpha * ms + (1 - this.latencyAlpha) * this.latencyMsEWMA;
    this.recomputeMovementSpeed();
  }

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
    if (!this.tempKeypair) {
      console.warn("[Game] Temp keypair unavailable; skipping movement");
      return;
    }
    const expectedDelegate = this.tempKeypair.publicKey.toBase58();
    if (
      !this.adventureSession ||
      this.adventureSession.delegate !== expectedDelegate
    ) {
      console.warn(
        "[Game] Adventure delegate mismatch; movement requires re-arming the temp key."
      );
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

    if (this.movementQueue.length > 0 || this.movementBusy) return;

    // Add to queue with sequence number for tracking
    this.movementQueue.push({ direction, targetTile, seq });
    void this.processMovementQueue();
  }

  private async processMovementQueue(): Promise<void> {
    if (!this.adventurePda || !this.playerPublicKey || !this.tempKeypair)
      return;
    const connection = this.getSolanaConnection();
    if (!connection) {
      console.warn("[Game] Connection unavailable for movement");
      this.rollbackToConfirmed();
      return;
    }

    if (this.movementBusy || this.movementQueue.length === 0) return;
    this.movementBusy = true;

    try {
      const move = this.movementQueue[0]; // Peek, don't shift yet

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
          const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash("confirmed");
          const tx = new Transaction();
          tx.feePayer = this.tempKeypair.publicKey;
          tx.recentBlockhash = blockhash;
          tx.add(ix);
          tx.sign(this.tempKeypair);

          const signature = await connection.sendRawTransaction(
            tx.serialize(),
            {
              skipPreflight: false,
            }
          );

          const t0 = performance.now();
          await connection.confirmTransaction(
            { signature, blockhash, lastValidBlockHeight },
            "confirmed"
          );
          const dt = performance.now() - t0;
          console.log(
            `[Perf] Move#${move.seq} confirmed in ${dt.toFixed(0)}ms`
          );
          success = true;

          this.registerMoveLatency(dt);

          // Remove from queue only after successful send
          this.movementQueue.shift();

          // Refresh adventure state from base layer
          const updated = await fetchAdventureSessionSmart(
            connection,
            null,
            this.adventurePda
          );
          if (updated) {
            this.applyAdventureSession(updated);
            this.lastConfirmedTile = {
              x: updated.partyPosition.x,
              y: updated.partyPosition.y,
            };
            this.optimisticTile = { ...this.lastConfirmedTile };

            // Check for encounter
            if (
              updated.pendingEncounterSeed !== 0n &&
              !this.isWaitingForCombat
            ) {
              this.handleEncounter();
            }
          }
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
        index,
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
    const pendingSource = this.adventureSession?.pendingLootSource ?? 255;
    const pendingCount = this.adventureSession?.pendingLootCount ?? 0;
    const leaderTileX = Math.floor(leader.x / this.tileSize);
    const leaderTileY = Math.floor(leader.y / this.tileSize);

    this.chests.forEach((chest) => {
      const hasPendingForChest =
        pendingCount > 0 &&
        pendingSource !== 255 &&
        pendingSource === chest.index;
      const now = performance.now();
      const recentlyDismissed =
        hasPendingForChest &&
        this.lastChestLootSource === chest.index &&
        now - this.lastChestModalDismissed < this.chestModalCooldownMs;
      const dismissedAndStationary =
        hasPendingForChest &&
        this.dismissedChestIndex === chest.index &&
        this.dismissedChestTile &&
        this.dismissedChestTile.x === leaderTileX &&
        this.dismissedChestTile.y === leaderTileY;

      const isOnChest =
        leaderTileX === chest.tileX && leaderTileY === chest.tileY;

      if (chest.opened) {
        if (
          hasPendingForChest &&
          !this.chestModal &&
          !recentlyDismissed &&
          !dismissedAndStationary &&
          isOnChest
        ) {
          if (this.adventureSession) {
            this.showChestLootModal(this.adventureSession);
          }
        }
        return;
      }

      if (!isOnChest) {
        return;
      }

      if (dismissedAndStationary || recentlyDismissed) {
        return;
      }

      if (!this.processingChest && !this.chestModal) {
        this.openChest(chest);
      }
    });
  }

  private openChest(chest: Chest) {
    if (chest.opened || this.processingChest) return;
    this.processingChest = true;
    void this.handleChestOpen(chest).finally(() => {
      this.processingChest = false;
    });
  }

  private async handleChestOpen(chest: Chest) {
    try {
      const success = await this.tryOpenChestOnChain(chest);
      if (success) {
        chest.opened = true;
        chest.sprite.setTexture("loot_chest_02");
        this.time.delayedCall(200, () =>
          chest.sprite.setTexture("loot_chest_03")
        );
        this.minimap.markChestOpened(chest.tileX, chest.tileY);
        console.log(`[Game] Opened chest at (${chest.tileX}, ${chest.tileY})`);
      } else {
        chest.sprite.setTexture("loot_chest_01");
      }
    } catch (err) {
      console.error("[Game] Failed to open chest:", err);
      chest.sprite.setTexture("loot_chest_01");
    }
  }

  private async tryOpenChestOnChain(chest: Chest): Promise<boolean> {
    if (!this.adventurePda || !this.playerPublicKey || !this.tempKeypair)
      return false;
    const connection = this.getSolanaConnection();
    if (!connection) return false;

    try {
      const ix = await createOpenChestInstruction({
        connection,
        owner: this.playerPublicKey,
        authority: this.tempKeypair.publicKey,
        adventurePda: this.adventurePda,
        chestIndex: chest.index,
      });

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.feePayer = this.tempKeypair.publicKey;
      tx.recentBlockhash = blockhash;
      tx.add(ix);
      tx.sign(this.tempKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      const updated = await fetchAdventureSessionSmart(
        connection,
        null,
        this.adventurePda
      );

      if (updated) {
        this.adventureSession = updated;
        if (Number.isFinite(updated.torch)) this.setTorchPct(updated.torch);
        this.rebuildHeroHud();
        this.syncInventoryFromAdventure();
        this.showChestLootModal(updated);
      }

      return true;
    } catch (err) {
      console.error("[Game] Chest transaction failed:", err);
      return false;
    }
  }

  private showChestLootModal(session: ChainAdventure) {
    if (this.chestModal) {
      this.closeChestModal();
    }

    if (
      !session ||
      session.pendingLootCount <= 0 ||
      session.pendingLootSource === 255
    ) {
      return;
    }

    this.lastChestLootSource = session.pendingLootSource;
    this.activeChestIndex = session.pendingLootSource;
    this.dismissedChestIndex = null;
    this.dismissedChestTile = undefined;
    this.movementQueue = [];
    this.movementBusy = false;

    const lootRows = this.buildLootRows(session.pendingLoot ?? []);
    if (lootRows.length === 0) {
      this.activeChestIndex = null;
      return;
    }

    const inventoryRows = this.buildInventoryRows(session.items ?? []);

    this.chestModal = new ChestLootModal(this, lootRows, inventoryRows, {
      onConfirm: (selection) => this.handleLootSelection(selection),
      onPickAll: () => this.handlePickAllLoot(),
      onClose: () => this.closeChestModal(),
    });
    this.chestModal.show();
  }

  private closeChestModal() {
    this.chestModal?.destroy();
    this.chestModal = undefined;
    this.lastChestModalDismissed = performance.now();
    this.lastChestLootSource = this.adventureSession?.pendingLootSource ?? 255;
    if (this.activeChestIndex !== null) {
      this.dismissedChestIndex = this.activeChestIndex;
      const chestRef = this.chests.find(
        (c) => c.index === this.activeChestIndex
      );
      if (chestRef) {
        this.dismissedChestTile = { x: chestRef.tileX, y: chestRef.tileY };
      } else if (this.optimisticTile) {
        this.dismissedChestTile = { ...this.optimisticTile };
      }
    }
    this.activeChestIndex = null;
    if ((this.adventureSession?.pendingLootCount ?? 0) === 0) {
      this.dismissedChestIndex = null;
      this.dismissedChestTile = undefined;
    }
  }

  private buildLootRows(
    pending: { itemKey: number; quantity: number }[]
  ): ChestLootRow[] {
    return pending
      .map((slot, index) => {
        if (!slot || slot.quantity <= 0 || slot.itemKey === ITEM_SLOT_EMPTY) {
          return null;
        }
        const id = ITEM_KEY_TO_ID[slot.itemKey] as ItemId | undefined;
        if (!id) return null;
        const def = ITEM_DEFINITIONS[id];
        const label = `${def.name} × ${slot.quantity}`;
        return {
          slotIndex: index,
          itemKey: slot.itemKey,
          quantity: slot.quantity,
          label,
        } as ChestLootRow;
      })
      .filter((row): row is ChestLootRow => !!row);
  }

  private buildInventoryRows(
    items: { itemKey: number; quantity: number }[]
  ): ChestInventoryRow[] {
    return items
      .map((slot, index) => {
        if (!slot || slot.quantity <= 0 || slot.itemKey === ITEM_SLOT_EMPTY) {
          return null;
        }
        const id = ITEM_KEY_TO_ID[slot.itemKey] as ItemId | undefined;
        if (!id) return null;
        const def = ITEM_DEFINITIONS[id];
        const label = `Drop ${def.name} × ${slot.quantity}`;
        return {
          slotIndex: index,
          itemKey: slot.itemKey,
          quantity: slot.quantity,
          label,
        } as ChestInventoryRow;
      })
      .filter((row): row is ChestInventoryRow => !!row);
  }

  private buildInventorySnapshot(
    items: { itemKey: number; quantity: number }[]
  ): InventorySnapshot {
    const slots = Array.from({ length: this.INVENTORY_SLOTS }, (_, idx) => {
      const slot = items[idx];
      if (!slot || slot.quantity <= 0 || slot.itemKey === ITEM_SLOT_EMPTY)
        return null;
      const id = ITEM_KEY_TO_ID[slot.itemKey] as ItemId | undefined;
      if (!id) return null;
      const def = ITEM_DEFINITIONS[id];
      return { def, quantity: slot.quantity };
    });

    return {
      slots,
      capacity: this.INVENTORY_SLOTS,
      gold: 0,
    } as InventorySnapshot;
  }

  private validateLootSelection(selection: ChestLootSelection): {
    success: boolean;
    error?: string;
  } {
    if (!this.adventureSession) {
      return { success: false, error: "Adventure not ready." };
    }

    if (selection.take.length === 0 && selection.drop.length === 0) {
      return { success: true };
    }

    const pending = this.adventureSession.pendingLoot ?? [];
    for (const take of selection.take) {
      const slot = pending[take.slotIndex];
      if (
        !slot ||
        slot.itemKey !== take.itemKey ||
        slot.quantity < take.quantity
      ) {
        return { success: false, error: "Chest contents changed." };
      }
    }

    const inventorySnapshot = this.buildInventorySnapshot(
      this.adventureSession.items ?? []
    );
    const inventory = new Inventory(this.INVENTORY_SLOTS);
    inventory.fromSnapshot(inventorySnapshot);

    for (const drop of selection.drop) {
      const currentSlot = this.adventureSession.items?.[drop.slotIndex];
      if (!currentSlot || currentSlot.itemKey !== drop.itemKey) {
        return { success: false, error: "Inventory changed." };
      }
      if (currentSlot.quantity !== drop.quantity) {
        return { success: false, error: "Inventory changed." };
      }
      const removed = inventory.removeSlot(drop.slotIndex);
      if (!removed) {
        return { success: false, error: "Unable to drop that item." };
      }
    }

    for (const take of selection.take) {
      const id = ITEM_KEY_TO_ID[take.itemKey] as ItemId | undefined;
      if (!id) {
        return { success: false, error: "Unknown loot item." };
      }
      const added = inventory.addItem(id, take.quantity);
      if (!added) {
        return {
          success: false,
          error: "Not enough space to carry that loot.",
        };
      }
    }

    return { success: true };
  }

  private async handleLootSelection(
    selection: ChestLootSelection
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.adventurePda || !this.playerPublicKey || !this.tempKeypair) {
      return { success: false, error: "Adventure not ready." };
    }

    if (selection.take.length === 0 && selection.drop.length === 0) {
      return { success: true };
    }

    const validation = this.validateLootSelection(selection);
    if (!validation.success) {
      return validation;
    }

    const connection = this.getSolanaConnection();
    if (!connection) {
      return { success: false, error: "Connection unavailable." };
    }

    try {
      const instructions = [] as TransactionInstruction[];

      for (const drop of selection.drop) {
        if (drop.quantity <= 0) continue;
        const ix = await createDropItemInstruction({
          connection,
          owner: this.playerPublicKey,
          authority: this.tempKeypair.publicKey,
          adventurePda: this.adventurePda,
          itemKey: drop.itemKey,
          quantity: drop.quantity,
        });
        instructions.push(ix);
      }

      for (const take of selection.take) {
        if (take.quantity <= 0) continue;
        const ix = await createPickupItemInstruction({
          connection,
          owner: this.playerPublicKey,
          authority: this.tempKeypair.publicKey,
          adventurePda: this.adventurePda,
          itemKey: take.itemKey,
          quantity: take.quantity,
        });
        instructions.push(ix);
      }

      if (instructions.length === 0) {
        return { success: true };
      }

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.feePayer = this.tempKeypair.publicKey;
      tx.recentBlockhash = blockhash;
      instructions.forEach((ix) => tx.add(ix));
      tx.sign(this.tempKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      const updated = await fetchAdventureSessionSmart(
        connection,
        null,
        this.adventurePda
      );

      if (updated) {
        this.adventureSession = updated;
        this.rebuildHeroHud();
        this.syncInventoryFromAdventure();
      }

      return { success: true };
    } catch (err) {
      console.error("[Game] Failed to process loot selection:", err);
      return { success: false, error: "Failed to process selection." };
    }
  }

  private async handlePickAllLoot(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.adventureSession) {
      return { success: false, error: "Adventure not ready." };
    }
    const take = this.buildLootRows(
      this.adventureSession.pendingLoot ?? []
    ).map((row) => ({
      slotIndex: row.slotIndex,
      itemKey: row.itemKey,
      quantity: row.quantity,
    }));
    const selection: ChestLootSelection = { take, drop: [] };
    return this.handleLootSelection(selection);
  }

  private checkPortalProximity() {
    // Don't check if modal is already open or currently exiting
    if (
      this.portalModalOverlay ||
      this.isExitingDungeon ||
      this.chestModal ||
      this.processingChest
    ) {
      return;
    }

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
    this.movementQueue = [];
    this.movementBusy = false;

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
        const connection = this.getSolanaConnection();
        if (!connection) {
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

        const dungeonMintPk = new PublicKey(this.adventureSession.dungeonMint);
        const dungeonOwnerPk = await this.resolveDungeonOwner(connection);

        const ix = await createExitAdventureInstruction({
          connection,
          owner: this.playerPublicKey,
          authority: walletPubkey,
          adventurePda: this.adventurePda,
          heroMints,
          dungeonMint: dungeonMintPk,
          dungeonOwner: dungeonOwnerPk,
          fromEphemeral: false,
        });

        console.log("[Game] Exit instruction created successfully");

        // Build transaction for wallet signing
        console.log("[Game] Getting latest blockhash from base layer...");
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");

        const tx = new Transaction();
        tx.feePayer = walletPubkey;
        tx.recentBlockhash = blockhash;
        tx.add(ix);
        console.log("[Game] Transaction built, preparing to sign and send...");

        // Simulate first
        console.log("Attempting transaction simulation...");
        try {
          const simulation = await connection.simulateTransaction(tx);
          if (simulation.value.err) {
            console.error("Simulation error:", simulation.value.err);
            console.error("Simulation logs:", simulation.value.logs);
            throw new Error(
              `Simulation failed: ${JSON.stringify(simulation.value.err)}`
            );
          } else {
            console.log("Simulation successful");
            console.log("Simulation logs:", simulation.value.logs);
          }
        } catch (simErr) {
          console.error("Simulation attempt failed:", simErr);
          throw new Error("Transaction simulation failed.");
        }

        // Sign with wallet and send to base chain
        let signature: string;
        if (walletProvider.signAndSendTransaction) {
          const result = await walletProvider.signAndSendTransaction(tx);
          signature = typeof result === "string" ? result : result.signature;
        } else if (walletProvider.signTransaction) {
          const signed = await walletProvider.signTransaction(tx);
          signature = await connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: false,
          });
        } else {
          throw new Error("Wallet does not support transaction signing");
        }

        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed"
        );

        console.log(`[Game] Exit transaction confirmed: ${signature}`);

        // Clear minimap data from localStorage
        if (this.minimap) {
          this.minimap.clearStorage();
        }

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
      if (this.minimap) {
        this.minimap.clearStorage();
      }
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

  private getHeroClassKeysForCombat(): HeroClassKey[] {
    if (this.partyKeys.length) {
      return [...this.partyKeys];
    }
    if (this.partyHeroes.length) {
      return this.partyHeroes
        .map(
          (hero) =>
            HERO_CLASS_TO_KEY[hero.cls as keyof typeof HERO_CLASS_TO_KEY]
        )
        .filter((key): key is HeroClassKey => Boolean(key));
    }
    return [];
  }

  private async handleEncounter(): Promise<void> {
    if (!this.adventurePda || !this.playerPublicKey || !this.tempKeypair) {
      return;
    }
    if (this.encounterPrompt) {
      return;
    }
    const connection = this.getSolanaConnection();
    if (!connection) return;
    if (!this.uiLayer) return;

    this.isWaitingForCombat = true;
    this.movementQueue = [];

    const prompt = new EncounterPrompt({
      scene: this,
      uiLayer: this.uiLayer,
      durationSeconds: 12,
      torchPercent: () =>
        Math.max(0, Math.min(100, this.adventureSession?.torch ?? 0)),
      enemies: this.buildEncounterPreview(),
      onConfirm: () => void this.acceptEncounter(),
      onFlee: () => void this.declineEncounter(),
    });

    this.encounterPrompt = prompt;
    prompt.show(this.scale.width, this.scale.height);
  }

  private async acceptEncounter(): Promise<void> {
    if (!this.adventurePda || !this.playerPublicKey || !this.tempKeypair) {
      this.isWaitingForCombat = false;
      return;
    }
    const connection = this.getSolanaConnection();
    if (!connection) {
      this.isWaitingForCombat = false;
      return;
    }

    this.destroyEncounterPrompt();

    const funded = await this.checkTempKeypairFunded();
    if (!funded) {
      console.error("[Game] Temp keypair not funded; cannot start combat.");
      this.isWaitingForCombat = false;
      return;
    }

    try {
      const ix = await createBeginEncounterInstruction({
        connection,
        owner: this.playerPublicKey,
        authority: this.tempKeypair.publicKey,
        adventureKey: this.adventurePda,
      });
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");

      const tx = new Transaction({
        feePayer: this.tempKeypair.publicKey,
        recentBlockhash: blockhash,
      });
      tx.add(ix);
      tx.sign(this.tempKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      this.isWaitingForCombat = false;

      const authorityAdapter = this.getTempWalletAdapter(connection);

      this.scene.launch(COMBAT_SCENE_KEY, {
        adventureKey: this.adventurePda.toBase58(),
        ownerKey: this.playerPublicKey.toBase58(),
        connection,
        authority: authorityAdapter,
        heroClasses: this.getHeroClassKeysForCombat(),
      });
      this.scene.pause();
    } catch (err) {
      console.error("[Game] Failed to begin encounter:", err);
      this.isWaitingForCombat = false;
      if (
        this.adventureSession?.pendingEncounterSeed &&
        this.adventureSession.pendingEncounterSeed !== 0n
      ) {
        this.time.delayedCall(300, () => {
          if (!this.encounterPrompt) {
            void this.handleEncounter();
          }
        });
      }
    }
  }

  private async declineEncounter(): Promise<void> {
    if (!this.adventurePda || !this.playerPublicKey || !this.tempKeypair) {
      this.isWaitingForCombat = false;
      return;
    }
    const connection = this.getSolanaConnection();
    if (!connection) {
      this.isWaitingForCombat = false;
      return;
    }

    this.destroyEncounterPrompt();

    const funded = await this.checkTempKeypairFunded();
    if (!funded) {
      console.error(
        "[Game] Temp keypair not funded; cannot decline encounter."
      );
      this.isWaitingForCombat = false;
      return;
    }

    try {
      const ix = await createDeclineEncounterInstruction({
        connection,
        owner: this.playerPublicKey,
        authority: this.tempKeypair.publicKey,
        adventureKey: this.adventurePda,
      });

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: this.tempKeypair.publicKey,
        recentBlockhash: blockhash,
      });
      tx.add(ix);
      tx.sign(this.tempKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
      });
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      const updated = await fetchAdventureSessionSmart(
        connection,
        null,
        this.adventurePda
      );
      if (updated) {
        this.applyAdventureSession(updated);
        this.lastConfirmedTile = {
          x: updated.partyPosition.x,
          y: updated.partyPosition.y,
        };
        this.optimisticTile = { ...this.lastConfirmedTile };
        this.rebuildHeroHud();
      }
    } catch (err) {
      console.error("[Game] Failed to decline encounter:", err);
    } finally {
      this.isWaitingForCombat = false;
      if (
        this.adventureSession?.pendingEncounterSeed &&
        this.adventureSession.pendingEncounterSeed !== 0n &&
        !this.encounterPrompt
      ) {
        this.time.delayedCall(300, () => {
          if (!this.encounterPrompt) {
            void this.handleEncounter();
          }
        });
      }
    }
  }

  private buildEncounterPreview(): UnitAssets[] {
    if (!ENEMY_ASSETS.length) return [];

    const seedBig = this.adventureSession?.pendingEncounterSeed ?? 0n;
    let state =
      Number(seedBig % BigInt(0x7fffffff)) ||
      Math.floor(Math.random() * 0x7fffffff);

    const picks: UnitAssets[] = [];
    const max = Math.min(3, ENEMY_ASSETS.length);

    for (let i = 0; i < max; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      const enemy = ENEMY_ASSETS[state % ENEMY_ASSETS.length];
      picks.push(enemy);
    }

    return picks;
  }

  private destroyEncounterPrompt(): void {
    this.encounterPrompt?.destroy();
    this.encounterPrompt = undefined;
  }

  private handleSceneResume(): void {
    this.isWaitingForCombat = false;
    this.destroyEncounterPrompt();
  }

  private getTempWalletAdapter(connection: Connection) {
    if (!this.tempKeypair) {
      throw new Error("Temp keypair unavailable for combat operations");
    }

    if (
      !this.tempWalletAdapter ||
      !this.tempWalletAdapter.publicKey.equals(this.tempKeypair.publicKey)
    ) {
      const keypair = this.tempKeypair;
      const conn = connection;
      this.tempWalletAdapter = {
        publicKey: keypair.publicKey,
        signTransaction: async (tx: Transaction) => {
          tx.feePayer = keypair.publicKey;
          tx.partialSign(keypair);
          return tx;
        },
        signAndSendTransaction: async (tx: Transaction) => {
          tx.feePayer = keypair.publicKey;
          tx.partialSign(keypair);
          const signature = await conn.sendRawTransaction(tx.serialize(), {
            skipPreflight: false,
          });
          return signature;
        },
      };
    }

    return this.tempWalletAdapter!;
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

  private initializeTempKeypair(): void {
    if (!this.playerPublicKey) return;
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
    if (!connection) {
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
        null,
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

  private async resolveDungeonOwner(
    connection: Connection
  ): Promise<PublicKey> {
    if (this.onChainDungeon?.owner) {
      try {
        return new PublicKey(this.onChainDungeon.owner);
      } catch (err) {
        console.error("Invalid cached dungeon owner pubkey", err);
      }
    }

    const dungeonMintAddress = this.adventureSession?.dungeonMint;
    if (!dungeonMintAddress) {
      throw new Error("Adventure session missing dungeon mint");
    }

    const dungeonMintKey = new PublicKey(dungeonMintAddress);
    const fetched = await fetchDungeonByAddress(connection, dungeonMintKey);
    if (!fetched?.owner) {
      throw new Error("Unable to resolve dungeon owner");
    }

    this.onChainDungeon = fetched;
    return new PublicKey(fetched.owner);
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
    this.events.off(Phaser.Scenes.Events.RESUME, this.handleSceneResume, this);
    this.destroyEncounterPrompt();
    this.isWaitingForCombat = false;
    this.tempWalletAdapter = undefined;
    this.movementQueue = [];
    this.movementBusy = false;
    this.closePortalModal();
    this.lastPortalTileShown = undefined;
    this.isExitingDungeon = false;
    this.closeChestModal();
    this.heroHudTexts.forEach((text) => text.destroy());
    this.heroHudTexts = [];
    this.heroHudBg?.destroy();
    this.heroHudBg = undefined;
    this.heroHudPanel?.destroy();
    this.heroHudPanel = undefined;
  }

  private async resumeCombatIfActive() {
    if (!this.adventurePda) return;
    const connection = this.getSolanaConnection();
    if (!connection) return;

    const adventure = await fetchAdventureSession(
      connection,
      this.adventurePda
    );
    if (!adventure) return;

    // Check flags from chain, not locally cached state
    const inCombat = Boolean(adventure.inCombat);
    const combatKeyStr = adventure.combatAccount as string | undefined; // adapt to your shape
    const combatKey = combatKeyStr ? new PublicKey(combatKeyStr) : undefined;

    if (!inCombat || !combatKey || isDefaultPubkey(combatKey)) return;

    // Optionally verify the combat account exists (guards against RPC lag)
    const combatInfo = await connection.getAccountInfo(combatKey, "confirmed");
    if (!combatInfo) {
      // brief, tolerant retry (optional)
      const ok = await this.waitForCombatReady(
        connection,
        this.adventurePda,
        3000
      );
      if (!ok) return;
    }

    // Make sure we have an authority adapter (temp keypair) to sign turns
    const authorityAdapter = this.getTempWalletAdapter(connection);
    if (!authorityAdapter?.publicKey) return;

    // Launch combat scene and pause game scene
    this.scene.launch("Combat", {
      adventureKey: this.adventurePda.toBase58(),
      ownerKey: this.playerPublicKey?.toBase58(),
      connection,
      authority: authorityAdapter,
      heroClasses: this.getHeroClassKeysForCombat(),
    });
    this.scene.pause();
  }

  private async waitForCombatReady(
    connection: Connection,
    adventureKey: PublicKey,
    timeoutMs = 5000
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const adv = await fetchAdventureSession(connection, adventureKey);
      if (adv && adv.inCombat && adv.combatAccount) {
        const ck = new PublicKey(adv.combatAccount);
        if (!isDefaultPubkey(ck)) {
          const info = await connection.getAccountInfo(ck, "confirmed");
          if (info) return true;
        }
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    return false;
  }

  private rebuildHeroHud() {
    // Clean up old HUD
    this.heroHudTexts.forEach((t) => t.destroy());
    this.heroHudTexts = [];
    this.heroHudBg?.destroy();
    this.heroHudBg = undefined;
    this.heroHudPanel?.destroy();
    this.heroHudPanel = undefined;

    if (!this.uiLayer) return;

    const snapshots = this.adventureSession?.heroSnapshots ?? [];
    if (!snapshots.length) return;

    // Panel layout
    const margin = 12;
    const padX = 10;
    const padY = 10;
    const lineGap = 6;
    const fontSizePx = 11;
    const font = "monospace";

    // Build texts first to measure size
    const tempTexts: Phaser.GameObjects.Text[] = [];
    const startX = margin + padX;
    let cursorY = margin + padY;
    const maxHeroes = Math.min(this.partyLength, snapshots.length);
    let maxWidth = 0;

    for (let index = 0; index < maxHeroes; index++) {
      const snapshot = snapshots[index];
      const label = this.formatHeroHud(snapshot, index);

      // slightly smaller text for better readability
      const text = this.add
        .text(startX, cursorY, label, {
          fontFamily: font,
          fontSize: `${fontSizePx}px`,
          color: "#e6e6e6",
          align: "left",
          lineSpacing: 3, // ↑ slightly larger line spacing for clarity
        })
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(10_001);

      // subtle shadow for readability
      text.setShadow(1, 1, "#000000", 2, false, true);

      // add a faint separator line for each hero block
      const sep = this.add
        .rectangle(
          startX,
          cursorY + text.height + 4,
          maxWidth + 40,
          1,
          0xffffff,
          0.15
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(10_000);

      this.uiLayer.add(text);
      this.uiLayer.add(sep);

      maxWidth = Math.max(maxWidth, text.width);
      cursorY += text.height + lineGap + 10; // ↑ extra gap between heroes
    }

    // Compute panel rect
    const panelWidth = padX * 2 + maxWidth;
    const panelHeight = padY * 2 + (cursorY - (margin + padY) - lineGap);

    // Background graphics (semi-transparent)
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.6);
    // rounded rect look using Graphics
    const x = margin;
    const y = margin;
    const r = 8;
    bg.fillRoundedRect(x, y, panelWidth, panelHeight, r);
    bg.lineStyle(1, 0xffffff, 0.08);
    bg.strokeRoundedRect(x, y, panelWidth, panelHeight, r);
    bg.setScrollFactor(0);
    bg.setDepth(10_000);

    this.uiLayer.add(bg);

    // Make a container to group bg + texts (handy if you want to move it later)
    const panel = this.add.container(0, 0, [bg, ...tempTexts]);
    panel.setDepth(10_000);
    this.uiLayer.add(panel);

    // Save refs so we can destroy later
    this.heroHudPanel = panel;
    this.heroHudBg = bg;
    this.heroHudTexts = tempTexts;
  }

  private formatHeroHud(snapshot: ChainHeroSnapshot, index: number): string {
    const heroMeta = this.partyHeroes[index];
    const name = heroMeta?.name ?? `Hero ${snapshot.heroId}`;
    const cls = heroMeta?.cls ?? "Unknown";
    const stressCap = snapshot.stressMax > 0 ? snapshot.stressMax : 200;
    const stressValue = Math.min(snapshot.stress, stressCap);
    const hpLine = `HP ${snapshot.currentHp}/${snapshot.maxHp} | Stress ${stressValue}/${stressCap}`;
    const statsLine1 = `ATK ${snapshot.attack} DEF ${snapshot.defense} MAG ${snapshot.magic}`;
    const statsLine2 = `RES ${snapshot.resistance} SPD ${snapshot.speed} LCK ${snapshot.luck}`;
    const statusLine = `Status: ${this.describeStatuses(
      snapshot.statusEffects
    )}`;
    const traitsLine = `Traits: ${this.describeTraits(snapshot)}`;
    return `${name} (${cls}) Lv ${snapshot.level}\n${hpLine}\n${statsLine1}\n${statsLine2}\n${statusLine}\n${traitsLine}`;
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

  private buildInventoryHud() {
    // Clean old
    this.inventoryPanel?.destroy();
    this.inventoryPanel = undefined;
    this.inventorySlots.forEach((s) => s.container.destroy());
    this.inventorySlots = [];

    if (!this.uiLayer) return;

    // Panel container
    const panel = this.add.container(0, 0);
    panel.setDepth(10_000);
    this.uiLayer.add(panel);
    this.inventoryPanel = panel;

    // Compute grid size
    const cols = this.inventoryCols;
    const rows = Math.ceil(this.INVENTORY_SLOTS / cols);
    const cell = this.inventoryCell;
    const gap = this.inventoryGap;

    this.inventoryPanelW =
      this.inventoryPad * 2 + cols * cell + (cols - 1) * gap;
    this.inventoryPanelH =
      this.inventoryPad * 2 + rows * cell + (rows - 1) * gap;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.55);
    bg.fillRoundedRect(0, 0, this.inventoryPanelW, this.inventoryPanelH, 10);
    bg.lineStyle(1, 0xffffff, 0.08);
    bg.strokeRoundedRect(0, 0, this.inventoryPanelW, this.inventoryPanelH, 10);
    panel.add(bg);

    // Create empty slots
    for (let i = 0; i < this.INVENTORY_SLOTS; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = this.inventoryPad + col * (cell + gap);
      const y = this.inventoryPad + row * (cell + gap);

      const slot = this.createInventorySlotView(i, x, y, cell);
      panel.add(slot.container);
      this.inventorySlots.push(slot);
    }
  }

  private positionInventoryHud() {
    // @ts-ignore
    const _uiW = this.uiCam?.width ?? this.scale.width;
    const uiH = this.uiCam?.height ?? this.scale.height;
    const x = this.inventoryMargin;
    const y = uiH - this.inventoryMargin - this.inventoryPanelH;
    this.inventoryPanel!.setPosition(x, y);
  }

  // Create one slot view
  private createInventorySlotView(
    idx: number,
    x: number,
    y: number,
    size: number
  ): InventorySlotView {
    const c = this.add.container(x, y);

    const bg = this.add
      .rectangle(0, 0, size, size, 0x0f0f14, 0.9)
      .setOrigin(0)
      .setStrokeStyle(1, 0xffffff, 0.1);

    // subtle grid sheen
    const border = this.add
      .rectangle(0, 0, size, size)
      .setOrigin(0)
      .setStrokeStyle(1, 0xffffff, 0.05);

    c.add(bg);
    c.add(border);

    // Count badge (hidden by default)
    const countBg = this.add
      .rectangle(size - 14, 14, 20, 16, 0x000000, 0.75)
      .setOrigin(1, 0)
      .setVisible(false);
    countBg.setStrokeStyle(1, 0xffffff, 0.1);

    const countText = this.add
      .text(countBg.x - 10, countBg.y + 8, "1", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e6e6e6",
      })
      .setOrigin(0.5)
      .setVisible(false);

    c.add(countBg);
    c.add(countText);

    const slot: InventorySlotView = {
      container: c,
      bg,
      border,
      idx,
      qty: 0,
      usable: false,
      countBg,
      countText,
    };

    // Interactions
    c.setSize(size, size);
    c.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, size, size),
      Phaser.Geom.Rectangle.Contains
    );

    c.on("pointerover", () => {
      border.setStrokeStyle(1, 0x6dd5ff, 0.8);
      this.uiShowItemTooltip(slot);
    });
    c.on("pointerout", () => {
      border.setStrokeStyle(1, 0xffffff, 0.05);
      this.uiHideItemTooltip();
    });
    c.on("pointerdown", () => {
      if (slot.id && slot.usable && slot.qty > 0) {
        this.tryUseItem(slot.id);
      } else {
        // not usable or empty
        this.flashSlot(slot);
      }
    });

    return slot;
  }

  // Apply items to HUD (call this when you have data)
  private syncInventoryFromAdventure() {
    if (!this.adventureSession) return;
    const hudItems = this.mapAdventureItemsToHud(
      this.adventureSession.items ?? []
    );
    this.setInventory(hudItems);
    if ((this.adventureSession.pendingLootCount ?? 0) === 0) {
      this.dismissedChestIndex = null;
      this.dismissedChestTile = undefined;
    }
  }

  private setInventory(items: InventoryItemParam[]) {
    // Normalize length to INVENTORY_SLOTS
    const data = items.slice(0, this.INVENTORY_SLOTS);
    while (data.length < this.INVENTORY_SLOTS)
      data.push({ id: undefined as any, qty: 0 });

    for (let i = 0; i < this.INVENTORY_SLOTS; i++) {
      const slot = this.inventorySlots[i];
      const item = data[i];
      if (!item || !item.id || item.qty <= 0) {
        this.updateSlotViewEmpty(slot);
      } else {
        this.updateSlotView(slot, item.id, item.qty);
      }
    }
  }

  private suppliesToHudItems(
    slots: SupplySlot[]
  ): { id: keyof typeof ITEM_DEFINITIONS; qty: number }[] {
    // Keep only valid, non-empty, with qty > 0, then slice to HUD size
    const items: { id: keyof typeof ITEM_DEFINITIONS; qty: number }[] = [];
    for (const s of slots) {
      if (!s || s.itemKey === ITEM_SLOT_EMPTY || s.quantity <= 0) continue;
      const id = ITEM_KEY_TO_ID[s.itemKey];
      if (!id) continue;
      items.push({ id, qty: s.quantity });
      if (items.length >= this.INVENTORY_SLOTS) break;
    }
    return items;
  }

  // Wire AdventureSession.items later: convert item_key -> your ItemId string
  // Example stub (replace when you map item_key to ItemId):
  private mapAdventureItemsToHud(
    items: { itemKey: number; quantity: number }[]
  ): InventoryItemParam[] {
    const mapped: InventoryItemParam[] = [];
    items.forEach((slot) => {
      if (!slot || slot.quantity <= 0) return;
      const id = ITEM_KEY_TO_ID[slot.itemKey] as ItemId | undefined;
      if (!id) return;
      mapped.push({ id, qty: slot.quantity });
    });
    return mapped;
  }

  private ensureCountBadge(slot: InventorySlotView) {
    const size = this.inventoryCell;
    const pad = 3;
    const badge = Math.max(14, Math.floor(size * 0.34)); // pixel badge size
    const half = Math.floor(badge / 2);

    // --- Background (rounded rectangle) ---
    if (!slot.countBg) {
      const bg = this.add
        .rectangle(0, 0, badge, badge, 0x000000, 0.75)
        .setOrigin(0.5)
        .setDepth(2);
      bg.setStrokeStyle(1, 0xffffff, 0.25);

      if (typeof (bg as any).setCornerRadius === "function") {
        (bg as any).setCornerRadius(half); // make it appear circular-ish
      }

      slot.container.add(bg);
      slot.countBg = bg;
    }

    if (!slot.countText) {
      const txt = this.add
        .text(0, 0, "0", {
          fontFamily: "Kemco Pixel, Pixelify Sans, monospace",
          fontSize: `${Math.floor(badge * 0.6)}px`,
          color: "#ffffff",
          align: "center",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(3)
        .setResolution(2);
      slot.container.add(txt);
      slot.countText = txt;
    }

    const cx = size - pad - half;
    const cy = pad + half;

    const bg = slot.countBg!;
    const txt = slot.countText!;
    bg.setPosition(cx, cy);
    txt.setPosition(cx, cy);
  }

  private updateSlotViewEmpty(slot: InventorySlotView) {
    slot.id = undefined;
    slot.qty = 0;
    slot.usable = false;

    // Remove icon if any
    slot.icon?.destroy();
    slot.icon = undefined;

    // Muted look
    slot.bg.setFillStyle(0x0f0f14, 0.9);
    slot.border?.setStrokeStyle(1, 0xffffff, 0.05);

    // Hide count
    this.ensureCountBadge(slot);
    slot.countBg?.setVisible(false);
    slot.countText?.setVisible(false);
  }

  private updateSlotView(
    slot: InventorySlotView,
    id: keyof typeof ITEM_DEFINITIONS,
    qty: number
  ) {
    slot.id = id;
    slot.qty = qty;

    const def = ITEM_DEFINITIONS[id];
    slot.usable =
      !!def.usable &&
      id !== "pouch_gold" &&
      id !== "mystery_relic" &&
      id !== "phoenix_feather";

    // Border by rarity (subtle)
    const rarityColor = this.colorForRarity(def.rarity);
    slot.border?.setStrokeStyle(1, rarityColor, 0.65);

    // Icon (try asset key -> fallback placeholder)
    const key = `item_${id}`;
    const size = this.inventoryCell;
    const centerX = size * 0.5;
    const centerY = size * 0.5;

    slot.icon?.destroy();
    if (this.textures.exists(key)) {
      slot.icon = this.add
        .image(centerX, centerY, key)
        .setDisplaySize(size - 10, size - 10)
        .setOrigin(0.5);
    } else {
      // Placeholder
      slot.icon = this.add
        .image(centerX, centerY, "floor_clean_tile")
        .setDisplaySize(size - 10, size - 10)
        .setOrigin(0.5)
        .setTint(0x333333);
    }
    slot.container.add(slot.icon);

    // Count badge logic (create/position, then show/hide)
    this.ensureCountBadge(slot);

    if (qty > 0) {
      slot.countBg?.setVisible(true);
      slot.countText?.setVisible(true);
      slot.countText?.setText(String(qty));
    } else {
      slot.countBg?.setVisible(false);
      slot.countText?.setVisible(false);
    }
  }

  private colorForRarity(rarity: ItemDefinition["rarity"] | undefined): number {
    switch (rarity) {
      case "common":
        return 0xb0b0b0;
      case "uncommon":
        return 0x6dd5ff;
      case "rare":
        return 0xffe66d;
      default:
        return 0xffffff;
    }
  }

  private flashSlot(slot: InventorySlotView) {
    this.tweens.add({
      targets: slot.bg,
      alpha: { from: 0.9, to: 0.6 },
      yoyo: true,
      duration: 100,
      repeat: 1,
    });
  }

  private async tryUseItem(id: keyof typeof ITEM_DEFINITIONS) {
    const def = ITEM_DEFINITIONS[id];
    if (!def?.usable) return;

    console.log(`[Game] Use item requested: ${def.name}`);

    if (!this.adventurePda || !this.playerPublicKey || !this.tempKeypair) {
      console.warn("[Game] Adventure context not ready for item use");
      return;
    }

    const connection = this.getSolanaConnection();
    if (!connection) {
      console.warn("[Game] Connection not available for item use");
      return;
    }

    const itemKey = ITEM_ID_TO_KEY[id];
    if (itemKey === undefined) {
      console.error(`[Game] No item key found for ID: ${id}`);
      return;
    }

    try {
      const ix = await createUseItemInstruction({
        connection,
        owner: this.playerPublicKey,
        authority: this.tempKeypair.publicKey,
        adventurePda: this.adventurePda,
        itemKey,
        quantity: 1,
      });

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.feePayer = this.tempKeypair.publicKey;
      tx.recentBlockhash = blockhash;
      tx.add(ix);
      tx.sign(this.tempKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      const updated = await fetchAdventureSessionSmart(
        connection,
        null,
        this.adventurePda
      );

      if (updated) {
        this.adventureSession = updated;
        if (Number.isFinite(updated.torch)) this.setTorchPct(updated.torch);
        this.rebuildHeroHud();
        this.syncInventoryFromAdventure();
      }
    } catch (err) {
      console.error(`[Game] Failed to use item '${id}':`, err);
    }
  }

  // Simple tooltip (optional). For now, log to console.
  // You can expand to a full tooltip panel like your portal modal.
  private uiShowItemTooltip(slot: InventorySlotView) {
    if (!slot.id) return;
    const def = ITEM_DEFINITIONS[slot.id];
    console.log(`[Tip] ${def.name}: ${def.description}`);
  }
  private uiHideItemTooltip() {
    /* no-op for now */
  }

  // ==================== FOG OF WAR (Camera Mask) ====================

  private initCameraFog() {
    const key = this.createFogTexture();

    // Add the gradient image as mask source (screen-space)
    const maskImg = this.add
      .image(0, 0, key)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9999)
      .setVisible(false);

    this.fogMaskG = maskImg;
    this.fogCamMask = new Phaser.Display.Masks.BitmapMask(this, maskImg);
    this.fogCamMask.invertAlpha = false;
    this.cameras.main.setMask(this.fogCamMask);

    this.updateCameraFog();
  }

  private updateCameraFog() {
    this.updateCameraFogUsingTorch();
  }

  private createFogTexture(): string {
    const size = 512; // texture resolution (higher = smoother)
    const rt = this.textures.createCanvas("fogMaskTex", size, size);
    if (rt) {
      const ctx = rt.getContext();
      const grd = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
      );

      // White = visible area, Black = hidden (BitmapMask reads alpha)
      grd.addColorStop(0, "rgba(255,255,255,1)"); // full visible center
      grd.addColorStop(0.6, "rgba(255,255,255,0.6)"); // fade region
      grd.addColorStop(1, "rgba(255,255,255,0)"); // transparent edge
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, size, size);

      rt.refresh();
    }
    return "fogMaskTex";
  }

  private buildTorchHud() {
    // Clean previous
    this.torchHud?.container.destroy();
    this.torchHud = undefined;

    const uiW = this.uiCam?.width ?? this.scale.width;
    // @ts-ignore
    const _uiH = this.uiCam?.height ?? this.scale.height;

    const barW = Math.max(220, Math.min(420, Math.floor(uiW * 0.35)));
    const barH = 18;

    const container = this.add.container(uiW / 2, 18);
    container.setDepth(10_100);
    this.uiLayer.add(container);

    const bg = this.add
      .rectangle(0, 0, barW, barH, 0x000000, 0.6)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0xffffff, 0.15);

    // Start full; width adjusted in setTorchPct
    const fill = this.add
      .rectangle(0, 0, barW - 4, barH - 4, 0xffd54a, 0.95)
      .setOrigin(0.5);

    const label = this.add
      .text(0, -barH - 4, "Torch 100%", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e6e6e6",
        align: "center",
      })
      .setOrigin(0.5);

    container.add(bg);
    container.add(fill);
    container.add(label);

    this.torchHud = { container, bg, fill, label };
    this.positionTorchHud(); // place at top-center with safe margin
    this.setTorchPct(this.torchPct); // sync visuals
  }

  private positionTorchHud() {
    if (!this.torchHud) return;
    const uiW = this.uiCam?.width ?? this.scale.width;
    const topMargin = 40;
    this.torchHud.container.setPosition(uiW / 2, topMargin);
  }

  private setTorchPct(pct: number) {
    const clamped = Phaser.Math.Clamp(Math.round(pct), 0, 100);
    this.torchPct = clamped;

    // Update bar
    if (this.torchHud) {
      const fullW = (this.torchHud.bg.width ?? 0) - 4; // inner width
      const newW = Math.max(0, Math.floor((fullW * clamped) / 100));
      this.torchHud.fill.setDisplaySize(
        newW,
        (this.torchHud.bg.height ?? 0) - 4
      );

      // Color: yellow -> orange -> red
      // ≥67%: yellow (#FFD54A), 33–66%: orange (#FFA726), ≤32%: red (#EF5350)
      let color = 0xffd54a;
      if (clamped <= 66) color = 0xffa726;
      if (clamped <= 33) color = 0xef5350;
      this.torchHud.fill.setFillStyle(color, 0.95);

      this.torchHud.label.setText(`Torch ${clamped}%`);
    }

    // Visibility + tint
    this.updateCameraFogUsingTorch();
    this.applyScreenTintForTorch(clamped);
  }

  private updateCameraFogUsingTorch() {
    if (!this.fogMaskG) return;
    const cam = this.cameras.main;

    const cx = cam.width * 0.5;
    const cy = cam.height * 0.5;

    // Max visibility radius (at 100%)
    const maxRadius = Math.min(cam.width, cam.height) * 0.6;

    // Minimum radius:
    // - a bit larger than a tile: 1.5 * tileSize
    // - but also not absurdly tiny on large screens
    const minRadiusAbs = Math.min(cam.width, cam.height) * 0.025; // 2.5% of screen
    const minRadiusScreen = Math.min(cam.width, cam.height) * 0.12;
    const minRadius = Math.max(minRadiusAbs, minRadiusScreen);

    // Torch stops shrinking under 25%: clamp effective % to [25..100]
    const effective = Math.max(this.torchPct, 25);

    // Linear map: 25% -> minRadius, 100% -> maxRadius
    const t = (effective - 25) / (100 - 25); // 0..1
    const radiusPx = Phaser.Math.Linear(minRadius, maxRadius, t);

    (this.fogMaskG as Phaser.GameObjects.Image)
      .setPosition(cx, cy)
      .setDisplaySize(radiusPx * 2, radiusPx * 2); // size == diameter
  }

  private applyScreenTintForTorch(pct: number) {
    // Lazy-create overlay
    if (!this.tintOverlay) {
      const uiW = this.uiCam?.width ?? this.scale.width;
      const uiH = this.uiCam?.height ?? this.scale.height;
      this.tintOverlay = this.add
        .rectangle(0, 0, uiW, uiH, 0xffa726, 0) // start transparent
        .setOrigin(0, 0)
        .setDepth(10_050)
        .setScrollFactor(0, 0);

      // Only add to uiLayer if it's already available
      if (this.uiLayer) {
        this.uiLayer.add(this.tintOverlay);
      }
    }

    // Pick color & alpha
    if (pct > 66) {
      this.tintOverlay.setFillStyle(0xffa726, 0);
    } else if (pct > 33) {
      this.tintOverlay.setFillStyle(0xff8f00, 0.08);
    } else {
      this.tintOverlay.setFillStyle(0xb71c1c, 0.12);
    }

    // Keep overlay sized on resize
    const uiW = this.uiCam?.width ?? this.scale.width;
    const uiH = this.uiCam?.height ?? this.scale.height;
    this.tintOverlay.setSize(uiW, uiH);
  }
}

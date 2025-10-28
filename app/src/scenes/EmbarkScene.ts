import Phaser from "phaser";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";
import { townStore } from "../state/townStore";
import { ItemId, HeroClass } from "../state/models";
import { ChainHero, getHeroTypeLabel } from "../state/heroChain";
import {
  ChainDungeon,
  createMintDungeonInstruction,
  fetchOwnedDungeonAccounts,
} from "../state/dungeonChain";
import {
  createStartAdventureInstruction,
  fetchAdventureSession,
  fetchAdventureSessionSmart,
  deriveAdventurePda,
  createSetDelegateInstruction,
  type HeroLockStatus,
} from "../state/adventureChain";
import {
  SAFE_MARGIN,
  UI_FONT,
  PANEL_COLORS,
  BUTTON_DIMENSIONS,
  snap,
} from "../ui/uiConfig";
import {
  deriveTempKeypair,
  ensureTempKeypairFunded,
} from "../state/tempKeypair";

type SelectedDungeon = { source: "my" | "community"; dungeon: ChainDungeon };

const FOOTER_HEIGHT = 220;
const CARD_WIDTH = 620;

type HeroRosterSnapshot = {
  heroes: ChainHero[];
  heroesLoading: boolean;
  heroLoadError?: string;
  heroLockStatuses?: Map<string, HeroLockStatus>;
  walletAddress?: string;
};

type PartyHeroSnapshot = {
  id: string;
  cls: HeroClass;
  name: string;
};

type EmbarkSceneLaunchData = Partial<HeroRosterSnapshot>;

type WalletPublicKey = {
  toBase58(): string;
  toString(): string;
};

type SolanaEventHandler = (...args: unknown[]) => void;

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: WalletPublicKey | null;
  connect(options?: {
    onlyIfTrusted?: boolean;
  }): Promise<{ publicKey: WalletPublicKey } | void>;
  disconnect(): Promise<void>;
  on?(event: string, handler: SolanaEventHandler): void;
  off?(event: string, handler: SolanaEventHandler): void;
  removeListener?(event: string, handler: SolanaEventHandler): void;
  request?(args: { method: string; params?: unknown[] }): Promise<unknown>;
  signAndSendTransaction?: (
    tx: Transaction
  ) => Promise<{ signature: string } | string>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
};

export class EmbarkScene extends Phaser.Scene {
  private store = townStore;
  private unsubChange?: () => void;

  private activeTab: "my" | "community" = "my";
  private selectedDungeon?: SelectedDungeon;
  private chainHeroes: ChainHero[] = [];
  private heroesLoading = false;
  private heroLoadError?: string;
  private walletAddress?: string;
  private partySelection: Set<string> = new Set();
  private selectedItems: Map<ItemId, number> = new Map();
  private myDungeons: ChainDungeon[] = [];
  private communityDungeons: ChainDungeon[] = [];
  private dungeonsLoading = false;
  private dungeonLoadError?: string;
  private dungeonProgramBusy = false;
  private embarkBusy = false;
  private walletProvider?: SolanaProvider;
  private solanaConnection?: Connection;

  private safe = SAFE_MARGIN;
  private contentWidth = 0;
  private contentHeight = 0;
  private headerHeight = 64;

  private contentRoot!: Phaser.GameObjects.Container;
  private contentMask!: Phaser.Display.Masks.GeometryMask;
  private contentScroll = 0;
  private contentScrollMax = 0;
  private scrollBar!: Phaser.GameObjects.Rectangle;

  private footer?: Phaser.GameObjects.Container;
  private footerCounter!: Phaser.GameObjects.Text;
  private footerEnterBtn?: Phaser.GameObjects.Container;

  // footer scrolling resources
  private footerPartyMaskRect?: Phaser.GameObjects.Rectangle;
  private footerPartyMask?: Phaser.Display.Masks.GeometryMask;
  private footerWheelHandler?: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    dx: number,
    dy: number,
    dz: number
  ) => void;

  private keyboardBindings: { event: string; handler: () => void }[] = [];

  constructor() {
    super("EmbarkScene");
  }

  init(data?: EmbarkSceneLaunchData) {
    const snapshot = this.registry.get("town:heroRoster") as
      | HeroRosterSnapshot
      | undefined;
    if (snapshot) {
      this.applyRosterSnapshot(snapshot);
    }
    if (data) {
      this.applyRosterSnapshot(data);
    }
  }

  create() {
    this.cameras.main.setBackgroundColor(0x12151d);
    this.releaseKeyboardBindings();
    this.registry.events.on(
      "setdata-town:heroRoster",
      this.onRosterDataEvent,
      this
    );
    this.registry.events.on(
      "changedata-town:heroRoster",
      this.onRosterDataEvent,
      this
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off(
        "setdata-town:heroRoster",
        this.onRosterDataEvent,
        this
      );
      this.registry.events.off(
        "changedata-town:heroRoster",
        this.onRosterDataEvent,
        this
      );
      this.releaseKeyboardBindings();
    });

    this.renderChrome();
    this.renderHeader();
    this.renderContentArea();
    this.renderFooter();

    this.unsubChange = this.store.subscribe(() => {
      this.refresh();
    });

    this.bindKey("keydown-ESC", () => this.exit());
    this.bindKey("keydown-TAB", () => this.toggleTab());

    this.refresh();
    void this.loadDungeons();
  }

  shutdown() {
    this.unsubChange?.();
    this.releaseKeyboardBindings();
  }

  private renderChrome() {
    const g = this.add.graphics();
    g.fillStyle(0x171b25, 1);
    g.fillRect(
      this.safe,
      this.safe,
      this.scale.width - this.safe * 2,
      this.scale.height - this.safe * 2
    );
    g.lineStyle(2, 0x2f3442, 1);
    g.strokeRect(
      this.safe,
      this.safe,
      this.scale.width - this.safe * 2,
      this.scale.height - this.safe * 2
    );
    g.destroy();

    const backWidth = 112;
    this.createSmallButton(this.safe, this.safe + 12, backWidth, "← Back", () =>
      this.exit()
    );

    this.add
      .text(
        this.safe + backWidth + 16,
        this.safe + 12,
        "Embark Planner",
        UI_FONT.title
      )
      .setOrigin(0, 0);
  }

  private renderHeader() {
    const tabY = this.safe + 72;
    const tabSpacing = 12;
    const buttonWidth = 176;

    const myBtn = this.createTabButton(
      this.safe,
      tabY,
      buttonWidth,
      "My Dungeons",
      "my"
    );
    const communityBtn = this.createTabButton(
      this.safe + buttonWidth + tabSpacing,
      tabY,
      buttonWidth,
      "Community Dungeons",
      "community"
    );

    myBtn.setFillStyle(
      this.activeTab === "my" ? PANEL_COLORS.highlight : PANEL_COLORS.disabled
    );
    communityBtn.setFillStyle(
      this.activeTab === "community"
        ? PANEL_COLORS.highlight
        : PANEL_COLORS.disabled
    );
  }

  private createTabButton(
    x: number,
    y: number,
    width: number,
    label: string,
    tab: "my" | "community"
  ) {
    const button = this.add
      .rectangle(
        snap(x),
        snap(y),
        width,
        BUTTON_DIMENSIONS.height,
        PANEL_COLORS.disabled
      )
      .setOrigin(0, 0.5);
    button.setStrokeStyle(1, 0x3a4458, 1);
    button.setInteractive({ cursor: "pointer" });
    button
      .on("pointerover", () => button.setFillStyle(PANEL_COLORS.highlight))
      .on("pointerout", () => {
        const active = this.activeTab === tab;
        button.setFillStyle(
          active ? PANEL_COLORS.highlight : PANEL_COLORS.disabled
        );
      })
      .on("pointerdown", () => this.switchTab(tab));

    this.add
      .text(button.x + width / 2, button.y, label, {
        ...UI_FONT.body,
        fontSize: "12px",
        color: "#f4f6ff",
      })
      .setOrigin(0.5);

    return button;
  }

  private renderContentArea() {
    this.contentWidth = this.scale.width - this.safe * 2;
    this.contentHeight =
      this.scale.height -
      this.safe * 2 -
      FOOTER_HEIGHT -
      this.headerHeight -
      32;

    const panel = this.add
      .rectangle(
        this.safe,
        this.safe + this.headerHeight + 24,
        this.contentWidth,
        this.contentHeight,
        0x141923
      )
      .setOrigin(0);
    panel.setStrokeStyle(1, 0x2e3543, 1);

    const maskRect = this.add.rectangle(
      panel.x + this.contentWidth / 2,
      panel.y + this.contentHeight / 2,
      this.contentWidth,
      this.contentHeight,
      0xffffff,
      0
    );
    this.contentMask = maskRect.createGeometryMask();
    maskRect.destroy();

    this.contentRoot = this.add.container(panel.x + 16, panel.y + 16);
    this.contentRoot.setMask(this.contentMask);

    this.scrollBar = this.add
      .rectangle(
        panel.x + this.contentWidth - 12,
        panel.y + 8,
        4,
        this.contentHeight - 16,
        0x2a3143
      )
      .setOrigin(0.5, 0)
      .setVisible(false);

    this.input.on(
      "wheel",
      (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => {
        const pointer = this.input.activePointer;
        const bounds = new Phaser.Geom.Rectangle(
          this.safe,
          this.safe + this.headerHeight + 24,
          this.contentWidth,
          this.contentHeight
        );
        if (!bounds.contains(pointer.x, pointer.y)) return;
        if (this.contentScrollMax <= 0) return;
        this.contentScroll = clamp(
          this.contentScroll + dy * 0.6,
          0,
          this.contentScrollMax
        );
        this.updateContentScroll();
      }
    );
  }

  private renderFooter() {
    // cleanup from prior render
    this.footer?.destroy();
    this.footerPartyMask?.destroy();
    this.footerPartyMaskRect?.destroy();
    this.footerPartyMask = undefined;
    this.footerPartyMaskRect = undefined;
    if (this.footerWheelHandler) {
      this.input.off("wheel", this.footerWheelHandler, this);
      this.footerWheelHandler = undefined;
    }

    const PARTY_COL_WIDTH = 280;
    const COL_GAP = 32;
    const PADDING_X = 16;
    const PADDING_Y = 16;

    const footerY = this.scale.height - this.safe - FOOTER_HEIGHT;
    this.footer = this.add.container(this.safe, footerY);

    // BG + top divider
    const bg = this.add
      .rectangle(0, 0, this.contentWidth, FOOTER_HEIGHT, 0x141721)
      .setOrigin(0);
    bg.setStrokeStyle(1, 0x2c3240, 1);
    this.footer.add(bg);

    const divider = this.add
      .rectangle(0, 0, this.contentWidth, 1, 0x2c3240)
      .setOrigin(0);
    this.footer.add(divider);

    // === Party column ===
    const partyCol = this.add.container(PADDING_X, PADDING_Y);
    this.footer.add(partyCol);

    const titleParty = this.add
      .text(0, 0, "Party (select 1–4)", UI_FONT.body)
      .setOrigin(0, 0);
    partyCol.add(titleParty);

    // Counter on its own line to avoid overlapping "Supplies"
    this.footerCounter = this.add
      .text(0, 18, `Selected ${this.partySelection.size}/4`, {
        ...UI_FONT.body,
        color: "#9ac6ff",
      })
      .setOrigin(0, 0);
    partyCol.add(this.footerCounter);

    // Scrollable party list viewport
    const listTop = 18 + 18; // title (0) + counter (18) + small gap
    const listX = 0;
    const listY = listTop + 6;

    // Visible area height inside footer (room for button at the right)
    const visibleH = FOOTER_HEIGHT - PADDING_Y - listY - 12; // 12 bottom padding
    const viewportW = PARTY_COL_WIDTH;

    // Container that holds all chips (unmasked)
    const partyList = this.add.container(listX, listY);
    partyCol.add(partyList);

    let partyY = 0;
    const addPartyMessage = (text: string, color = "#9fa6c0") => {
      const message = this.add
        .text(0, listY, text, {
          ...UI_FONT.caption,
          color,
          wordWrap: { width: PARTY_COL_WIDTH },
        })
        .setOrigin(0, 0);
      partyCol.add(message);
    };

    if (!this.walletAddress) {
      addPartyMessage("Connect your wallet in town to choose on-chain heroes.");
      partyList.destroy();
      this.footerPartyMask = undefined;
      this.footerPartyMaskRect = undefined;
    } else if (this.heroesLoading) {
      addPartyMessage("Loading heroes from the chain...");
      partyList.destroy();
      this.footerPartyMask = undefined;
      this.footerPartyMaskRect = undefined;
    } else if (this.heroLoadError) {
      addPartyMessage(
        `Unable to load heroes: ${this.heroLoadError}`,
        "#ff8a8a"
      );
      partyList.destroy();
      this.footerPartyMask = undefined;
      this.footerPartyMaskRect = undefined;
    } else if (!this.chainHeroes.length) {
      addPartyMessage(
        "No on-chain heroes yet. Summon allies in town to build your roster."
      );
      partyList.destroy();
      this.footerPartyMask = undefined;
      this.footerPartyMaskRect = undefined;
    } else {
      const availableHeroes = this.chainHeroes;

      if (availableHeroes.length === 0) {
        addPartyMessage(
          "All heroes are currently on adventures. Return to town to manage your roster."
        );
        partyList.destroy();
        this.footerPartyMask = undefined;
        this.footerPartyMaskRect = undefined;
      } else {
        availableHeroes.forEach((hero) => {
          const key = this.heroKey(hero);
          const selected = this.partySelection.has(key);
          const button = this.createFooterChip(
            0,
            partyY,
            PARTY_COL_WIDTH,
            `Hero #${hero.id} (${getHeroTypeLabel(hero.heroType)})`,
            () => this.toggleHero(key),
            selected
          );
          partyList.add(button);
          partyY += BUTTON_DIMENSIONS.height + 6;
        });

        this.footerPartyMaskRect = this.add.rectangle(
          this.footer.x + PADDING_X + viewportW / 2,
          this.footer.y + PADDING_Y + listY + visibleH / 2,
          viewportW,
          visibleH,
          0xffffff,
          0
        );
        this.footerPartyMask = this.footerPartyMaskRect.createGeometryMask();
        partyList.setMask(this.footerPartyMask);

        // Enable wheel scrolling only when overflow
        const contentH = Math.max(0, partyY);
        let partyScroll = 0;

        const applyPartyScroll = () => {
          const maxScroll = Math.max(0, contentH - visibleH);
          if (maxScroll <= 0) {
            partyScroll = 0;
          } else {
            partyScroll = Phaser.Math.Clamp(partyScroll, -maxScroll, 0);
          }
          partyList.y = listY + partyScroll;
        };
        applyPartyScroll();

        if (contentH > visibleH) {
          this.footerWheelHandler = (pointer, _objects, _dx, dy, _dz) => {
            const px = pointer.worldX ?? pointer.x;
            const py = pointer.worldY ?? pointer.y;
            const rect = new Phaser.Geom.Rectangle(
              this.footer!.x + PADDING_X,
              this.footer!.y + PADDING_Y + listY,
              viewportW,
              visibleH
            );
            if (!rect.contains(px, py)) return;
            partyScroll -= dy * 0.5;
            applyPartyScroll();
          };
          this.input.on("wheel", this.footerWheelHandler, this);
        }
      }
    }

    // === Supplies column ===
    // Place it after party column + gap, and keep its own y padding.
    const suppliesX = PADDING_X + PARTY_COL_WIDTH + COL_GAP;
    const suppliesCol = this.add.container(suppliesX, PADDING_Y);
    this.footer.add(suppliesCol);

    const suppliesTitle = this.add
      .text(0, 0, "Supplies (bring to adventure)", UI_FONT.body)
      .setOrigin(0, 0);
    suppliesCol.add(suppliesTitle);

    // Filter out items that can't be brought to adventures (only found/looted)
    const allItems = Object.entries(this.store.getInventory().items) as [
      ItemId,
      number
    ][];
    const items = allItems.filter(([itemId]) => {
      return itemId !== "pouch_gold" && itemId !== "mystery_relic";
    });
    const startY = 24; // space from title to rows

    if (items.length === 0) {
      suppliesCol.add(
        this.add
          .text(0, startY, "No items in inventory", {
            ...UI_FONT.caption,
            color: "#9fa6c0",
          })
          .setOrigin(0, 0)
      );
    } else {
      // Grid layout: 3 columns
      const COLS = 3;
      const COL_WIDTH = 140;
      const ROW_HEIGHT = 44;

      items.forEach(([itemId, available], index) => {
        const col = index % COLS;
        const row = Math.floor(index / COLS);
        const itemX = col * COL_WIDTH;
        const itemY = startY + row * ROW_HEIGHT;

        const selected = this.getSelectedItemQuantity(itemId);
        const itemName = itemId.replace(/_/g, " ");

        // Shorten item name to fit in column
        const displayName =
          itemName.length > 12 ? itemName.substring(0, 10) + "..." : itemName;

        // Item name and available quantity
        suppliesCol.add(
          this.add
            .text(itemX, itemY, `${displayName} (${available})`, {
              ...UI_FONT.caption,
              fontSize: "10px",
              color: "#f4f6ff",
            })
            .setOrigin(0, 0)
        );

        // Quantity controls
        const controlsY = itemY + 14;
        const controlsX = itemX;

        // Minus button
        const minusBtn = this.createTinyButton(
          controlsX,
          controlsY,
          20,
          "−",
          () => this.setItemQuantity(itemId, selected - 1),
          selected > 0
        );
        suppliesCol.add(minusBtn);

        // Quantity display
        const qtyText = this.add
          .text(controlsX + 24, controlsY + 10, String(selected), {
            ...UI_FONT.caption,
            fontSize: "10px",
            color: selected > 0 ? "#9bf0ff" : "#7d8499",
          })
          .setOrigin(0, 0.5);
        suppliesCol.add(qtyText);

        // Plus button
        const plusBtn = this.createTinyButton(
          controlsX + 38,
          controlsY,
          20,
          "+",
          () => this.setItemQuantity(itemId, selected + 1),
          selected < available
        );
        suppliesCol.add(plusBtn);

        // All button (select all available)
        if (available > 1) {
          const allBtn = this.createTinyButton(
            controlsX + 62,
            controlsY,
            30,
            "All",
            () => this.setItemQuantity(itemId, available),
            selected < available
          );
          suppliesCol.add(allBtn);
        }
      });
    }

    const buttonY = FOOTER_HEIGHT - BUTTON_DIMENSIONS.height - 20;
    this.footerEnterBtn = this.createSmallButton(
      this.contentWidth - 260,
      buttonY,
      240,
      "Enter Dungeon",
      () => this.enterDungeon(),
      this.canEnter()
    );
    this.footer.add(this.footerEnterBtn);

    this.refreshFooterStates();
  }

  private refresh() {
    if (this.selectedDungeon) {
      const pool =
        this.selectedDungeon.source === "my"
          ? this.myDungeons
          : this.communityDungeons;
      const match = pool.find(
        (dungeon) =>
          dungeon.publicKey === this.selectedDungeon!.dungeon.publicKey
      );
      this.selectedDungeon = match
        ? { source: this.selectedDungeon.source, dungeon: match }
        : undefined;
    }

    this.buildTabContent();
    this.renderFooter();
  }

  private buildTabContent() {
    this.contentRoot.removeAll(true);
    let offset = 0;

    if (this.activeTab === "my") {
      offset = this.buildMyDungeonsTab(offset);
    } else {
      offset = this.buildCommunityDungeonsTab(offset);
    }

    this.contentScrollMax = Math.max(0, offset - this.contentHeight + 16);
    this.contentScroll = clamp(this.contentScroll, 0, this.contentScrollMax);
    this.updateContentScroll();
  }

  private buildMyDungeonsTab(offset: number) {
    this.contentRoot.add(
      this.add.text(0, offset, "My dungeons", UI_FONT.body).setOrigin(0, 0)
    );
    const mintLabel = this.dungeonProgramBusy ? "Minting..." : "Mint Dungeon";
    this.contentRoot.add(
      this.createSmallButton(
        CARD_WIDTH - 140,
        offset - 6,
        140,
        mintLabel,
        () => this.mintDungeon(),
        Boolean(this.walletAddress) &&
          !this.dungeonProgramBusy &&
          !this.dungeonsLoading
      )
    );
    offset += 32;

    if (!this.walletAddress) {
      this.contentRoot.add(
        this.add
          .text(
            0,
            offset,
            "Connect your wallet in town to mint dungeons on-chain.",
            UI_FONT.caption
          )
          .setOrigin(0, 0)
      );
      return offset + 24;
    }

    if (this.dungeonsLoading) {
      this.contentRoot.add(
        this.add
          .text(
            0,
            offset,
            "Loading your dungeons from the chain...",
            UI_FONT.caption
          )
          .setOrigin(0, 0)
      );
      return offset + 24;
    }

    if (this.dungeonLoadError) {
      this.contentRoot.add(
        this.add
          .text(
            0,
            offset,
            `Failed to load dungeons: ${this.dungeonLoadError}`,
            {
              ...UI_FONT.caption,
              color: "#ff8a8a",
              wordWrap: { width: CARD_WIDTH },
            }
          )
          .setOrigin(0, 0)
      );
      this.contentRoot.add(
        this.createSmallButton(CARD_WIDTH - 120, offset - 4, 120, "Retry", () =>
          this.loadDungeons(true)
        )
      );
      return offset + 44;
    }

    const owned = [...this.myDungeons].sort((a, b) => a.mintId - b.mintId);
    if (!owned.length) {
      this.contentRoot.add(
        this.add
          .text(
            0,
            offset,
            "No dungeons minted yet. Use the button above to summon one.",
            UI_FONT.caption
          )
          .setOrigin(0, 0)
      );
      return offset + 24;
    }

    owned.forEach((dungeon) => {
      const card = this.buildDungeonCard(
        dungeon.metadata.name || `Dungeon #${dungeon.mintId}`,
        `Size ${dungeon.gridWidth}×${dungeon.gridHeight} • Seed ${dungeon.seed}`,
        this.estimateDifficulty(dungeon),
        String(dungeon.seed),
        [
          {
            label: dungeon.status === "ready" ? "Select" : "Awaiting VRF",
            handler: () => this.selectDungeon({ source: "my", dungeon }),
            enabled: dungeon.status === "ready",
          },
        ],
        this.selectedDungeon?.source === "my" &&
          this.selectedDungeon.dungeon.publicKey === dungeon.publicKey,
        `Mint #${dungeon.mintId} • Status ${dungeon.status.toUpperCase()}`
      );
      card.y = offset;
      this.contentRoot.add(card);
      offset += 126;
    });

    return offset;
  }

  private buildCommunityDungeonsTab(offset: number) {
    this.contentRoot.add(
      this.add
        .text(0, offset, "Community dungeons", UI_FONT.body)
        .setOrigin(0, 0)
    );
    this.contentRoot.add(
      this.createSmallButton(
        CARD_WIDTH - 120,
        offset - 6,
        120,
        "Refresh",
        () => this.loadDungeons(true),
        !this.dungeonsLoading
      )
    );
    offset += 32;

    if (this.dungeonsLoading) {
      this.contentRoot.add(
        this.add
          .text(0, offset, "Loading community dungeons...", UI_FONT.caption)
          .setOrigin(0, 0)
      );
      return offset + 24;
    }

    if (this.dungeonLoadError) {
      this.contentRoot.add(
        this.add
          .text(
            0,
            offset,
            `Failed to load community dungeons: ${this.dungeonLoadError}`,
            {
              ...UI_FONT.caption,
              color: "#ff8a8a",
              wordWrap: { width: CARD_WIDTH },
            }
          )
          .setOrigin(0, 0)
      );
      return offset + 36;
    }

    const available = this.communityDungeons
      .filter((d) => d.status === "ready")
      .sort((a, b) => a.mintId - b.mintId);

    if (!available.length) {
      this.contentRoot.add(
        this.add
          .text(
            0,
            offset,
            "No community dungeons available yet. Check back soon!",
            UI_FONT.caption
          )
          .setOrigin(0, 0)
      );
      return offset + 24;
    }

    available.forEach((dungeon) => {
      const card = this.buildDungeonCard(
        dungeon.metadata.name || `Dungeon #${dungeon.mintId}`,
        `Size ${dungeon.gridWidth}×${dungeon.gridHeight}`,
        this.estimateDifficulty(dungeon),
        String(dungeon.seed),
        [
          {
            label: "Select",
            handler: () => this.selectDungeon({ source: "community", dungeon }),
            enabled: true,
          },
        ],
        this.selectedDungeon?.source === "community" &&
          this.selectedDungeon.dungeon.publicKey === dungeon.publicKey,
        `Mint #${dungeon.mintId} • Owner ${this.shortenAddress(dungeon.owner)}`
      );
      card.y = offset;
      this.contentRoot.add(card);
      offset += 126;
    });

    return offset;
  }

  private buildDungeonCard(
    name: string,
    description: string,
    difficulty: number,
    seed: string,
    actions: { label: string; handler: () => void; enabled: boolean }[],
    selected: boolean,
    footerText?: string
  ) {
    const container = this.add.container(0, 0);
    const bg = this.add
      .rectangle(0, 0, CARD_WIDTH, 110, selected ? 0x1f2a3a : 0x181d28)
      .setOrigin(0);
    bg.setStrokeStyle(2, selected ? 0x5d8bff : 0x2f3443, 1);
    container.add(bg);

    container.add(this.add.text(16, 12, name, UI_FONT.body).setOrigin(0, 0));
    container.add(
      this.add
        .text(16, 34, `Difficulty ${difficulty}  Seed ${seed}`, UI_FONT.caption)
        .setOrigin(0, 0)
    );
    container.add(
      this.add
        .text(16, 52, description, {
          ...UI_FONT.caption,
          wordWrap: { width: CARD_WIDTH - 220 },
        })
        .setOrigin(0, 0)
    );

    if (footerText) {
      container.add(
        this.add
          .text(16, 92, footerText, {
            ...UI_FONT.caption,
            color: "#a0a6bc",
          })
          .setOrigin(0, 0)
      );
    }

    const buttonX = CARD_WIDTH - actions.length * (110 + 8);
    actions.forEach((action, index) => {
      const btn = this.createSmallButton(
        buttonX + index * (110 + 8),
        74,
        110,
        action.label,
        action.handler,
        action.enabled
      );
      container.add(btn);
    });

    return container;
  }

  private createSmallButton(
    x: number,
    y: number,
    width: number,
    label: string,
    handler: () => void,
    enabled = true
  ) {
    const container = this.add.container(x, y);
    const rect = this.add
      .rectangle(
        0,
        0,
        width,
        BUTTON_DIMENSIONS.height,
        enabled ? PANEL_COLORS.highlight : PANEL_COLORS.disabled
      )
      .setOrigin(0)
      .setStrokeStyle(1, 0x3b4254, 1);
    container.add(rect);

    container.add(
      this.add
        .text(width / 2, BUTTON_DIMENSIONS.height / 2, label, {
          ...UI_FONT.caption,
          color: enabled ? "#f4f6ff" : "#7d8499",
        })
        .setOrigin(0.5)
    );

    if (enabled) {
      rect
        .setInteractive({ cursor: "pointer" })
        .on("pointerover", () => rect.setFillStyle(PANEL_COLORS.hover))
        .on("pointerout", () => rect.setFillStyle(PANEL_COLORS.highlight))
        .on("pointerdown", handler);
    }

    return container;
  }

  private createFooterChip(
    x: number,
    y: number,
    width: number,
    label: string,
    handler: () => void,
    active: boolean
  ) {
    const container = this.add.container(x, y);
    const rect = this.add
      .rectangle(
        0,
        0,
        width,
        BUTTON_DIMENSIONS.height,
        active ? 0x395a85 : 0x222735
      )
      .setOrigin(0);
    rect.setStrokeStyle(1, 0x3b4254, 1);
    rect
      .setInteractive({ cursor: "pointer" })
      .on("pointerover", () => rect.setFillStyle(0x395a85))
      .on("pointerout", () => rect.setFillStyle(active ? 0x395a85 : 0x222735))
      .on("pointerdown", handler);
    container.add(rect);

    if (active) {
      container.add(
        this.add
          .text(10, BUTTON_DIMENSIONS.height / 2, "✓", {
            ...UI_FONT.body,
            color: "#9bf0ff",
          })
          .setOrigin(0, 0.5)
      );
    }
    container.add(
      this.add
        .text(active ? 26 : 10, BUTTON_DIMENSIONS.height / 2, label, {
          ...UI_FONT.caption,
          color: "#f4f6ff",
        })
        .setOrigin(0, 0.5)
    );
    return container;
  }

  private createTinyButton(
    x: number,
    y: number,
    width: number,
    label: string,
    handler: () => void,
    enabled = true
  ) {
    const container = this.add.container(x, y);
    const height = 24;
    const rect = this.add
      .rectangle(
        0,
        0,
        width,
        height,
        enabled ? PANEL_COLORS.highlight : PANEL_COLORS.disabled
      )
      .setOrigin(0)
      .setStrokeStyle(1, 0x3b4254, 1);
    container.add(rect);

    container.add(
      this.add
        .text(width / 2, height / 2, label, {
          ...UI_FONT.caption,
          fontSize: "11px",
          color: enabled ? "#f4f6ff" : "#7d8499",
        })
        .setOrigin(0.5)
    );

    if (enabled) {
      rect
        .setInteractive({ cursor: "pointer" })
        .on("pointerover", () => rect.setFillStyle(PANEL_COLORS.hover))
        .on("pointerout", () => rect.setFillStyle(PANEL_COLORS.highlight))
        .on("pointerdown", handler);
    }

    return container;
  }

  private updateContentScroll() {
    this.contentRoot.y =
      this.safe + this.headerHeight + 24 + 16 - this.contentScroll;
    if (this.contentScrollMax <= 0) {
      this.scrollBar.setVisible(false);
      return;
    }
    this.scrollBar.setVisible(true);
    const track = this.contentHeight - 32;
    const thumbHeight = Math.max(
      28,
      track * (1 - this.contentScrollMax / (this.contentScrollMax + track))
    );
    const progress = this.contentScroll / this.contentScrollMax;
    this.scrollBar.height = thumbHeight;
    this.scrollBar.y =
      this.safe +
      this.headerHeight +
      24 +
      16 +
      progress * (track - thumbHeight);
  }

  private onRosterDataEvent(
    _parent: Phaser.Data.DataManager,
    _key: string,
    value: unknown
  ) {
    if (!value || typeof value !== "object") return;
    const snapshot = value as Partial<HeroRosterSnapshot>;
    const ready = Boolean(this.contentRoot);
    this.applyRosterSnapshot(snapshot);
    if (ready) {
      this.refresh();
    }
  }

  private applyRosterSnapshot(
    snapshot: Partial<HeroRosterSnapshot> | undefined
  ) {
    if (!snapshot) return;
    if (snapshot.heroes) {
      this.chainHeroes = [...snapshot.heroes].sort((a, b) => a.id - b.id);
    }
    if (typeof snapshot.heroesLoading === "boolean") {
      this.heroesLoading = snapshot.heroesLoading;
    }
    if ("heroLoadError" in snapshot) {
      this.heroLoadError = snapshot.heroLoadError;
    }
    if ("walletAddress" in snapshot) {
      const nextWallet = snapshot.walletAddress;
      const changed = this.walletAddress !== nextWallet;
      this.walletAddress = nextWallet;
      if (changed) {
        void this.loadDungeons(true);
      }
    }
    this.prunePartySelection();
  }

  private prunePartySelection() {
    const validKeys = new Set(
      this.chainHeroes.map((hero) => this.heroKey(hero))
    );
    if (!validKeys.size) {
      if (this.partySelection.size) {
        this.partySelection = new Set();
      }
      return;
    }
    const next = new Set<string>();
    this.partySelection.forEach((id) => {
      if (validKeys.has(id)) {
        next.add(id);
      }
    });
    this.partySelection = next;
  }

  private heroKey(hero: ChainHero) {
    return hero.account || `hero-${hero.id}`;
  }

  private toggleHero(heroId: string) {
    const heroExists = this.chainHeroes.some(
      (hero) => this.heroKey(hero) === heroId
    );
    if (!heroExists) return;
    if (this.partySelection.has(heroId)) {
      this.partySelection.delete(heroId);
    } else {
      if (this.partySelection.size >= 4) {
        this.store.toast("Party limit reached (4).");
        return;
      }
      this.partySelection.add(heroId);
    }
    this.refresh();
  }

  private setItemQuantity(itemId: ItemId, quantity: number) {
    const inventory = this.store.getInventory().items;
    const available = inventory[itemId] || 0;

    if (quantity <= 0) {
      this.selectedItems.delete(itemId);
    } else if (quantity <= available) {
      this.selectedItems.set(itemId, quantity);
    } else {
      this.selectedItems.set(itemId, available);
    }
    this.refresh();
  }

  private getSelectedItemQuantity(itemId: ItemId): number {
    return this.selectedItems.get(itemId) || 0;
  }

  private itemIdToItemKey(itemId: ItemId): number {
    const mapping: Record<ItemId, number> = {
      pouch_gold: 0,
      stress_tonic: 1,
      minor_torch: 2,
      healing_salve: 3,
      mystery_relic: 4,
      calming_incense: 5,
      phoenix_feather: 6,
    };
    return mapping[itemId] ?? 0;
  }

  private refreshFooterStates() {
    if (this.footerCounter) {
      this.footerCounter.setText(`Selected ${this.partySelection.size}/4`);
    }

    this.configureFooterButton(
      this.footerEnterBtn,
      "Enter Dungeon",
      this.canEnter(),
      () => this.enterDungeon()
    );
  }

  private configureFooterButton(
    button: Phaser.GameObjects.Container | undefined,
    label: string,
    enabled: boolean,
    handler: () => void
  ) {
    if (!button) return;
    const background = button.getAt(0) as Phaser.GameObjects.Rectangle;
    const text = button.getAt(1) as Phaser.GameObjects.Text;
    text.setText(label);

    if (enabled) {
      background.setFillStyle(PANEL_COLORS.highlight);
      text.setColor("#f4f6ff");
    } else {
      background.setFillStyle(PANEL_COLORS.disabled);
      text.setColor("#7d8499");
    }

    background.removeAllListeners();
    if (enabled) {
      background
        .setInteractive({ cursor: "pointer" })
        .on("pointerover", () => background.setFillStyle(PANEL_COLORS.hover))
        .on("pointerout", () => background.setFillStyle(PANEL_COLORS.highlight))
        .on("pointerdown", handler);
    } else {
      background.disableInteractive();
    }
  }

  private async enterDungeon() {
    if (this.embarkBusy) return;
    if (!this.selectedDungeon) {
      this.store.toast("Select a dungeon first.");
      return;
    }
    if (this.partySelection.size === 0) {
      this.store.toast("Choose 1–4 heroes to continue.");
      return;
    }
    if (!this.walletAddress) {
      this.store.toast("Connect your wallet first.");
      return;
    }

    const connection = this.getSolanaConnection();
    if (!connection) {
      this.store.toast("RPC unavailable.");
      return;
    }

    const selectedDungeon = this.selectedDungeon;
    let dungeonPubkey: PublicKey;
    let playerKey: PublicKey;

    try {
      dungeonPubkey = new PublicKey(selectedDungeon.dungeon.publicKey);
      playerKey = new PublicKey(this.walletAddress);
    } catch (err) {
      console.error("Invalid address", err);
      this.store.toast("Invalid dungeon or wallet address.");
      return;
    }

    // Check if adventure already exists and is active
    // Fetch from the main chain while MagicBlock integration is disabled
    const [adventurePda] = deriveAdventurePda(playerKey, dungeonPubkey);
    let existingAdventure: any = null;

    try {
      existingAdventure = await fetchAdventureSessionSmart(
        connection,
        null,
        adventurePda
      );
    } catch (err) {
      // If deserialization fails, the account exists but has old structure
      console.error("[EmbarkScene] Failed to fetch adventure:", err);
      const accountInfo = await connection.getAccountInfo(adventurePda);
      if (accountInfo) {
        this.store.toast(
          "Your adventure account needs to be recreated. Please close your existing adventure first or wait for it to expire."
        );
        return;
      }
      // Account doesn't exist, continue with creation
    }

    // If adventure exists and is active, just enter the game
    if (
      existingAdventure &&
      existingAdventure.isActive &&
      existingAdventure.heroesInside
    ) {
      const tempKeypair = deriveTempKeypair(playerKey);

      const fundSuccess = await this.fundTempKeypairForPlayer(playerKey);
      if (!fundSuccess) {
        this.store.toast(
          "Failed to prepare movement keypair. Please try again."
        );
        return;
      }

      await this.ensureAdventureDelegate(
        connection,
        playerKey,
        adventurePda,
        tempKeypair.publicKey,
        existingAdventure.delegate
      );
      existingAdventure.delegate = tempKeypair.publicKey.toBase58();

      const partyHeroes: PartyHeroSnapshot[] = [];
      const byAccount = new Map(this.chainHeroes.map((h) => [h.account, h]));

      for (const mint of existingAdventure.heroMints) {
        const h = byAccount.get(mint);
        if (!h) continue;
        partyHeroes.push({
          id: this.heroKey(h),
          cls: getHeroTypeLabel(h.heroType) as HeroClass,
          name: `Hero #${h.id}`,
        });
      }

      const seed = this.normalizeSeed(selectedDungeon.dungeon.seed);

      // Build supplies object from selected items

      this.scene.stop("TownScene");
      this.scene.start("game", {
        seed,
        heroes: partyHeroes,
        supplies: existingAdventure.items ?? [],
        dungeon: selectedDungeon,
        adventure: existingAdventure,
        player: playerKey.toBase58(),
      });
      return;
    }

    // Otherwise, start a new adventure
    const partyIds = Array.from(this.partySelection);
    const partyHeroes = partyIds
      .map((id) => this.chainHeroes.find((hero) => this.heroKey(hero) === id))
      .filter((hero): hero is ChainHero => Boolean(hero))
      .map((hero) => ({
        id: this.heroKey(hero),
        cls: getHeroTypeLabel(hero.heroType) as HeroClass,
        name: `Hero #${hero.id}`,
      }));

    if (!partyHeroes.length) {
      this.store.toast("Failed to prepare the selected party.");
      return;
    }

    const heroMints: PublicKey[] = [];
    for (const id of partyIds) {
      const hero = this.chainHeroes.find(
        (candidate) => this.heroKey(candidate) === id
      );
      if (!hero) continue;
      try {
        heroMints.push(new PublicKey(hero.account));
      } catch (err) {
        console.error("Invalid hero mint", err);
        this.store.toast(`Hero ${hero.id} has an invalid account address.`);
        return;
      }
    }

    if (!heroMints.length) {
      this.store.toast("Unable to resolve hero accounts.");
      return;
    }

    this.embarkBusy = true;
    this.refreshFooterStates();

    try {
      // Derive temp keypair for delegated authority
      const tempKeypair = deriveTempKeypair(playerKey);
      console.log(
        "[EmbarkScene] Temp keypair:",
        tempKeypair.publicKey.toBase58()
      );

      // Fund temp keypair FIRST (before creating adventure)
      console.log(
        "[EmbarkScene] Funding temp keypair before adventure creation..."
      );
      const fundSuccess = await this.fundTempKeypairForPlayer(playerKey);
      if (!fundSuccess) {
        this.store.toast(
          "Failed to prepare movement keypair. Please try again."
        );
        return;
      }

      // Convert selected items to instruction format
      const itemInputs: { item_key: number; quantity: number }[] = [];
      this.selectedItems.forEach((quantity, itemId) => {
        if (quantity > 0) {
          itemInputs.push({
            item_key: this.itemIdToItemKey(itemId),
            quantity,
          });
        }
      });

      // Create start adventure instruction
      const { instruction: startIx } = await createStartAdventureInstruction({
        connection,
        player: playerKey,
        dungeonMint: dungeonPubkey,
        heroMints,
        items: itemInputs,
      });

      // Write the delegate pubkey into the PDA data
      const { instruction: setDelegateIx } = await createSetDelegateInstruction(
        {
          connection,
          payer: playerKey,
          adventurePda,
          delegate: tempKeypair.publicKey,
        }
      );

      const computeIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 800_000,
      });

      // Transaction: Create adventure on main chain and set delegate
      console.log("[EmbarkScene] Creating adventure on main chain...");
      await this.sendProgramTransaction([computeIx, startIx, setDelegateIx]);

      // Fetch the created adventure from base layer
      console.log("[EmbarkScene] Fetching adventure account...");
      const adventureAccount = await fetchAdventureSession(
        connection,
        adventurePda
      );
      if (!adventureAccount) {
        this.store.toast("Adventure account not found after creation.");
        return;
      }

      console.log(
        "[EmbarkScene] Adventure created successfully, delegate:",
        adventureAccount.delegate
      );
      adventureAccount.delegate = tempKeypair.publicKey.toBase58();

      this.store.consumeBlessings(partyIds);

      const seed = this.normalizeSeed(selectedDungeon.dungeon.seed);

      this.scene.stop("TownScene");
      this.scene.start("game", {
        seed,
        heroes: partyHeroes,
        supplies: adventureAccount.items ?? [],
        dungeon: selectedDungeon,
        adventure: adventureAccount,
        player: playerKey.toBase58(),
      });
    } catch (err) {
      this.handleProgramError(err, "Failed to enter dungeon.");
    } finally {
      this.embarkBusy = false;
      this.refreshFooterStates();
    }
  }

  private async ensureAdventureDelegate(
    connection: Connection,
    playerKey: PublicKey,
    adventurePda: PublicKey,
    delegate: PublicKey,
    currentDelegate?: string | null
  ): Promise<void> {
    const expectedDelegate = delegate.toBase58();
    if (currentDelegate === expectedDelegate) {
      return;
    }

    try {
      const { instruction } = await createSetDelegateInstruction({
        connection,
        payer: playerKey,
        adventurePda,
        delegate,
      });
      await this.sendProgramTransaction([instruction]);
      console.log(
        "[EmbarkScene] Adventure delegate updated to",
        expectedDelegate
      );
    } catch (err) {
      console.error("[EmbarkScene] Failed to set adventure delegate:", err);
      throw err;
    }
  }

  private async fundTempKeypairForPlayer(
    playerKey: PublicKey
  ): Promise<boolean> {
    const connection = this.getSolanaConnection();
    const provider = this.getWalletProvider();
    if (!connection || !provider) {
      console.error("[EmbarkScene] Base connection or provider not available");
      return false;
    }

    try {
      const tempKeypair = deriveTempKeypair(playerKey);
      console.log(
        "[EmbarkScene] Funding temp keypair from base layer:",
        tempKeypair.publicKey.toBase58()
      );

      const success = await ensureTempKeypairFunded(
        connection,
        provider,
        playerKey,
        tempKeypair
      );

      if (success) {
        console.log("[EmbarkScene] Temp keypair funded successfully");
      }
      return success;
    } catch (err) {
      console.error("[EmbarkScene] Failed to fund temp keypair:", err);
      return false;
    }
  }

  private canEnter() {
    return (
      !!this.selectedDungeon &&
      this.partySelection.size >= 1 &&
      this.partySelection.size <= 4 &&
      !this.embarkBusy
    );
  }

  private async selectDungeon(dungeon: SelectedDungeon) {
    if (dungeon.dungeon.status !== "ready") {
      this.store.toast("That dungeon is still waiting on VRF settlement.");
      return;
    }
    this.selectedDungeon = dungeon;
    this.refresh();
    this.refreshFooterStates();
  }

  private async mintDungeon() {
    if (!this.walletAddress) {
      this.store.toast("Connect your wallet first.");
      return;
    }
    if (this.dungeonProgramBusy || this.dungeonsLoading) return;

    const connection = this.getSolanaConnection();
    if (!connection) {
      this.store.toast("RPC unavailable.");
      return;
    }

    const owner = new PublicKey(this.walletAddress);
    this.dungeonProgramBusy = true;
    try {
      const { instruction } = await createMintDungeonInstruction({
        connection,
        payer: owner,
      });
      await this.sendProgramTransaction([instruction]);
      this.store.toast("Dungeon mint requested. Awaiting VRF settlement.");
      await this.loadDungeons(true);
    } catch (err) {
      this.handleProgramError(err, "Failed to mint dungeon.");
    } finally {
      this.dungeonProgramBusy = false;
      this.refresh();
    }
  }

  private async loadDungeons(force = false) {
    if (this.dungeonsLoading && !force) {
      return;
    }
    const ready = Boolean(this.contentRoot);
    const connection = this.getSolanaConnection();
    if (!connection) {
      this.dungeonLoadError = "RPC unavailable.";
      this.dungeonsLoading = false;
      if (ready) this.refresh();
      return;
    }

    this.dungeonsLoading = true;
    this.dungeonLoadError = undefined;
    if (ready) this.refresh();

    try {
      const owner = this.walletAddress
        ? new PublicKey(this.walletAddress)
        : undefined;
      const { owned, others } = await fetchOwnedDungeonAccounts(
        connection,
        owner
      );
      this.myDungeons = owner ? owned : [];
      this.communityDungeons = others;
    } catch (error) {
      console.error(error);
      this.dungeonLoadError =
        error instanceof Error ? error.message : "Unable to fetch dungeons.";
      this.myDungeons = [];
      this.communityDungeons = [];
    } finally {
      this.dungeonsLoading = false;
      if (ready) this.refresh();
    }
  }

  private estimateDifficulty(dungeon: ChainDungeon): number {
    // Estimate difficulty based on dungeon size
    const area = dungeon.gridWidth * dungeon.gridHeight;
    const approximate = Math.ceil(area / 200); // Rough estimate: larger dungeons = harder
    return clamp(approximate, 1, 5);
  }

  private shortenAddress(address: string) {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  private getWalletProvider(): SolanaProvider | undefined {
    if (this.walletProvider) return this.walletProvider;
    if (typeof window === "undefined") return undefined;
    const candidate = (window as unknown as { solana?: SolanaProvider }).solana;
    if (candidate) {
      this.walletProvider = candidate;
      return candidate;
    }
    return undefined;
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

  private async sendProgramTransaction(
    instructions: TransactionInstruction[]
  ): Promise<string> {
    const provider = this.getWalletProvider();
    if (!provider) {
      throw new Error("Wallet provider unavailable.");
    }
    if (!this.walletAddress) {
      throw new Error("Wallet not connected.");
    }

    const connection = this.getSolanaConnection();
    if (!connection) {
      throw new Error("RPC unavailable.");
    }

    const owner = new PublicKey(this.walletAddress);
    const latestBlockhash = await connection.getLatestBlockhash();

    const tx = new Transaction().add(...instructions);
    tx.feePayer = owner;
    tx.recentBlockhash = latestBlockhash.blockhash;

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
      console.error(
        "Simulation attempt failed (this might be expected):",
        simErr
      );
      throw new Error("Transaction simulation failed.");
    }

    let signature: string;
    if (provider.signAndSendTransaction) {
      const result = await provider.signAndSendTransaction(tx);
      signature = typeof result === "string" ? result : result.signature ?? "";
    } else if (provider.signTransaction) {
      const signed = await provider.signTransaction(tx);
      signature = await connection.sendRawTransaction(signed.serialize());
    } else {
      throw new Error("Wallet does not support transaction signing.");
    }

    if (!signature) {
      throw new Error("Transaction signature missing.");
    }

    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed"
    );

    if (confirmation.value.err) {
      throw new Error(
        `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
      );
    }

    return signature;
  }

  private handleProgramError(error: unknown, fallback: string) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : fallback;

    if (/user rejected/i.test(message)) {
      this.store.toast("Transaction cancelled.");
    } else {
      console.error(error);
      this.store.toast(fallback);
    }
  }

  private normalizeSeed(raw: string | number): number {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return Math.floor(raw) >>> 0;
    }
    if (!raw) return Date.now() & 0xffffffff;
    const numeric = Number(raw);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return Math.floor(numeric);
    }
    const digits = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
    if (digits) {
      const parsed = Number(digits);
      if (!Number.isNaN(parsed)) return parsed;
    }
    let hash = 0;
    if (typeof raw === "string") {
      for (let i = 0; i < raw.length; i++) {
        hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
      }
    }
    return hash || 1;
  }

  private toggleTab() {
    this.switchTab(this.activeTab === "my" ? "community" : "my");
  }

  private switchTab(tab: "my" | "community") {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.contentScroll = 0;
    this.renderHeader();
    this.refresh();
  }

  private exit() {
    this.scene.stop();
    this.scene.resume("TownScene");
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

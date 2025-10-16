import Phaser from "phaser";
import { townStore } from "../state/townStore";
import {
  CommunityDungeon,
  CustomDungeon,
  Hero,
  ItemId,
  TownState,
} from "../state/models";
import {
  SAFE_MARGIN,
  UI_FONT,
  PANEL_COLORS,
  BUTTON_DIMENSIONS,
  snap,
} from "../ui/uiConfig";
import { setInventoryVisible } from "../ui/hudControls";

type SelectedDungeon =
  | { source: "custom"; dungeon: CustomDungeon }
  | { source: "community"; dungeon: CommunityDungeon };

type CommunityFilters = {
  difficultyMin: number;
  difficultyMax: number;
  search: string;
  page: number;
};

const FOOTER_HEIGHT = 200;
const CARD_WIDTH = 620;

export class EmbarkScene extends Phaser.Scene {
  private store = townStore;
  private state!: TownState;
  private unsubChange?: () => void;

  private activeTab: "create" | "community" = "create";
  private selectedDungeon?: SelectedDungeon;
  private partySelection = new Set<string>();
  private communityFilters: CommunityFilters = {
    difficultyMin: 1,
    difficultyMax: 5,
    search: "",
    page: 0,
  };
  private communityPool: CommunityDungeon[] = townStore.getCommunityDungeons();

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
  private footerEnterBtn!: Phaser.GameObjects.Container;

  // footer scrolling resources
  private footerPartyList?: Phaser.GameObjects.Container;
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

  init() {
    this.state = this.store.getState();
  }

  create() {
    this.cameras.main.setBackgroundColor(0x12151d);
    this.releaseKeyboardBindings();
    const hideInventory = () => setInventoryVisible(false);
    hideInventory();
    this.events.on(Phaser.Scenes.Events.RESUME, hideInventory);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, hideInventory);
      this.releaseKeyboardBindings();
    });

    this.renderChrome();
    this.renderHeader();
    this.renderContentArea();
    this.renderFooter();

    this.unsubChange = this.store.subscribe((state) => {
      this.state = state;
      this.refresh();
    });

    this.bindKey("keydown-ESC", () => this.exit());
    this.bindKey("keydown-TAB", () => this.toggleTab());

    this.refresh();
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

    this.add
      .text(this.safe, this.safe + 12, "Embark Planner", UI_FONT.title)
      .setOrigin(0, 0);
  }

  private renderHeader() {
    const tabY = this.safe + 58;
    const tabSpacing = 12;
    const buttonWidth = 176;

    const createBtn = this.createTabButton(
      this.safe,
      tabY,
      buttonWidth,
      "Create Dungeon",
      () => this.switchTab("create")
    );
    const communityBtn = this.createTabButton(
      this.safe + buttonWidth + tabSpacing,
      tabY,
      buttonWidth,
      "Community Dungeons",
      () => this.switchTab("community")
    );

    createBtn.setFillStyle(
      this.activeTab === "create"
        ? PANEL_COLORS.highlight
        : PANEL_COLORS.disabled
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
    handler: () => void
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
        const active =
          (label.startsWith("Create") && this.activeTab === "create") ||
          (label.startsWith("Community") && this.activeTab === "community");
        button.setFillStyle(
          active ? PANEL_COLORS.highlight : PANEL_COLORS.disabled
        );
      })
      .on("pointerdown", handler);

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
    if (this.footerWheelHandler) {
      this.input.off("wheel", this.footerWheelHandler, this);
      this.footerWheelHandler = undefined;
    }

    const FOOTER_HEIGHT = 220; // keep your constant if it lives elsewhere
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
    this.footerPartyList = partyList;

    let partyY = 0;
    this.state.heroes.forEach((hero) => {
      const selected = this.partySelection.has(hero.id);
      const button = this.createFooterChip(
        0,
        partyY,
        PARTY_COL_WIDTH,
        `${hero.name} (${hero.cls})`,
        () => this.toggleHero(hero.id),
        selected
      );
      partyList.add(button);
      partyY += BUTTON_DIMENSIONS.height + 6;
    });

    // Mask for the visible area
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
        // Test pointer inside the party viewport
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

    // === Supplies column ===
    // Place it after party column + gap, and keep its own y padding.
    const suppliesX = PADDING_X + PARTY_COL_WIDTH + COL_GAP;
    const suppliesCol = this.add.container(suppliesX, PADDING_Y);
    this.footer.add(suppliesCol);

    const suppliesTitle = this.add
      .text(0, 0, "Supplies", UI_FONT.body)
      .setOrigin(0, 0);
    suppliesCol.add(suppliesTitle);

    const items = Object.entries(this.state.inventory.items) as [
      ItemId,
      number
    ][];
    let suppliesY = 24; // more space from title to rows
    items.forEach(([id, qty], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      suppliesCol.add(
        this.add
          .text(
            col * 120,
            suppliesY + row * 20,
            `${id.toUpperCase()}: ${qty}`,
            UI_FONT.caption
          )
          .setOrigin(0, 0)
      );
    });

    // === Enter button (right aligned) ===
    this.footerEnterBtn = this.createSmallButton(
      this.contentWidth - 260,
      FOOTER_HEIGHT - BUTTON_DIMENSIONS.height - 20,
      240,
      "Enter Dungeon",
      () => this.tryEmbark(),
      this.canEnter()
    );
    this.footer.add(this.footerEnterBtn);

    this.refreshFooterStates();
  }

  private refresh() {
    this.selectedDungeon =
      this.selectedDungeon?.source === "custom"
        ? this.state.customDungeons.find(
            (d) => d.id === this.selectedDungeon?.dungeon.id
          )
          ? this.selectedDungeon
          : undefined
        : this.selectedDungeon;
    this.buildTabContent();
    this.renderFooter();
  }

  private buildTabContent() {
    this.contentRoot.removeAll(true);
    let offset = 0;

    if (this.activeTab === "create") {
      offset = this.buildCreateTab(offset);
    } else {
      offset = this.buildCommunityTab(offset);
    }

    this.contentScrollMax = Math.max(0, offset - this.contentHeight + 16);
    this.contentScroll = clamp(this.contentScroll, 0, this.contentScrollMax);
    this.updateContentScroll();
  }

  private buildCreateTab(offset: number) {
    const max = 3;
    this.contentRoot.add(
      this.add
        .text(0, offset, "Your custom dungeons", UI_FONT.body)
        .setOrigin(0, 0)
    );
    this.contentRoot.add(
      this.createSmallButton(
        CARD_WIDTH - 140,
        offset - 6,
        140,
        "Create Dungeon",
        () => this.promptCreateDungeon(),
        this.state.customDungeons.length < max
      )
    );
    offset += 32;

    if (this.state.customDungeons.length === 0) {
      this.contentRoot.add(
        this.add
          .text(0, offset, "You have no custom dungeons yet.", UI_FONT.caption)
          .setOrigin(0, 0)
      );
      return offset + 24;
    }

    this.state.customDungeons.forEach((dungeon) => {
      const card = this.buildDungeonCard(
        dungeon.name,
        dungeon.description,
        dungeon.difficulty,
        dungeon.seed,
        [
          {
            label: "Select",
            handler: () => this.selectDungeon({ source: "custom", dungeon }),
            enabled: true,
          },
          {
            label: "Edit",
            handler: () => this.promptEditDungeon(dungeon),
            enabled: true,
          },
          {
            label: "Delete",
            handler: () => this.deleteDungeon(dungeon),
            enabled: true,
          },
        ],
        this.selectedDungeon?.source === "custom" &&
          this.selectedDungeon.dungeon.id === dungeon.id
      );
      card.y = offset;
      this.contentRoot.add(card);
      offset += 126;
    });

    return offset;
  }

  private buildCommunityTab(offset: number) {
    this.contentRoot.add(
      this.add
        .text(0, offset, "Browse community dungeons", UI_FONT.body)
        .setOrigin(0, 0)
    );
    offset += 28;

    const filtersRow = this.add.container(0, offset);
    filtersRow.add(
      this.createSmallButton(
        0,
        0,
        160,
        `Difficulty: ${this.communityFilters.difficultyMin}–${this.communityFilters.difficultyMax}`,
        () => this.promptDifficultyFilter()
      )
    );
    filtersRow.add(
      this.createSmallButton(172, 0, 120, "Search", () => this.promptSearch())
    );
    filtersRow.add(
      this.createSmallButton(296, 0, 120, "Reset", () => this.resetFilters())
    );
    this.contentRoot.add(filtersRow);
    offset += 40;

    const filtered = this.applyCommunityFilters();
    const perPage = 4;
    const pages = Math.max(1, Math.ceil(filtered.length / perPage));
    this.communityFilters.page = clamp(
      this.communityFilters.page,
      0,
      pages - 1
    );
    const pageItems = filtered.slice(
      this.communityFilters.page * perPage,
      this.communityFilters.page * perPage + perPage
    );

    if (!pageItems.length) {
      this.contentRoot.add(
        this.add
          .text(
            0,
            offset,
            "No dungeons match the current filters.",
            UI_FONT.caption
          )
          .setOrigin(0, 0)
      );
      return offset + 24;
    }

    pageItems.forEach((dungeon) => {
      const card = this.buildDungeonCard(
        dungeon.name,
        dungeon.description,
        dungeon.difficulty,
        dungeon.seed,
        [
          {
            label: "Select",
            handler: () => this.selectDungeon({ source: "community", dungeon }),
            enabled: true,
          },
        ],
        this.selectedDungeon?.source === "community" &&
          this.selectedDungeon.dungeon.id === dungeon.id,
        `Likes ${dungeon.likes}  •  by ${dungeon.author}`
      );
      card.y = offset;
      this.contentRoot.add(card);
      offset += 126;
    });

    const pager = this.add.container(0, offset);
    pager.add(
      this.createSmallButton(
        0,
        0,
        96,
        "Previous",
        () => {
          this.communityFilters.page = clamp(
            this.communityFilters.page - 1,
            0,
            pages - 1
          );
          this.refresh();
        },
        this.communityFilters.page > 0
      )
    );
    pager.add(
      this.createSmallButton(
        112,
        0,
        96,
        "Next",
        () => {
          this.communityFilters.page = clamp(
            this.communityFilters.page + 1,
            0,
            pages - 1
          );
          this.refresh();
        },
        this.communityFilters.page < pages - 1
      )
    );
    pager.add(
      this.add
        .text(
          232,
          4,
          `Page ${this.communityFilters.page + 1} / ${pages}`,
          UI_FONT.caption
        )
        .setOrigin(0, 0)
    );
    this.contentRoot.add(pager);
    return offset + 36;
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

    container.add(
      this.add.text(16, 12, name, UI_FONT.body).setOrigin(0, 0)
    );
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

  private toggleHero(heroId: string) {
    if (this.partySelection.has(heroId)) {
      this.partySelection.delete(heroId);
    } else {
      if (this.partySelection.size >= 4) {
        this.store.toast("Party limit reached (4).");
        return;
      }
      this.partySelection.add(heroId);
    }
    this.refreshFooterStates();
    this.refresh();
  }

  private refreshFooterStates() {
    if (!this.footerCounter || !this.footerEnterBtn) return;
    this.footerCounter.setText(`Selected ${this.partySelection.size}/4`);
    const enabled = this.canEnter();
    const background = this.footerEnterBtn.getAt(
      0
    ) as Phaser.GameObjects.Rectangle;
    const label = this.footerEnterBtn.getAt(1) as Phaser.GameObjects.Text;
    background.setFillStyle(
      enabled ? PANEL_COLORS.highlight : PANEL_COLORS.disabled
    );
    label.setColor(enabled ? "#f4f6ff" : "#7d8499");
    background.removeAllListeners();
    if (enabled) {
      background
        .setInteractive({ cursor: "pointer" })
        .on("pointerover", () => background.setFillStyle(PANEL_COLORS.hover))
        .on("pointerout", () => background.setFillStyle(PANEL_COLORS.highlight))
        .on("pointerdown", () => this.tryEmbark());
    }
  }

  private tryEmbark() {
    if (!this.selectedDungeon) {
      this.store.toast("Select a dungeon first.");
      return;
    }
    if (!this.canEnter()) {
      this.store.toast("Choose 1–4 heroes to continue.");
      return;
    }
    const partyIds = Array.from(this.partySelection);
    const partyHeroes = partyIds
      .map((id) => this.state.heroes.find((h) => h.id === id))
      .filter((hero): hero is Hero => Boolean(hero))
      .map((hero) => ({
        id: hero.id,
        cls: hero.cls,
        name: hero.name,
      }));
    if (!partyHeroes.length) {
      this.store.toast("Failed to prepare the selected party.");
      return;
    }

    const payload = {
      dungeon: this.selectedDungeon,
      partyIds,
      supplies: this.state.inventory.items,
    };
    console.log("[Embark] Expedition payload:", payload);
    this.store.consumeBlessings(payload.partyIds);
    const seed = this.normalizeSeed(payload.dungeon.dungeon.seed);
    this.scene.stop("TownScene");
    this.scene.start("game", {
      seed,
      heroes: partyHeroes,
      supplies: payload.supplies,
      dungeon: payload.dungeon,
    });
  }

  private canEnter() {
    return (
      !!this.selectedDungeon &&
      this.partySelection.size >= 1 &&
      this.partySelection.size <= 4
    );
  }

  private selectDungeon(dungeon: SelectedDungeon) {
    this.selectedDungeon = dungeon;
    this.refresh();
  }

  private promptCreateDungeon() {
    const name = window.prompt("Dungeon name?", "New Expedition");
    if (!name) return;
    const difficulty = clamp(
      parseInt(window.prompt("Difficulty 1-5", "2") || "2", 10),
      1,
      5
    );
    const description =
      window.prompt("Describe this dungeon:", "A perilous venture.") ?? "";
    const seed =
      window.prompt("Seed (leave blank for random):", "") || this.newSeed();
    const res = this.store.createDungeon({
      name,
      difficulty,
      seed,
      description,
    });
    this.store.toast(res.message || "");
  }

  private promptEditDungeon(dungeon: CustomDungeon) {
    const name = window.prompt("Rename dungeon:", dungeon.name) ?? dungeon.name;
    const difficulty = clamp(
      parseInt(
        window.prompt("Difficulty 1-5", String(dungeon.difficulty)) ||
          String(dungeon.difficulty),
        10
      ),
      1,
      5
    );
    const description =
      window.prompt("Edit description:", dungeon.description) ??
      dungeon.description;
    this.store.updateDungeon(dungeon.id, {
      name,
      difficulty,
      description,
    });
  }

  private deleteDungeon(dungeon: CustomDungeon) {
    if (!window.confirm(`Retire ${dungeon.name}?`)) return;
    const res = this.store.deleteDungeon(dungeon.id);
    this.store.toast(res.message || "");
    if (
      this.selectedDungeon?.source === "custom" &&
      this.selectedDungeon.dungeon.id === dungeon.id
    ) {
      this.selectedDungeon = undefined;
    }
  }

  private normalizeSeed(raw: string): number {
    if (!raw) return Date.now() & 0xffffffff;
    const numeric = Number(raw);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return Math.floor(numeric);
    }
    const digits = raw.replace(/\D/g, "");
    if (digits) {
      const parsed = Number(digits);
      if (!Number.isNaN(parsed)) return parsed;
    }
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
    }
    return hash || 1;
  }

  private applyCommunityFilters() {
    return this.communityPool.filter((dungeon) => {
      if (
        dungeon.difficulty < this.communityFilters.difficultyMin ||
        dungeon.difficulty > this.communityFilters.difficultyMax
      ) {
        return false;
      }
      if (this.communityFilters.search) {
        const query = this.communityFilters.search.toLowerCase();
        if (
          !dungeon.name.toLowerCase().includes(query) &&
          !dungeon.description.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }

  private promptDifficultyFilter() {
    const min = clamp(
      parseInt(
        window.prompt(
          "Minimum difficulty (1-5)",
          String(this.communityFilters.difficultyMin)
        ) || "1",
        10
      ),
      1,
      5
    );
    const max = clamp(
      parseInt(
        window.prompt(
          "Maximum difficulty (1-5)",
          String(this.communityFilters.difficultyMax)
        ) || "5",
        10
      ),
      1,
      5
    );
    this.communityFilters.difficultyMin = Math.min(min, max);
    this.communityFilters.difficultyMax = Math.max(min, max);
    this.communityFilters.page = 0;
    this.refresh();
  }

  private promptSearch() {
    const query =
      window.prompt("Search text:", this.communityFilters.search) ?? "";
    this.communityFilters.search = query.trim();
    this.communityFilters.page = 0;
    this.refresh();
  }

  private resetFilters() {
    this.communityFilters = {
      difficultyMin: 1,
      difficultyMax: 5,
      search: "",
      page: 0,
    };
    this.refresh();
  }

  private toggleTab() {
    this.switchTab(this.activeTab === "create" ? "community" : "create");
  }

  private switchTab(tab: "create" | "community") {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.contentScroll = 0;
    this.renderHeader();
    this.refresh();
  }

  private updateContentAreaHeight() {
    this.contentHeight =
      this.scale.height -
      this.safe * 2 -
      FOOTER_HEIGHT -
      this.headerHeight -
      32;
  }

  private newSeed() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2, 10).toUpperCase();
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

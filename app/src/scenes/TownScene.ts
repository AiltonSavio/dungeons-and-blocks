import Phaser from "phaser";
import { townStore } from "../state/townStore";
import {
  Hero,
  ItemDefinition,
  MARKET_ITEMS,
  MAX_ACTIVE_SKILLS,
  MAX_HEROES,
  TownState,
} from "../state/models";
import { computeDerivedStats } from "../state/heroStats";
import {
  SAFE_MARGIN,
  UI_FONT,
  PANEL_COLORS,
  BUTTON_DIMENSIONS,
  snap,
} from "../ui/uiConfig";
import { setInventoryVisible } from "../ui/hudControls";

type BuildingKey =
  | "tavern"
  | "sanitarium"
  | "blacksmith"
  | "guild"
  | "market"
  | "abbey";

type BuildingDef = {
  key: BuildingKey;
  label: string;
  caption: string;
  col: number;
  row: number;
};

type ToastEntry = {
  container: Phaser.GameObjects.Container;
  ttl: number;
};

const ROSTER_WIDTH = 280;
const BUILDING_WIDTH = 180;
const BUILDING_HEIGHT = 120;
const GRID_COLUMNS = 3;
const GRID_ROWS = 2;

const BUILDINGS: BuildingDef[] = [
  {
    key: "tavern",
    label: "Tavern",
    caption: "Recruit & rest heroes",
    col: 0,
    row: 0,
  },
  {
    key: "sanitarium",
    label: "Sanitarium",
    caption: "Cure ailments & quirks",
    col: 2,
    row: 0,
  },
  {
    key: "blacksmith",
    label: "Blacksmith",
    caption: "Forge weapons & armor",
    col: 0,
    row: 1,
  },
  {
    key: "guild",
    label: "Guild",
    caption: "Train & equip skills",
    col: 2,
    row: 1,
  },
  {
    key: "market",
    label: "Market",
    caption: "Buy & sell supplies",
    col: 1,
    row: 0,
  },
  {
    key: "abbey",
    label: "Abbey",
    caption: "Ease stress & bless",
    col: 1,
    row: 1,
  },
];

export class TownScene extends Phaser.Scene {
  private safe = SAFE_MARGIN;
  private store = townStore;
  private state!: TownState;

  private worldLayer!: Phaser.GameObjects.Container;
  private uiLayer!: Phaser.GameObjects.Container;
  private tooltipLayer!: Phaser.GameObjects.Container;
  private toastLayer!: Phaser.GameObjects.Container;

  private rosterPanel!: Phaser.GameObjects.Container;
  private rosterMask!: Phaser.Display.Masks.GeometryMask;
  private rosterList!: Phaser.GameObjects.Container;
  private rosterScrollbar!: Phaser.GameObjects.Rectangle;
  private rosterScroll = 0;
  private rosterMaxScroll = 0;
  private rosterVisibleHeight = 0;
  private rosterHeader!: Phaser.GameObjects.Text;
  private rosterDetail?: Phaser.GameObjects.Container;
  private expandedHeroId?: string;
  private rosterWheelHandler?: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    dx: number,
    dy: number,
    dz: number
  ) => void;
  private rosterHover = false;
  private rosterDragging = false;
  private rosterDragStartY = 0;
  private rosterScrollStart = 0;

  private goldPanel!: Phaser.GameObjects.Container;
  private embarkedCTA!: Phaser.GameObjects.Container;

  private plazaCenterX = 0;
  private plazaCenterY = 0;
  private plazaRadius = 120;

  private modalOverlay?: Phaser.GameObjects.Rectangle;
  private modalPanel?: Phaser.GameObjects.Container;
  private pauseOverlay?: Phaser.GameObjects.Container;

  private tooltip?: Phaser.GameObjects.Container;
  private toasts: ToastEntry[] = [];

  private unsubChange?: () => void;
  private unsubToast?: () => void;

  private modalWheelHandler?: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    dx: number,
    dy: number,
    dz: number
  ) => void;

  private keyboardBindings: { event: string; handler: () => void }[] = [];

  constructor() {
    super("TownScene");
  }

  init() {
    this.state = this.store.getState();
  }

  create() {
    this.worldLayer = this.add.container(0, 0);
    this.uiLayer = this.add.container(0, 0).setDepth(10);
    this.tooltipLayer = this.add.container(0, 0).setDepth(50);
    this.toastLayer = this.add
      .container(this.scale.width / 2, this.safe)
      .setDepth(60);

    const hideInventory = () => setInventoryVisible(false);
    hideInventory();
    this.events.on(Phaser.Scenes.Events.RESUME, hideInventory);

    this.releaseKeyboardBindings();

    this.renderBackground();
    this.renderBuildings();
    this.renderTopBar();
    this.renderRoster();
    this.renderEmbarkCTA();

    this.bindInputs();

    this.unsubChange = this.store.subscribe((state) => {
      this.state = state;
      this.refreshUI();
    });
    this.unsubToast = this.store.onToast((message) => this.showToast(message));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubChange?.();
      this.unsubToast?.();
      this.events.off(Phaser.Scenes.Events.RESUME, hideInventory);
      if (this.rosterWheelHandler) {
        this.input.off("wheel", this.rosterWheelHandler, this);
        this.rosterWheelHandler = undefined;
      }
      this.input.off("pointermove", this.onRosterPointerMove, this);
      this.input.off("pointerup", this.onRosterPointerUp, this);
      this.input.off("pointerupoutside", this.onRosterPointerUp, this);
      this.releaseKeyboardBindings();
    });

    this.input.on("pointermove", this.onRosterPointerMove, this);
    this.input.on("pointerup", this.onRosterPointerUp, this);
    this.input.on("pointerupoutside", this.onRosterPointerUp, this);

    this.refreshUI();
  }

  update(_time: number, delta: number) {
    if (!this.toasts.length) return;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const toast = this.toasts[i];
      toast.ttl -= delta;
      if (toast.ttl <= 0) {
        toast.container.destroy();
        this.toasts.splice(i, 1);
        continue;
      }
      const alpha = toast.ttl < 400 ? toast.ttl / 400 : 1;
      toast.container.setAlpha(alpha);
      toast.container.y = this.safe + 16 + (this.toasts.length - i - 1) * 44;
    }
  }

  private renderBackground() {
    const width = this.scale.width;
    const height = this.scale.height;

    const bg = this.add.graphics();
    bg.fillStyle(0x111319, 1);
    bg.fillRect(0, 0, width, height);
    this.worldLayer.add(bg);

    const worldRight = width - this.safe - ROSTER_WIDTH - this.safe;
    const plazaWidth = worldRight - this.safe;
    const plazaHeight = height - this.safe * 2;
    const plaza = this.add.graphics();
    plaza.fillStyle(0x1a1f29, 1);
    plaza.fillRect(this.safe, this.safe, plazaWidth, plazaHeight);
    plaza.lineStyle(2, 0x2d3240, 1);
    plaza.strokeRect(this.safe, this.safe, plazaWidth, plazaHeight);

    // Cobblestone grid
    plaza.lineStyle(1, 0x272d3a, 0.4);
    const tile = 24;
    for (let x = this.safe + tile; x < this.safe + plazaWidth; x += tile) {
      const px = snap(x);
      plaza.lineBetween(px, this.safe, px, this.safe + plazaHeight);
    }
    for (let y = this.safe + tile; y < this.safe + plazaHeight; y += tile) {
      const py = snap(y);
      plaza.lineBetween(this.safe, py, this.safe + plazaWidth, py);
    }

    // Central circle
    const centerX = this.safe + plazaWidth / 2;
    const centerY = this.safe + plazaHeight / 2;
    plaza.fillStyle(0x242a38, 1);
    plaza.fillCircle(centerX, centerY, 120);
    plaza.lineStyle(2, 0x3b4254, 1);
    plaza.strokeCircle(centerX, centerY, 120);
    plaza.fillStyle(0x30394b, 1);
    plaza.fillCircle(centerX, centerY, 78);
    this.plazaCenterX = centerX;
    this.plazaCenterY = centerY;
    this.plazaRadius = 120;

    this.worldLayer.add(plaza);
  }

  private renderBuildings() {
    const width = this.scale.width;
    const height = this.scale.height;
    const worldRight = width - this.safe - ROSTER_WIDTH - this.safe;
    const plazaWidth = worldRight - this.safe;
    const plazaHeight = height - this.safe * 2;

    const gapX =
      GRID_COLUMNS > 1
        ? (plazaWidth - BUILDING_WIDTH * GRID_COLUMNS) / (GRID_COLUMNS - 1)
        : 0;
    const gapY =
      GRID_ROWS > 1
        ? Math.max(
            64,
            (plazaHeight - BUILDING_HEIGHT * GRID_ROWS) / (GRID_ROWS - 1)
          )
        : 0;

    BUILDINGS.forEach((def, index) => {
      const x = this.safe + snap(def.col * (BUILDING_WIDTH + gapX));
      const y = snap(this.safe + 64 + def.row * (BUILDING_HEIGHT + gapY));

      const container = this.add.container(x, y);
      this.worldLayer.add(container);

      const base = this.add
        .rectangle(0, 0, BUILDING_WIDTH, BUILDING_HEIGHT, 0x262c3b)
        .setOrigin(0);
      base.setStrokeStyle(2, 0x40485c, 1);
      container.add(base);

      const roof = this.add.rectangle(
        BUILDING_WIDTH / 2,
        -16,
        BUILDING_WIDTH * 0.85,
        32,
        0x343c50
      );
      roof.setStrokeStyle(2, 0x4a5368, 1);
      container.add(roof);

      const label = this.add
        .text(BUILDING_WIDTH / 2, 12, def.label, UI_FONT.heading)
        .setOrigin(0.5, 0);
      container.add(label);

      const caption = this.add
        .text(BUILDING_WIDTH / 2, 46, def.caption, {
          ...UI_FONT.body,
          fontSize: "12px",
          color: "#b8bed4",
          align: "center",
          wordWrap: { width: BUILDING_WIDTH - 24 },
        })
        .setOrigin(0.5, 0);
      container.add(caption);

      base
        .setInteractive({ cursor: "pointer" })
        .on("pointerover", () => {
          base.setFillStyle(0x2d3546);
          this.showTooltip(
            def.label,
            def.caption,
            x + BUILDING_WIDTH / 2,
            y - 20
          );
        })
        .on("pointerout", () => {
          base.setFillStyle(0x262c3b);
          this.hideTooltip();
        })
        .on("pointerdown", () => this.openBuilding(def.key));

      // Hotkeys: 1-6
      this.bindKey(`keydown-${index + 1}`, () => this.openBuilding(def.key));
    });
  }

  private renderTopBar() {
    const panel = this.add.container(this.safe, this.safe - 6);
    this.uiLayer.add(panel);

    const bg = this.add
      .rectangle(
        0,
        0,
        this.scale.width - this.safe * 2 - ROSTER_WIDTH - 24,
        48,
        0x1b1f2b
      )
      .setOrigin(0);
    bg.setStrokeStyle(2, 0x343a4b, 1);
    panel.add(bg);

    const title = this.add
      .text(16, 12, "Sanctum Town", UI_FONT.heading)
      .setOrigin(0, 0);
    panel.add(title);

    this.goldPanel = this.add.container(bg.width - 16, 12);
    panel.add(this.goldPanel);
  }

  private renderEmbarkCTA() {
    this.embarkedCTA?.destroy();

    const buttonWidth = 320;
    const buttonHeight = BUTTON_DIMENSIONS.height;

    // center the CTA container on the plaza circle center
    const panel = this.add.container(this.plazaCenterX, this.plazaCenterY);
    panel.setDepth(15);
    this.uiLayer.add(panel);

    // position the button so its center aligns with the panel center
    const btn = this.createButton(
      -buttonWidth / 2,
      -buttonHeight / 2,
      buttonWidth,
      "Embark Adventure",
      () => this.launchEmbark()
    );

    panel.add(btn);
    this.embarkedCTA = panel;
  }

  private renderRoster() {
    const x = this.scale.width - this.safe - ROSTER_WIDTH;
    const y = this.safe;
    const height = this.scale.height - this.safe * 2;

    this.rosterPanel?.destroy();
    this.rosterPanel = this.add.container(x, y);
    this.uiLayer.add(this.rosterPanel);
    this.rosterPanel.setSize(ROSTER_WIDTH, height);
    this.rosterPanel.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, ROSTER_WIDTH, height),
      Phaser.Geom.Rectangle.Contains
    );
    this.rosterPanel.on("pointerover", () => (this.rosterHover = true));
    this.rosterPanel.on("pointerout", () => (this.rosterHover = false));

    const bg = this.add
      .rectangle(0, 0, ROSTER_WIDTH, height, 0x1b1f2b)
      .setOrigin(0);
    bg.setStrokeStyle(2, 0x343a4b, 1);
    bg.setInteractive();
    bg.on("pointerover", () => (this.rosterHover = true));
    bg.on("pointerout", () => (this.rosterHover = false));
    this.rosterPanel.add(bg);

    this.rosterHeader = this.add
      .text(16, 12, "", UI_FONT.heading)
      .setOrigin(0, 0);
    this.updateRosterHeader();
    this.rosterPanel.add(this.rosterHeader);

    const scrollHint = this.add
      .text(ROSTER_WIDTH - 18, 14, "⇅", {
        ...UI_FONT.caption,
        color: "#6a7188",
      })
      .setOrigin(1, 0);
    this.rosterPanel.add(scrollHint);

    const maskRect = this.add.rectangle(
      x + 12 + (ROSTER_WIDTH - 24) / 2,
      y + 44 + (height - 56) / 2,
      ROSTER_WIDTH - 24,
      height - 56,
      0xffffff,
      0
    );
    this.rosterMask = maskRect.createGeometryMask();
    maskRect.destroy();

    this.rosterList = this.add.container(12, 44);
    this.rosterList.setMask(this.rosterMask);
    this.rosterPanel.add(this.rosterList);

    const track = this.add
      .rectangle(ROSTER_WIDTH - 10, 44, 4, height - 56, 0x1f2535, 0.6)
      .setOrigin(0.5, 0);
    this.rosterPanel.add(track);
    track.setInteractive();
    track.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.rosterMaxScroll <= 0) return;
      const localY = (pointer.worldY ?? pointer.y) - (this.safe + 44);
      const trackHeight =
        this.rosterVisibleHeight - this.rosterScrollbar.height;
      if (trackHeight <= 0) return;
      const progress = Phaser.Math.Clamp(localY / trackHeight, 0, 1);
      this.rosterScroll = -this.rosterMaxScroll * progress;
      this.updateRosterPosition();
    });

    this.rosterScrollbar = this.add
      .rectangle(ROSTER_WIDTH - 10, 44, 4, height - 56, 0x2b3144)
      .setOrigin(0.5, 0);
    this.rosterPanel.add(this.rosterScrollbar);
    this.rosterScrollbar.setInteractive({ cursor: "grab" });
    this.rosterScrollbar.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.rosterMaxScroll <= 0) return;
      const trackHeight =
        this.rosterVisibleHeight - this.rosterScrollbar.height;
      if (trackHeight <= 0) return;
      this.rosterDragging = true;
      this.rosterDragStartY = pointer.worldY ?? pointer.y;
      this.rosterScrollStart = this.rosterScroll;
      this.input.setDefaultCursor("grabbing");
    });

    if (this.rosterWheelHandler) {
      this.input.off("wheel", this.rosterWheelHandler, this);
    }
    this.rosterWheelHandler = (pointer, _objects, _dx, dy, _dz) => {
      const posX = pointer.worldX ?? pointer.x;
      const posY = pointer.worldY ?? pointer.y;

      const bounds = new Phaser.Geom.Rectangle(
        this.scale.width - this.safe - ROSTER_WIDTH,
        this.safe,
        ROSTER_WIDTH,
        this.scale.height - this.safe * 2
      );
      if (!bounds.contains(posX, posY)) return;

      if (this.rosterMaxScroll > 0) {
        this.rosterScroll = clamp(
          this.rosterScroll - dy * 0.5,
          -this.rosterMaxScroll,
          0
        );
        this.updateRosterPosition();
      }
    };
    this.input.on("wheel", this.rosterWheelHandler, this);
  }

  private refreshUI() {
    this.renderGold();
    this.populateRoster();
    this.updateRosterHeader();
  }

  private renderGold() {
    this.goldPanel.removeAll(true);
    const gold = this.state.inventory.gold;
    const plate = this.add.rectangle(0, 0, 180, 24, 0x252b3a).setOrigin(1, 0);
    plate.setStrokeStyle(1, 0x40485c, 1);
    plate.setInteractive({ cursor: "default" });
    this.goldPanel.add(plate);

    this.goldPanel.add(
      this.add
        .text(-165, 4, "Gold", { ...UI_FONT.body, color: "#c1c6db" })
        .setOrigin(0, 0)
    );

    this.goldPanel.add(
      this.add
        .text(-12, 4, gold.toLocaleString(), {
          ...UI_FONT.heading,
          fontSize: "18px",
          color: "#ffe28a",
        })
        .setOrigin(1, 0)
    );
  }

  private populateRoster() {
    this.rosterList.removeAll(true);
    this.rosterDetail?.destroy();

    const rowHeight = 72;
    const gap = 10;
    const visibleHeight = this.scale.height - this.safe * 2 - 56;
    this.rosterVisibleHeight = visibleHeight;

    let offsetY = 0;
    const heroPositions: Record<string, number> = {};

    this.state.heroes.forEach((hero) => {
      const row = this.createRosterRow(hero);
      row.y = offsetY;
      this.rosterList.add(row);
      heroPositions[hero.id] = offsetY;
      offsetY += rowHeight + gap;
    });

    this.rosterMaxScroll = Math.max(0, offsetY - visibleHeight);
    this.rosterScroll = clamp(this.rosterScroll, -this.rosterMaxScroll, 0);
    this.updateRosterPosition();

    if (this.expandedHeroId) {
      const hero = this.state.heroes.find((h) => h.id === this.expandedHeroId);
      if (hero) {
        const overlay = this.createRosterDetail(hero);
        const baseY = heroPositions[hero.id] + this.rosterScroll;
        overlay.setPosition(12, clamp(baseY, 44, visibleHeight - 140 + 44));
        overlay.setMask(this.rosterMask);
        this.rosterPanel.add(overlay);
        this.rosterDetail = overlay;
      } else {
        this.expandedHeroId = undefined;
      }
    }
  }

  private updateRosterHeader() {
    if (!this.rosterHeader) return;
    this.rosterHeader.setText(
      `Roster (${this.state.heroes.length}/${MAX_HEROES})`
    );
  }

  private createRosterRow(hero: Hero) {
    const container = this.add.container(0, 0);
    const bg = this.add
      .rectangle(0, 0, ROSTER_WIDTH - 48, 72, 0x232737)
      .setOrigin(0);
    bg.setStrokeStyle(1, 0x3a4052, 1);
    container.add(bg);

    bg.setInteractive({ cursor: "pointer" })
      .on("pointerover", () => {
        bg.setFillStyle(0x2a3043);
        this.rosterHover = true;
      })
      .on("pointerout", () => {
        bg.setFillStyle(0x232737);
        this.rosterHover = false;
      })
      .on("pointerdown", () => {
        this.expandedHeroId =
          this.expandedHeroId === hero.id ? undefined : hero.id;
        this.populateRoster();
      });

    container.add(
      this.add.text(12, 10, hero.name, UI_FONT.body).setOrigin(0, 0)
    );
    container.add(
      this.add
        .text(ROSTER_WIDTH - 60, 10, hero.cls, {
          ...UI_FONT.caption,
          color: "#9fa6c0",
        })
        .setOrigin(1, 0)
    );
    container.add(
      this.add
        .text(12, 26, `Lv ${hero.level}`, {
          ...UI_FONT.caption,
          color: "#8fb0ff",
        })
        .setOrigin(0, 0)
    );

    const hpRatio = hero.hp / hero.maxHp;
    const hpBarBg = this.add
      .rectangle(12, 44, ROSTER_WIDTH - 72, 6, 0x1a1d29)
      .setOrigin(0, 0);
    container.add(hpBarBg);
    container.add(
      this.add
        .rectangle(12, 44, (ROSTER_WIDTH - 72) * hpRatio, 6, 0x68da87)
        .setOrigin(0, 0)
    );
    container.add(
      this.add
        .text(12, 52, `HP ${hero.hp}/${hero.maxHp}`, {
          ...UI_FONT.caption,
          color: "#9cbcaa",
        })
        .setOrigin(0, 0)
    );
    container.add(
      this.add
        .text(ROSTER_WIDTH - 60, 52, `Stress ${hero.stress}%`, {
          ...UI_FONT.caption,
          color:
            hero.stress > 70
              ? "#ff6b6b"
              : hero.stress > 45
              ? "#ffc36b"
              : "#9dc9ff",
        })
        .setOrigin(1, 0)
    );
    return container;
  }

  private createRosterDetail(hero: Hero) {
    const width = ROSTER_WIDTH - 48;
    const detail = this.add.container(12, 0);
    const bg = this.add.rectangle(0, 0, width, 120, 0x1f2432).setOrigin(0);
    bg.setStrokeStyle(2, 0x47607f, 1);
    detail.add(bg);

    const derived = computeDerivedStats(hero);
    let cursorY = 10;

    const addLine = (
      text: string,
      style: Phaser.Types.GameObjects.Text.TextStyle,
      spacing = 6
    ) => {
      const label = this.add.text(12, cursorY, text, style).setOrigin(0, 0);
      detail.add(label);
      cursorY += label.height + spacing;
      return label;
    };

    addLine(
      `${hero.name} (${hero.cls})`,
      { ...UI_FONT.body, color: "#f4f6ff" },
      8
    );

    addLine(`Weapon ${hero.weaponLevel} • Armor ${hero.armorLevel}`, {
      ...UI_FONT.caption,
      color: "#9dadc6",
    });

    addLine(`HP ${hero.hp}/${hero.maxHp} • STA ${hero.coreStats.sta}`, {
      ...UI_FONT.caption,
      color: "#b9c6dd",
    });

    addLine(
      `ATK ${hero.coreStats.atk} • DEF ${hero.coreStats.def} • MAG ${hero.coreStats.mag} • RES ${hero.coreStats.res}`,
      { ...UI_FONT.caption, color: "#b9c6dd" }
    );
    addLine(`SPD ${hero.coreStats.spd} • LCK ${hero.coreStats.lck}`, {
      ...UI_FONT.caption,
      color: "#b9c6dd",
    });

    addLine(
      `ACC ${Math.round(derived.accuracy)}% • CRIT ${Math.round(
        derived.critChance
      )}% • DODGE ${Math.round(derived.dodge)}%`,
      { ...UI_FONT.caption, color: "#94c7ff" }
    );

    addLine(
      `DMG ${derived.physicalDamage.min}-${derived.physicalDamage.max} / ${
        derived.magicDamage.min
      }-${derived.magicDamage.max} • PEN ${Math.round(
        derived.armorPen
      )} • INIT ${derived.initiative}`,
      { ...UI_FONT.caption, color: "#94c7ff" }
    );
    addLine(`DEBUFF RES ${Math.round(derived.debuffResist)}%`, {
      ...UI_FONT.caption,
      color: "#94c7ff",
    });

    const elem = hero.elemental;
    addLine(
      `Element Off F${elem.offense.fire} I${elem.offense.ice} H${elem.offense.holy} S${elem.offense.shadow}`,
      { ...UI_FONT.caption, color: "#c7b4ff" }
    );
    addLine(
      `Element Res F${elem.resistance.fire} I${elem.resistance.ice} H${elem.resistance.holy} S${elem.resistance.shadow}`,
      { ...UI_FONT.caption, color: "#c7b4ff" }
    );

    const traits = hero.traits
      .concat(hero.diseases)
      .map((t) => {
        const prefix =
          t.category === "virtue"
            ? "+"
            : t.category === "affliction"
            ? "-"
            : t.category === "disease"
            ? "!"
            : "•";
        return `${prefix}${t.name}`;
      })
      .join(", ");
    addLine(traits || "No notable quirks.", {
      ...UI_FONT.caption,
      color: "#b2b7cc",
      wordWrap: { width: width - 24 },
    });

    const activeSkills = hero.activeSkillIds
      .map((id) => hero.skills.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join(", ");
    addLine(`Active: ${activeSkills || "No skills equipped."}`, {
      ...UI_FONT.caption,
      color: "#94c7ff",
      wordWrap: { width: width - 24 },
    });

    bg.setSize(width, cursorY + 8);

    return detail;
  }

  private updateRosterPosition() {
    this.rosterList.y = 44 + this.rosterScroll;
    if (this.rosterMaxScroll <= 0) {
      this.rosterScrollbar.setVisible(false);
      return;
    }
    this.rosterScrollbar.setVisible(true);
    const visibleHeight = this.scale.height - this.safe * 2 - 56;
    const ratio = visibleHeight / (visibleHeight + this.rosterMaxScroll);
    const thumbHeight = Math.max(24, (visibleHeight - 8) * ratio);
    const progress = this.rosterScroll / -this.rosterMaxScroll;
    const trackHeight = visibleHeight - thumbHeight;
    this.rosterScrollbar.height = thumbHeight;
    this.rosterScrollbar.y = 44 + progress * trackHeight;
  }

  private onRosterPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.rosterDragging || this.rosterMaxScroll <= 0) return;
    const trackHeight = this.rosterVisibleHeight - this.rosterScrollbar.height;
    if (trackHeight <= 0) return;
    const pointerY = pointer.worldY ?? pointer.y;
    const delta = pointerY - this.rosterDragStartY;
    const startProgress =
      this.rosterMaxScroll === 0
        ? 0
        : this.rosterScrollStart / -this.rosterMaxScroll;
    const progress = Phaser.Math.Clamp(
      startProgress + delta / trackHeight,
      0,
      1
    );
    this.rosterScroll = -this.rosterMaxScroll * progress;
    this.updateRosterPosition();
  }

  private onRosterPointerUp() {
    if (!this.rosterDragging) return;
    this.rosterDragging = false;
    this.input.setDefaultCursor("default");
  }

  private createButton(
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
      .setStrokeStyle(1, 0x4a5976, 1);
    container.add(rect);

    const text = this.add
      .text(width / 2, BUTTON_DIMENSIONS.height / 2, label, {
        ...UI_FONT.body,
        fontSize: "12px",
        color: enabled ? "#f4f6ff" : "#7d869d",
      })
      .setOrigin(0.5);
    container.add(text);

    if (enabled) {
      rect
        .setInteractive({ cursor: "pointer" })
        .on("pointerover", () => rect.setFillStyle(PANEL_COLORS.hover))
        .on("pointerout", () => rect.setFillStyle(PANEL_COLORS.highlight))
        .on("pointerdown", handler);
    }

    return container;
  }

  private showTooltip(title: string, caption: string, x: number, y: number) {
    this.hideTooltip();

    const tooltip = this.add.container(0, 0);
    const padding = 10;
    const contentWidth = 220;

    const textTitle = this.add
      .text(0, 0, title, {
        ...UI_FONT.body,
        color: "#f4f6ff",
      })
      .setOrigin(0, 0);
    tooltip.add(textTitle);

    const textBody = this.add
      .text(0, textTitle.height + 4, caption, {
        ...UI_FONT.caption,
        color: "#c4c9dc",
        wordWrap: { width: contentWidth },
      })
      .setOrigin(0, 0);
    tooltip.add(textBody);

    const width = Math.max(textTitle.width, contentWidth) + padding * 2;
    const height = textTitle.height + textBody.height + padding * 2;

    const bg = this.add
      .rectangle(0, 0, width, height, 0x1e2332, 0.95)
      .setOrigin(0);
    bg.setStrokeStyle(1, 0x3c455a, 1);
    tooltip.addAt(bg, 0);

    let tx = snap(x - width / 2);
    let ty = snap(y - height - 12);
    if (tx < this.safe) tx = this.safe;
    if (tx + width > this.scale.width - this.safe - ROSTER_WIDTH) {
      tx = this.scale.width - this.safe - ROSTER_WIDTH - width;
    }
    if (ty < this.safe) ty = y + 16;

    tooltip.setPosition(tx, ty);
    tooltip.setDepth(50);
    this.tooltipLayer.add(tooltip);
    this.tooltip = tooltip;
  }

  private hideTooltip() {
    this.tooltip?.destroy();
    this.tooltip = undefined;
  }

  private openBuilding(key: BuildingKey, heroId?: string) {
    switch (key) {
      case "tavern":
        this.openTavern(heroId);
        break;
      case "sanitarium":
        this.openSanitarium(heroId);
        break;
      case "blacksmith":
        this.openBlacksmith(heroId);
        break;
      case "guild":
        this.openGuild(heroId);
        break;
      case "market":
        this.openMarket();
        break;
      case "abbey":
        this.openAbbey(heroId);
        break;
    }
  }

  private openModal(
    title: string,
    builder: (content: Phaser.GameObjects.Container, close: () => void) => void
  ) {
    this.closeModal();

    const maxW = Math.floor(this.scale.width * 0.7);
    const maxH = Math.floor(this.scale.height * 0.7);
    const baseW = 480;
    const baseH = 360;
    const padding = { top: 56, bottom: 16, left: 24, right: 24 }; // title+close area = 56

    // overlay
    this.modalOverlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55)
      .setOrigin(0)
      .setDepth(80)
      .setInteractive();

    // panel container
    this.modalPanel = this.add.container(0, 0).setDepth(81);

    // temp bg with base size (we'll relayout after measuring)
    const bg = this.add.rectangle(0, 0, baseW, baseH, 0x1a1f2b).setOrigin(0);
    bg.setStrokeStyle(2, 0x3c4252, 1);
    this.modalPanel.add(bg);

    // title
    const titleText = this.add
      .text(24, 18, title, UI_FONT.heading)
      .setOrigin(0, 0);
    this.modalPanel.add(titleText);

    // close button (position updated after final width is known)
    const closeBtn = this.createButton(0, 16, 92, "Close", () =>
      this.closeModal()
    );
    this.modalPanel.add(closeBtn);

    // content container (position anchored to padding)
    const content = this.add.container(padding.left, padding.top);
    this.modalPanel.add(content);

    // let the caller populate content
    builder(content, () => this.closeModal());

    // ---- Measure content and compute desired size ----
    // getBounds works on world space; we'll use width/height of content’s local children
    const contentBounds = content.getBounds(); // world bounds
    // content local width/height (account for children sizes). If empty, keep 0.
    const contentW = Math.max(0, Math.ceil(contentBounds.width));
    const contentH = Math.max(0, Math.ceil(contentBounds.height));

    // desired size = padding + content
    let desiredW = Math.max(baseW, padding.left + contentW + padding.right);
    let desiredH = Math.max(baseH, padding.top + contentH + padding.bottom);

    // cap to 70% of screen
    const panelW = Math.min(desiredW, maxW);
    const panelH = Math.min(desiredH, maxH);

    // apply final bg size (force display pipeline to update)
    bg.setSize(panelW, panelH); // updates the internal size
    bg.setDisplaySize(panelW, panelH); // ensures the rendered size matches
    bg.setStrokeStyle(2, 0x3c4252, 1); // re-assert stroke after size change

    // apply final bg size
    bg.width = panelW;
    bg.height = panelH;

    // position close button flush right
    closeBtn.setPosition(panelW - 92 - 16, 16);

    // center panel
    this.modalPanel.setPosition(
      snap((this.scale.width - panelW) / 2),
      snap((this.scale.height - panelH) / 2)
    );

    // ---- Scrolling if overflow ----
    const innerW = panelW - padding.left - padding.right;
    const innerH = panelH - padding.top - padding.bottom;

    // We’ll only add scroll in directions that actually overflow.
    let scrollY = 0;

    // Add a mask rect for the visible content area
    const maskRect = this.add.rectangle(
      this.modalPanel.x + padding.left + innerW / 2,
      this.modalPanel.y + padding.top + innerH / 2,
      innerW,
      innerH,
      0xffffff,
      0
    );
    const contentMask = maskRect.createGeometryMask();
    content.setMask(contentMask);

    // helper to clamp & apply scroll
    const applyContentScroll = () => {
      const maxScrollY = Math.max(0, contentH - innerH);
      if (maxScrollY <= 0) {
        scrollY = 0;
      } else {
        scrollY = Phaser.Math.Clamp(scrollY, -maxScrollY, 0);
      }
      content.y = padding.top + scrollY; // content is inside modalPanel, so keep offset from top padding
    };

    applyContentScroll();

    this.modalWheelHandler = (pointer, _objects, _dx, dy, _dz) => {
      const px = pointer.worldX ?? pointer.x;
      const py = pointer.worldY ?? pointer.y;

      const visibleRect = new Phaser.Geom.Rectangle(
        this.modalPanel!.x + padding.left,
        this.modalPanel!.y + padding.top,
        innerW,
        innerH
      );
      if (!visibleRect.contains(px, py)) return;

      if (contentH > innerH) {
        scrollY -= dy * 0.5; // adjust sensitivity if you want
        applyContentScroll();
      }
    };
    this.input.on("wheel", this.modalWheelHandler, this);
  }

  private closeModal() {
    if (this.modalWheelHandler) {
      this.input.off("wheel", this.modalWheelHandler, this);
      this.modalWheelHandler = undefined;
    }
    this.modalOverlay?.destroy();
    this.modalPanel?.destroy();
    this.modalOverlay = undefined;
    this.modalPanel = undefined;
  }

  private openTavern(heroId?: string) {
    this.openModal("The Sable Hearth Tavern", (panel) => {
      panel.add(
        this.add
          .text(0, 0, "Recruit adventurers or rent rooms for the weary.", {
            ...UI_FONT.body,
            wordWrap: { width: 432 },
          })
          .setOrigin(0, 0)
      );

      const recruitEnabled = this.state.heroes.length < MAX_HEROES;
      const recruitBtn = this.createButton(
        0,
        32,
        200,
        recruitEnabled ? "Recruit Hero (100g)" : "Roster Full",
        () => {
          const res = this.store.recruitHero();
          this.showToast(res.message || "");
        },
        recruitEnabled
      );
      panel.add(recruitBtn);

      const restHeader = this.add
        .text(0, 82, "Rest heroes (−30 stress, 25g each)", UI_FONT.body)
        .setOrigin(0, 0);
      panel.add(restHeader);

      let offset = 110;
      this.state.heroes.forEach((hero) => {
        const row = this.createButton(
          0,
          offset,
          360,
          `${hero.name} — ${hero.stress}% stress`,
          () => {
            const res = this.store.restHero(hero.id);
            this.showToast(res.message || "");
          },
          hero.stress > 0
        );
        if (heroId && hero.id === heroId) offset += 40;
        panel.add(row);
        offset += 40;
      });
    });
  }

  private openSanitarium(heroId?: string) {
    this.openModal("Sanitarium of Calming Winds", (panel) => {
      panel.add(
        this.add
          .text(
            0,
            0,
            "Cleanse diseases and troubling quirks (60g, 20% failure).",
            {
              ...UI_FONT.body,
              wordWrap: { width: 432 },
            }
          )
          .setOrigin(0, 0)
      );

      let offset = 32;
      const candidates = this.state.heroes.filter(
        (hero) =>
          hero.diseases.length > 0 ||
          hero.traits.some((t) => t.category === "affliction")
      );
      if (!candidates.length) {
        panel.add(
          this.add
            .text(0, offset, "No heroes require treatment.", UI_FONT.body)
            .setOrigin(0, 0)
        );
        return;
      }

      candidates.forEach((hero) => {
        const afflictions = hero.diseases
          .map((d) => d.name)
          .concat(
            hero.traits
              .filter((t) => t.category === "affliction")
              .map((t) => t.name)
          )
          .join(", ");
        const btn = this.createButton(
          0,
          offset,
          400,
          `${hero.name} — ${afflictions}`,
          () => {
            const res = this.store.sanitizeHero(hero.id);
            this.showToast(res.message || "");
          }
        );
        if (heroId && hero.id === heroId) offset += 40;
        panel.add(btn);
        offset += 40;
      });
    });
  }

  private openBlacksmith(heroId?: string) {
    this.openModal("Iron & Ember Forge", (panel) => {
      panel.add(
        this.add
          .text(
            0,
            0,
            "Temper steel to sharpen your blades and armor.",
            UI_FONT.body
          )
          .setOrigin(0, 0)
      );

      let offset = 32;
      this.state.heroes.forEach((hero) => {
        const card = this.add.container(0, offset);

        card.add(
          this.add
            .text(
              0,
              0,
              `${hero.name} — Weapon ${hero.weaponLevel} • Armor ${hero.armorLevel}`,
              {
                ...UI_FONT.body,
              }
            )
            .setOrigin(0, 0)
        );

        card.add(
          this.createButton(
            0,
            26,
            200,
            `Upgrade Weapon (${50 * hero.weaponLevel}g)`,
            () => {
              const res = this.store.upgradeWeapon(hero.id);
              this.showToast(res.message || "");
            },
            hero.weaponLevel < 5
          )
        );

        card.add(
          this.createButton(
            220,
            26,
            200,
            `Upgrade Armor (${50 * hero.armorLevel}g)`,
            () => {
              const res = this.store.upgradeArmor(hero.id);
              this.showToast(res.message || "");
            },
            hero.armorLevel < 5
          )
        );

        if (heroId && hero.id === heroId) offset += 76;
        panel.add(card);
        offset += 76;
      });
    });
  }

  private openGuild(heroId?: string) {
    this.openModal("Adventurers' Guild", (panel) => {
      panel.add(
        this.add
          .text(
            0,
            0,
            "Learn new skills or refine current techniques.",
            UI_FONT.body
          )
          .setOrigin(0, 0)
      );

      let offset = 28;
      this.state.heroes.forEach((hero) => {
        const heroHeader = this.add
          .text(
            0,
            offset,
            `${hero.name} — active ${hero.activeSkillIds.length}/${MAX_ACTIVE_SKILLS}`,
            {
              ...UI_FONT.body,
              color: "#f4f6ff",
            }
          )
          .setOrigin(0, 0);
        panel.add(heroHeader);
        offset += 20;

        hero.skills.forEach((skill) => {
          const row = this.add.container(0, offset);
          const owned = skill.owned;
          row.add(
            this.add
              .text(0, 0, `${skill.name} Lv ${skill.level}/${skill.maxLevel}`, {
                ...UI_FONT.caption,
                color: owned ? "#9ac6ff" : "#7a8094",
              })
              .setOrigin(0, 0)
          );

          if (!owned) {
            row.add(
              this.createButton(220, -4, 150, "Learn (75g)", () => {
                const res = this.store.learnSkill(hero.id, skill.id);
                this.showToast(res.message || "");
              })
            );
          } else if (skill.level < skill.maxLevel) {
            row.add(
              this.createButton(
                220,
                -4,
                150,
                `Upgrade (${40 * (skill.level + 1)}g)`,
                () => {
                  const res = this.store.upgradeSkill(hero.id, skill.id);
                  this.showToast(res.message || "");
                }
              )
            );
          }

          const active = hero.activeSkillIds.includes(skill.id);
          row.add(
            this.createButton(
              380,
              -4,
              90,
              active ? "Active" : "Activate",
              () => {
                const next = active
                  ? hero.activeSkillIds.filter((id) => id !== skill.id)
                  : hero.activeSkillIds.length >= MAX_ACTIVE_SKILLS
                  ? hero.activeSkillIds.slice(1).concat(skill.id)
                  : [...hero.activeSkillIds, skill.id];
                const res = this.store.setActiveSkills(hero.id, next);
                this.showToast(res.message || "");
              },
              owned
            )
          );

          panel.add(row);
          offset += 32;
        });

        offset += 12;
        if (heroId && hero.id === heroId) offset += 12;
      });
    });
  }

  private openMarket() {
    this.openModal("Night Market", (panel) => {
      panel.add(
        this.add
          .text(
            0,
            0,
            "Trade provisions to prepare for expeditions.",
            UI_FONT.body
          )
          .setOrigin(0, 0)
      );

      let offset = 28;
      MARKET_ITEMS.forEach((item: ItemDefinition) => {
        const owned = this.state.inventory.items[item.id] ?? 0;

        panel.add(
          this.add
            .text(0, offset, `${item.name} — ${item.description}`, {
              ...UI_FONT.body,
              wordWrap: { width: 420 },
            })
            .setOrigin(0, 0)
        );
        offset += 20;

        panel.add(
          this.add
            .text(0, offset, `Owned: ${owned}`, UI_FONT.caption)
            .setOrigin(0, 0)
        );

        panel.add(
          this.createButton(
            240,
            offset - 6,
            110,
            `Buy (${item.buyPrice}g)`,
            () => {
              const res = this.store.marketBuy(item.id, 1);
              this.showToast(res.message || "");
            }
          )
        );
        panel.add(
          this.createButton(
            360,
            offset - 6,
            110,
            `Sell (+${item.sellPrice}g)`,
            () => {
              const res = this.store.marketSell(item.id, 1);
              this.showToast(res.message || "");
            },
            owned > 0
          )
        );
        offset += 40;
      });
    });
  }

  private openAbbey(heroId?: string) {
    this.openModal("Abbey of the Dawn", (panel) => {
      panel.add(
        this.add
          .text(
            0,
            0,
            "Meditate to reduce stress or purchase a holy blessing.",
            UI_FONT.body
          )
          .setOrigin(0, 0)
      );

      let offset = 26;
      this.state.heroes.forEach((hero) => {
        const label = `${hero.name} — stress ${hero.stress}%`;

        panel.add(
          this.createButton(0, offset, 220, label, () => {
            const res = this.store.applyAbbey([hero.id], { stressRelief: 25 });
            this.showToast(res.message || "");
          })
        );
        panel.add(
          this.createButton(240, offset, 180, "Blessing (45g)", () => {
            const res = this.store.applyAbbey([hero.id], {
              stressRelief: 10,
              blessing: true,
            });
            this.showToast(res.message || "");
          })
        );
        offset += 38;
      });
    });
  }

  private bindInputs() {
    this.bindKey("keydown-ESC", () => this.handleEsc());
    this.bindKey("keydown-E", () => this.launchEmbark());
  }

  private handleEsc() {
    if (this.modalPanel) {
      this.closeModal();
      return;
    }
    if (this.pauseOverlay) {
      this.pauseOverlay.destroy();
      this.pauseOverlay = undefined;
      return;
    }
    this.pauseOverlay = this.add.container(
      snap(this.scale.width / 2),
      snap(this.scale.height / 2)
    );
    this.pauseOverlay.setDepth(90);
    const bg = this.add.rectangle(0, 0, 300, 200, 0x1c202c).setOrigin(0.5);
    bg.setStrokeStyle(2, 0x3c4252, 1);
    this.pauseOverlay.add(bg);
    this.pauseOverlay.add(
      this.add.text(0, -70, "Pause", UI_FONT.heading).setOrigin(0.5)
    );
    this.pauseOverlay.add(
      this.add
        .text(0, -24, "Esc: Close panels\n1–6: Buildings\nE: Embark planner", {
          ...UI_FONT.body,
          align: "center",
        })
        .setOrigin(0.5, 0)
    );
    const resume = this.createButton(-80, 40, 160, "Resume", () =>
      this.handleEsc()
    );
    this.pauseOverlay.add(resume);
  }

  private launchEmbark() {
    this.scene.launch("EmbarkScene");
    this.scene.pause();
  }

  private showToast(message: string) {
    if (!message) return;
    const container = this.add.container(0, 0);
    const bg = this.add.rectangle(0, 0, 420, 44, 0x252a38, 0.95).setOrigin(0.5);
    bg.setStrokeStyle(1, 0x3b4254, 1);
    container.add(bg);
    container.add(
      this.add
        .text(0, 0, message, {
          ...UI_FONT.body,
          align: "center",
          wordWrap: { width: 380 },
        })
        .setOrigin(0.5)
    );
    container.setAlpha(0);
    this.toastLayer.add(container);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 180,
    });
    this.toasts.push({ container, ttl: 2600 });
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

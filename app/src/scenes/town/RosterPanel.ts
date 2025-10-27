import Phaser from "phaser";

import {
  ChainHero,
  getHeroTypeLabel,
  getQuirkLabel,
} from "../../state/heroChain";
import { ROSTER_WIDTH } from "./constants";
import { UI_FONT } from "../../ui/uiConfig";
import { clamp } from "./utils";
import { formatHeroRowStats, formatHeroTimestamp } from "./heroFormatting";
import type { HeroLockStatus } from "../../state/adventureChain";

type RosterPanelOptions = {
  scene: Phaser.Scene;
  safeMargin: number;
  uiLayer: Phaser.GameObjects.Container;
  maxHeroes: number;
  onHeroToggle: (heroId: number | undefined) => void;
};

export type RosterPanelState = {
  walletAddress?: string;
  heroes: ChainHero[];
  heroesLoading: boolean;
  heroLoadError?: string;
  heroLockStatuses?: Map<string, HeroLockStatus>;
  expandedHeroId?: number;
};

const PANEL_PADDING_TOP = 44;
const PANEL_PADDING_BOTTOM = 56;

export class RosterPanel {
  private readonly scene: Phaser.Scene;
  private readonly safeMargin: number;
  private readonly uiLayer: Phaser.GameObjects.Container;
  private readonly maxHeroes: number;
  private readonly onHeroToggle: (heroId: number | undefined) => void;

  private panel?: Phaser.GameObjects.Container;
  private mask?: Phaser.Display.Masks.GeometryMask;
  private maskRect?: Phaser.GameObjects.Rectangle;
  private list?: Phaser.GameObjects.Container;
  private scrollbar?: Phaser.GameObjects.Rectangle;
  private header?: Phaser.GameObjects.Text;
  private detail?: Phaser.GameObjects.Container;

  private scroll = 0;
  private maxScroll = 0;
  private visibleHeight = 0;
  private dragging = false;
  private dragStartY = 0;
  private scrollStart = 0;

  private wheelHandler?: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    dx: number,
    dy: number,
    dz: number
  ) => void;

  private state: RosterPanelState = {
    heroes: [],
    heroesLoading: false,
  };

  constructor(options: RosterPanelOptions) {
    this.scene = options.scene;
    this.safeMargin = options.safeMargin;
    this.uiLayer = options.uiLayer;
    this.maxHeroes = options.maxHeroes;
    this.onHeroToggle = options.onHeroToggle;
  }

  init() {
    const { scene, safeMargin } = this;
    const x = scene.scale.width - safeMargin - ROSTER_WIDTH;
    const y = safeMargin;
    const height = scene.scale.height - safeMargin * 2;

    this.panel = scene.add.container(x, y);
    this.panel.setDepth(11);
    this.uiLayer.add(this.panel);
    this.panel.setSize(ROSTER_WIDTH, height);
    this.panel.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, ROSTER_WIDTH, height),
      Phaser.Geom.Rectangle.Contains
    );

    const bg = scene.add
      .rectangle(0, 0, ROSTER_WIDTH, height, 0x1b1f2b)
      .setOrigin(0);
    bg.setStrokeStyle(2, 0x343a4b, 1);
    bg.setInteractive();
    this.panel.add(bg);

    this.header = scene.add.text(16, 12, "", UI_FONT.heading).setOrigin(0, 0);
    this.panel.add(this.header);

    const scrollHint = scene.add
      .text(ROSTER_WIDTH - 18, 14, "⇅", {
        ...UI_FONT.caption,
        color: "#6a7188",
      })
      .setOrigin(1, 0);
    this.panel.add(scrollHint);

    this.maskRect = scene.add
      .rectangle(
        x + 12 + (ROSTER_WIDTH - 24) / 2,
        y + 44 + (height - PANEL_PADDING_BOTTOM) / 2,
        ROSTER_WIDTH - 24,
        height - PANEL_PADDING_BOTTOM,
        0xffffff,
        0 // invisible fill
      )
      .setVisible(false); // keep alive, just hide
    this.mask = this.maskRect.createGeometryMask();

    this.list = scene.add.container(12, PANEL_PADDING_TOP);
    this.list.setMask(this.mask);
    this.panel.add(this.list);

    const track = scene.add
      .rectangle(
        ROSTER_WIDTH - 10,
        PANEL_PADDING_TOP,
        4,
        height - PANEL_PADDING_BOTTOM,
        0x1f2535,
        0.6
      )
      .setOrigin(0.5, 0);
    this.panel.add(track);
    track.setInteractive();
    track.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.maxScroll <= 0 || !this.scrollbar) return;
      const localY =
        (pointer.worldY ?? pointer.y) - (safeMargin + PANEL_PADDING_TOP);
      const trackHeight = this.visibleHeight - this.scrollbar.height;
      if (trackHeight <= 0) return;
      const progress = Phaser.Math.Clamp(localY / trackHeight, 0, 1);
      this.scroll = -this.maxScroll * progress;
      this.updateScrollPosition();
    });

    this.scrollbar = scene.add
      .rectangle(
        ROSTER_WIDTH - 10,
        PANEL_PADDING_TOP,
        4,
        height - PANEL_PADDING_BOTTOM,
        0x2b3144
      )
      .setOrigin(0.5, 0);
    this.panel.add(this.scrollbar);
    this.scrollbar.setInteractive({ cursor: "grab" });
    this.scrollbar.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.maxScroll <= 0) return;
      const trackHeight = this.visibleHeight - (this.scrollbar?.height ?? 0);
      if (trackHeight <= 0) return;
      this.dragging = true;
      this.dragStartY = pointer.worldY ?? pointer.y;
      this.scrollStart = this.scroll;
      this.scene.input.setDefaultCursor("grabbing");
    });

    this.wheelHandler = (pointer, _objects, _dx, dy) => {
      if (!this.list) return;
      const posX = pointer.worldX ?? pointer.x;
      const posY = pointer.worldY ?? pointer.y;

      const bounds = new Phaser.Geom.Rectangle(
        scene.scale.width - safeMargin - ROSTER_WIDTH,
        safeMargin,
        ROSTER_WIDTH,
        scene.scale.height - safeMargin * 2
      );
      if (!bounds.contains(posX, posY)) return;

      if (this.maxScroll > 0) {
        this.scroll = clamp(this.scroll - dy * 0.5, -this.maxScroll, 0);
        this.updateScrollPosition();
      }
    };
    scene.input.on("wheel", this.wheelHandler, this);

    this.visibleHeight =
      scene.scale.height - safeMargin * 2 - PANEL_PADDING_BOTTOM;
  }

  update(state: RosterPanelState) {
    this.state = state;
    this.updateHeader();
    this.populate();
  }

  handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.dragging || this.maxScroll <= 0 || !this.scrollbar) return;
    const trackHeight = this.visibleHeight - this.scrollbar.height;
    if (trackHeight <= 0) return;
    const pointerY = pointer.worldY ?? pointer.y;
    const delta = pointerY - this.dragStartY;
    const startProgress =
      this.maxScroll === 0 ? 0 : this.scrollStart / -this.maxScroll;
    const progress = Phaser.Math.Clamp(
      startProgress + delta / trackHeight,
      0,
      1
    );
    this.scroll = -this.maxScroll * progress;
    this.updateScrollPosition();
  }

  handlePointerUp() {
    if (!this.dragging) return;
    this.dragging = false;
    this.scene.input.setDefaultCursor("default");
  }

  destroy() {
    if (this.wheelHandler) {
      this.scene.input.off("wheel", this.wheelHandler, this);
      this.wheelHandler = undefined;
    }
    this.panel?.destroy();
    this.panel = undefined;
    this.maskRect?.destroy();
    this.maskRect = undefined;
    this.mask?.destroy();
    this.mask = undefined;
    this.list = undefined;
    this.scrollbar = undefined;
    this.header = undefined;
    this.detail = undefined;
  }

  private updateHeader() {
    if (!this.header) return;
    const count = this.state.walletAddress ? this.state.heroes.length : 0;
    this.header.setText(`Hero Roster (${count}/${this.maxHeroes})`);
  }

  private populate() {
    if (!this.list) return;
    this.list.removeAll(true);
    this.detail?.destroy();
    this.detail = undefined;

    const {
      walletAddress,
      heroesLoading,
      heroLoadError,
      heroes,
      expandedHeroId,
    } = this.state;

    const visibleHeight =
      this.scene.scale.height - this.safeMargin * 2 - PANEL_PADDING_BOTTOM;
    this.visibleHeight = visibleHeight;

    const showMessage = (text: string, color = "#c1c6db") => {
      const message = this.scene.add
        .text((ROSTER_WIDTH - 48) / 2, 12, text, {
          ...UI_FONT.body,
          color,
          align: "center",
          wordWrap: { width: ROSTER_WIDTH - 48 },
        })
        .setOrigin(0.5, 0);
      this.list?.add(message);
      this.maxScroll = 0;
      this.scroll = 0;
      this.updateScrollPosition();
    };

    if (!walletAddress) {
      showMessage("Connect your wallet to view on-chain heroes.", "#9fa6c0");
      return;
    }

    if (heroesLoading) {
      showMessage("Loading heroes from the chain...", "#9fa6c0");
      return;
    }

    if (heroLoadError) {
      showMessage(`Unable to load heroes: ${heroLoadError}`, "#ff8a8a");
      return;
    }

    if (!heroes.length) {
      showMessage(
        "No heroes minted yet. Summon allies to fill your roster.",
        "#9fa6c0"
      );
      return;
    }

    const rowHeight = 84;
    const gap = 10;
    let offsetY = 0;
    const heroPositions = new Map<number, number>();

    heroes.forEach((hero) => {
      const row = this.createRow(hero);
      row.y = offsetY;
      this.list?.add(row);
      heroPositions.set(hero.id, offsetY);
      offsetY += rowHeight + gap;
    });

    this.maxScroll = Math.max(0, offsetY - visibleHeight);
    this.scroll = clamp(this.scroll, -this.maxScroll, 0);
    this.updateScrollPosition();

    if (expandedHeroId !== undefined) {
      const hero = heroes.find((h) => h.id === expandedHeroId);
      if (hero) {
        const overlay = this.createDetail(hero);
        const baseY = (heroPositions.get(hero.id) ?? 0) + this.scroll;
        overlay.setPosition(
          12,
          clamp(
            baseY,
            PANEL_PADDING_TOP,
            visibleHeight - 200 + PANEL_PADDING_TOP
          )
        );
        if (this.mask) {
          overlay.setMask(this.mask);
        }
        this.panel?.add(overlay);
        this.detail = overlay;
      }
    }
  }

  private createRow(hero: ChainHero) {
    const container = this.scene.add.container(0, 0);
    const width = ROSTER_WIDTH - 48;

    // Check if hero is active in an adventure
    const lockStatus = this.state.heroLockStatuses?.get(hero.account);
    const isActive = lockStatus?.isActive ?? false;

    const bg = this.scene.add.rectangle(0, 0, width, 84, 0x232737).setOrigin(0);

    // If hero is active, add glowing red border
    if (isActive) {
      bg.setStrokeStyle(2, 0xff4444, 1);

      // Add a pulsing glow effect
      this.scene.tweens.add({
        targets: bg,
        alpha: { from: 1, to: 0.7 },
        duration: 1000,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    } else {
      bg.setStrokeStyle(1, 0x3a4052, 1);
    }

    container.add(bg);

    bg.setInteractive({ cursor: "pointer" })
      .on("pointerover", () => {
        if (!isActive) {
          bg.setFillStyle(0x2a3043);
        }
      })
      .on("pointerout", () => {
        if (!isActive) {
          bg.setFillStyle(0x232737);
        }
      })
      .on("pointerdown", () => {
        const isExpanded = this.state.expandedHeroId === hero.id;
        this.onHeroToggle(isExpanded ? undefined : hero.id);
      });

    container.add(
      this.scene.add
        .text(12, 10, `Hero #${hero.id}`, UI_FONT.body)
        .setOrigin(0, 0)
    );
    container.add(
      this.scene.add
        .text(width - 12, 10, getHeroTypeLabel(hero.heroType), {
          ...UI_FONT.caption,
          color: "#9fa6c0",
          align: "right",
        })
        .setOrigin(1, 0)
    );
    container.add(
      this.scene.add
        .text(12, 30, `Level ${hero.level} • XP ${hero.experience}`, {
          ...UI_FONT.caption,
          color: "#8fb0ff",
        })
        .setOrigin(0, 0)
    );

    const hpRatio =
      hero.maxHp > 0 ? Phaser.Math.Clamp(hero.currentHp / hero.maxHp, 0, 1) : 0;
    const hpBarBg = this.scene.add
      .rectangle(12, 50, width - 24, 6, 0x1a1d29)
      .setOrigin(0, 0);
    container.add(hpBarBg);
    container.add(
      this.scene.add
        .rectangle(12, 50, (width - 24) * hpRatio, 6, 0x68da87)
        .setOrigin(0, 0)
    );
    container.add(
      this.scene.add
        .text(12, 58, `HP ${hero.currentHp} / ${hero.maxHp}`, {
          ...UI_FONT.caption,
          color: "#9cbcaa",
        })
        .setOrigin(0, 0)
    );
    container.add(
      this.scene.add
        .text(width - 12, 58, formatHeroRowStats(hero), {
          ...UI_FONT.caption,
          color: "#9fa6c0",
          align: "right",
        })
        .setOrigin(1, 0)
    );
    return container;
  }

  private createDetail(hero: ChainHero) {
    const width = ROSTER_WIDTH - 48;
    const detail = this.scene.add.container(12, 0);
    const bg = this.scene.add
      .rectangle(0, 0, width, 200, 0x1f2432)
      .setOrigin(0);
    bg.setStrokeStyle(2, 0x47607f, 1);
    detail.add(bg);

    let cursorY = 10;

    const addLine = (
      text: string,
      style: Phaser.Types.GameObjects.Text.TextStyle,
      spacing = 6
    ) => {
      const label = this.scene.add
        .text(12, cursorY, text, style)
        .setOrigin(0, 0);
      detail.add(label);
      cursorY += label.height + spacing;
      return label;
    };

    addLine(
      `Hero #${hero.id} — ${getHeroTypeLabel(hero.heroType)}`,
      { ...UI_FONT.body, color: "#f4f6ff" },
      8
    );

    addLine(`Level ${hero.level} • XP ${hero.experience}`, {
      ...UI_FONT.caption,
      color: "#b9c6dd",
    });

    addLine(`HP ${hero.currentHp} / ${hero.maxHp}`, {
      ...UI_FONT.caption,
      color: "#b9c6dd",
    });
    addLine(`Attack ${hero.attack} • Defense ${hero.defense}`, {
      ...UI_FONT.caption,
      color: "#b9c6dd",
    });
    addLine(`Magic ${hero.magic} • Resistance ${hero.resistance}`, {
      ...UI_FONT.caption,
      color: "#b9c6dd",
    });
    addLine(`Speed ${hero.speed} • Luck ${hero.luck}`, {
      ...UI_FONT.caption,
      color: "#b9c6dd",
    });

    addLine(`Status Effects: ${hero.statusEffects}`, {
      ...UI_FONT.caption,
      color: "#94c7ff",
    });

    const skills =
      hero.skills
        .map((skill) => skill.name || `Skill ${skill.id}`)
        .join(", ") || "Unrevealed";
    addLine(`Skills: ${skills}`, {
      ...UI_FONT.caption,
      color: "#c1c6db",
      wordWrap: { width: width - 24 },
    });

    const positiveTraits = hero.positiveQuirks.length
      ? hero.positiveQuirks.map((id) => getQuirkLabel(id)).join(", ")
      : "None recorded.";
    addLine(`Positive Traits: ${positiveTraits}`, {
      ...UI_FONT.caption,
      color: "#8de9a3",
      wordWrap: { width: width - 24 },
    });

    const negativeTraits = hero.negativeQuirks.length
      ? hero.negativeQuirks.map((id) => getQuirkLabel(id)).join(", ")
      : "None recorded.";
    addLine(`Negative Traits: ${negativeTraits}`, {
      ...UI_FONT.caption,
      color: "#ff9d7d",
      wordWrap: { width: width - 24 },
    });

    addLine(
      `Soulbound: ${hero.isSoulbound ? "Yes" : "No"} • Burned: ${
        hero.isBurned ? "Yes" : "No"
      }`,
      {
        ...UI_FONT.caption,
        color: "#c1c6db",
      }
    );

    addLine(
      `Minted: ${formatHeroTimestamp(
        hero.mintTimestamp
      )} • Last Level Up: ${formatHeroTimestamp(hero.lastLevelUp)}`,
      {
        ...UI_FONT.caption,
        color: "#9fa6c0",
        wordWrap: { width: width - 24 },
      }
    );

    const finalHeight = cursorY + 12;
    bg.setSize(width, finalHeight);
    bg.setDisplaySize(width, finalHeight);

    return detail;
  }

  private updateScrollPosition() {
    if (!this.list || !this.scrollbar) return;
    this.list.y = PANEL_PADDING_TOP + this.scroll;
    if (this.maxScroll <= 0) {
      this.scrollbar.setVisible(false);
      return;
    }
    this.scrollbar.setVisible(true);
    const ratio = this.visibleHeight / (this.visibleHeight + this.maxScroll);
    const thumbHeight = Math.max(24, (this.visibleHeight - 8) * ratio);
    const progress = this.scroll / -this.maxScroll;
    const trackHeight = this.visibleHeight - thumbHeight;
    this.scrollbar.height = thumbHeight;
    this.scrollbar.y = PANEL_PADDING_TOP + progress * trackHeight;
  }
}

import Phaser from "phaser";

import { BUTTON_DIMENSIONS, UI_FONT, snap } from "../../../ui/uiConfig";
import {
  BUILDING_HEIGHT,
  BUILDING_WIDTH,
  BUILDINGS,
  BuildingKey,
  GRID_COLUMNS,
  GRID_ROWS,
  GOLD_PANEL_WIDTH,
  ROSTER_WIDTH,
  TOPBAR_GAP,
  TOPBAR_HEIGHT,
  TOPBAR_RIGHT_PADDING,
  WALLET_PANEL_HEIGHT,
  WALLET_PANEL_WIDTH,
} from "../constants";
import { TooltipManager } from "./TooltipManager";

type BackgroundResult = {
  centerX: number;
  centerY: number;
  radius: number;
};

type RenderBuildingsOptions = {
  scene: Phaser.Scene;
  safeMargin: number;
  worldLayer: Phaser.GameObjects.Container;
  tooltip: TooltipManager;
  onSelect: (key: BuildingKey) => void;
  bindHotkey: (event: string, handler: () => void) => void;
};

type TopBarOptions = {
  scene: Phaser.Scene;
  safeMargin: number;
  uiLayer: Phaser.GameObjects.Container;
};

type TopBarResult = {
  panel: Phaser.GameObjects.Container;
  walletPanel: Phaser.GameObjects.Container;
  goldPanel: Phaser.GameObjects.Container;
};

type EmbarkCTAOptions = {
  scene: Phaser.Scene;
  centerX: number;
  centerY: number;
  uiLayer: Phaser.GameObjects.Container;
  createButton: (
    x: number,
    y: number,
    width: number,
    label: string,
    handler: () => void,
    enabled?: boolean
  ) => Phaser.GameObjects.Container;
  onEmbark: () => void;
};

export function renderBackground(
  scene: Phaser.Scene,
  safeMargin: number,
  worldLayer: Phaser.GameObjects.Container
): BackgroundResult {
  const width = scene.scale.width;
  const height = scene.scale.height;

  const bg = scene.add.graphics();
  bg.fillStyle(0x111319, 1);
  bg.fillRect(0, 0, width, height);
  worldLayer.add(bg);

  const worldRight = width - safeMargin - ROSTER_WIDTH - safeMargin;
  const plazaWidth = worldRight - safeMargin;
  const plazaHeight = height - safeMargin * 2;
  const plaza = scene.add.graphics();
  plaza.fillStyle(0x1a1f29, 1);
  plaza.fillRect(safeMargin, safeMargin, plazaWidth, plazaHeight);
  plaza.lineStyle(2, 0x2d3240, 1);
  plaza.strokeRect(safeMargin, safeMargin, plazaWidth, plazaHeight);

  plaza.lineStyle(1, 0x272d3a, 0.4);
  const tile = 24;
  for (let x = safeMargin + tile; x < safeMargin + plazaWidth; x += tile) {
    const px = snap(x);
    plaza.lineBetween(px, safeMargin, px, safeMargin + plazaHeight);
  }
  for (let y = safeMargin + tile; y < safeMargin + plazaHeight; y += tile) {
    const py = snap(y);
    plaza.lineBetween(safeMargin, py, safeMargin + plazaWidth, py);
  }

  const centerX = safeMargin + plazaWidth / 2;
  const centerY = safeMargin + plazaHeight / 2;
  plaza.fillStyle(0x242a38, 1);
  plaza.fillCircle(centerX, centerY, 120);
  plaza.lineStyle(2, 0x3b4254, 1);
  plaza.strokeCircle(centerX, centerY, 120);
  plaza.fillStyle(0x30394b, 1);
  plaza.fillCircle(centerX, centerY, 78);

  worldLayer.add(plaza);

  return { centerX, centerY, radius: 120 };
}

export function renderBuildings({
  scene,
  safeMargin,
  worldLayer,
  tooltip,
  onSelect,
  bindHotkey,
}: RenderBuildingsOptions) {
  const width = scene.scale.width;
  const height = scene.scale.height;
  const worldRight = width - safeMargin - ROSTER_WIDTH - safeMargin;
  const plazaWidth = worldRight - safeMargin;
  const plazaHeight = height - safeMargin * 2;

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
    const x = safeMargin + snap(def.col * (BUILDING_WIDTH + gapX));
    const y = snap(safeMargin + 64 + def.row * (BUILDING_HEIGHT + gapY));

    const container = scene.add.container(x, y);
    worldLayer.add(container);

    const base = scene.add
      .rectangle(0, 0, BUILDING_WIDTH, BUILDING_HEIGHT, 0x262c3b)
      .setOrigin(0);
    base.setStrokeStyle(2, 0x40485c, 1);
    container.add(base);

    const roof = scene.add.rectangle(
      BUILDING_WIDTH / 2,
      -16,
      BUILDING_WIDTH * 0.85,
      32,
      0x343c50
    );
    roof.setStrokeStyle(2, 0x4a5368, 1);
    container.add(roof);

    const label = scene.add
      .text(BUILDING_WIDTH / 2, 12, def.label, UI_FONT.heading)
      .setOrigin(0.5, 0);
    container.add(label);

    const caption = scene.add
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
        tooltip.show(
          def.label,
          def.caption,
          x + BUILDING_WIDTH / 2,
          y - 20
        );
      })
      .on("pointerout", () => {
        base.setFillStyle(0x262c3b);
        tooltip.hide();
      })
      .on("pointerdown", () => onSelect(def.key));

    bindHotkey(`keydown-${index + 1}`, () => onSelect(def.key));
  });
}

export function createTopBar({
  scene,
  safeMargin,
  uiLayer,
}: TopBarOptions): TopBarResult {
  const panel = scene.add.container(safeMargin, safeMargin - 6);
  uiLayer.add(panel);

  const topBarWidth = scene.scale.width - safeMargin * 2 - ROSTER_WIDTH - 24;
  const bg = scene.add
    .rectangle(0, 0, topBarWidth, TOPBAR_HEIGHT, 0x1b1f2b)
    .setOrigin(0);
  bg.setStrokeStyle(2, 0x343a4b, 1);
  panel.add(bg);

  const title = scene.add
    .text(16, 16, "Sanctum Town", UI_FONT.heading)
    .setOrigin(0, 0);
  panel.add(title);

  const walletX = Math.max(
    16,
    bg.width -
      TOPBAR_RIGHT_PADDING -
      GOLD_PANEL_WIDTH -
      TOPBAR_GAP -
      WALLET_PANEL_WIDTH
  );
  const walletY = Math.round((TOPBAR_HEIGHT - WALLET_PANEL_HEIGHT) / 2);
  const walletPanel = scene.add.container(walletX, walletY);
  panel.add(walletPanel);

  const goldY = Math.round((TOPBAR_HEIGHT - 24) / 2);
  const goldPanel = scene.add.container(bg.width - TOPBAR_RIGHT_PADDING, goldY);
  panel.add(goldPanel);

  return { panel, walletPanel, goldPanel };
}

export function renderEmbarkCTA({
  scene,
  centerX,
  centerY,
  uiLayer,
  createButton,
  onEmbark,
}: EmbarkCTAOptions) {
  const buttonWidth = 320;

  const panel = scene.add.container(centerX, centerY);
  panel.setDepth(15);
  uiLayer.add(panel);

  const btn = createButton(
    -buttonWidth / 2,
    -BUTTON_DIMENSIONS.height / 2,
    buttonWidth,
    "Embark Adventure",
    onEmbark
  );

  panel.add(btn);
  return panel;
}

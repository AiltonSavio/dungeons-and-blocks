import Phaser from "phaser";

import {
  BUTTON_DIMENSIONS,
  PANEL_COLORS,
  UI_FONT,
} from "../../../ui/uiConfig";

export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  label: string,
  handler: () => void,
  enabled = true
) {
  const container = scene.add.container(x, y);
  const rect = scene.add
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

  const text = scene.add
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

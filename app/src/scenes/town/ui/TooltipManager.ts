import Phaser from "phaser";

import { ROSTER_WIDTH } from "../constants";
import { UI_FONT } from "../../../ui/uiConfig";
import { snap } from "../../../ui/uiConfig";

export class TooltipManager {
  private tooltip?: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly safeMargin: number
  ) {}

  show(title: string, caption: string, x: number, y: number) {
    this.hide();

    const tooltip = this.scene.add.container(0, 0);
    const padding = 10;
    const contentWidth = 220;

    const textTitle = this.scene.add
      .text(0, 0, title, {
        ...UI_FONT.body,
        color: "#f4f6ff",
      })
      .setOrigin(0, 0);
    tooltip.add(textTitle);

    const textBody = this.scene.add
      .text(0, textTitle.height + 4, caption, {
        ...UI_FONT.caption,
        color: "#c4c9dc",
        wordWrap: { width: contentWidth },
      })
      .setOrigin(0, 0);
    tooltip.add(textBody);

    const width = Math.max(textTitle.width, contentWidth) + padding * 2;
    const height = textTitle.height + textBody.height + padding * 2;

    const bg = this.scene.add
      .rectangle(0, 0, width, height, 0x1e2332, 0.95)
      .setOrigin(0);
    bg.setStrokeStyle(1, 0x3c455a, 1);
    tooltip.addAt(bg, 0);

    let tx = snap(x - width / 2);
    let ty = snap(y - height - 12);
    if (tx < this.safeMargin) tx = this.safeMargin;
    if (tx + width > this.scene.scale.width - this.safeMargin - ROSTER_WIDTH) {
      tx = this.scene.scale.width - this.safeMargin - ROSTER_WIDTH - width;
    }
    if (ty < this.safeMargin) ty = y + 16;

    tooltip.setPosition(tx, ty);
    tooltip.setDepth(50);
    this.layer.add(tooltip);
    this.tooltip = tooltip;
  }

  hide() {
    this.tooltip?.destroy();
    this.tooltip = undefined;
  }
}

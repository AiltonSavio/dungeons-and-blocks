import type Phaser from "phaser";
import { HERO_KEY_TO_CLASS, type HeroClassKey } from "../content/units";
import type { RunState } from "../state/runState";

export class StressPanel {
  private readonly scene: Phaser.Scene;
  private readonly run: RunState;
  private readonly container: Phaser.GameObjects.Container;
  private readonly entries: Map<
    HeroClassKey,
    {
      bar: Phaser.GameObjects.Rectangle;
      frame: Phaser.GameObjects.Rectangle;
      text: Phaser.GameObjects.Text;
    }
  > = new Map();

  constructor(
    scene: Phaser.Scene,
    run: RunState,
    parentLayer?: Phaser.GameObjects.Layer
  ) {
    this.scene = scene;
    this.run = run;
    this.container = scene.add.container(20, 80).setDepth(1600);
    this.container.setScrollFactor(0);
    if (parentLayer) parentLayer.add(this.container);
    this.build();

    scene.scale.on("resize", this.onResize);
  }

  destroy() {
    this.scene.scale.off("resize", this.onResize);
    this.container.destroy(true);
    this.entries.clear();
  }

  private build() {
    const rows = this.run.partyStress.length;
    const rowHeight = 22;
    const padding = 6;

    for (let i = 0; i < rows; i++) {
      const { cls } = this.run.partyStress[i];
      const y = i * (rowHeight + padding);
      const frame = this.scene.add
        .rectangle(0, y, 140, rowHeight, 0x10131b, 0.8)
        .setOrigin(0, 0.5)
        .setStrokeStyle(1, 0x262a36, 1);
      const bar = this.scene.add
        .rectangle(4, y, 132, rowHeight - 8, 0x66e28a, 1)
        .setOrigin(0, 0.5);
      const label = HERO_KEY_TO_CLASS[cls] ?? cls;
      const text = this.scene.add
        .text(6, y - 10, label, {
          fontFamily: "ui-sans-serif, system-ui",
          fontSize: "10px",
          color: "#c7d0e0",
        })
        .setOrigin(0, 0);

      this.container.add([frame, bar, text]);
      this.entries.set(cls, { bar, frame, text });
    }

    this.refresh();
  }

  refresh() {
    for (const entry of this.run.partyStress) {
      const ui = this.entries.get(entry.cls);
      if (!ui) continue;
      const pct = entry.stress / 200;
      const clamped = Math.max(0, Math.min(1, pct));
      const barWidth = 132 * clamped;
      ui.bar.width = Math.max(4, barWidth);
      const color =
        clamped > 0.75 ? 0xff6b6b : clamped > 0.4 ? 0xf5d259 : 0x66e28a;
      ui.bar.fillColor = color;
      const label = HERO_KEY_TO_CLASS[entry.cls] ?? entry.cls;
      ui.text.setText(`${label}  ${Math.round(entry.stress)}`);
    }
  }

  private onResize = () => {
    this.container.setPosition(20, 80);
  };
}

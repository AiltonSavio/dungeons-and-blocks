import Phaser from "phaser";
import type { Battler } from "./state";

type HeroRow = {
  row: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  hpBack: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  apPips: Phaser.GameObjects.Rectangle[];
  who: Battler;
};

export class CombatHud {
  private readonly disposers: Array<() => void> = [];

  private turnHud!: Phaser.GameObjects.Container;
  private turnHudIcons: Phaser.GameObjects.Sprite[] = [];
  private turnHudHighlight?: Phaser.GameObjects.Rectangle;

  private heroHud!: Phaser.GameObjects.Container;
  private heroRows: HeroRow[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  initialize(battlers: Battler[]): void {
    this.turnHud = this.scene.add
      .container(this.scene.scale.width / 2, 28)
      .setDepth(200);

    this.heroHud = this.scene.add.container(16, 16).setDepth(300);
    this.buildHeroRows(battlers);

    const onResize = () => {
      this.heroHud.setPosition(16, 16);
      this.turnHud.setPosition(this.scene.scale.width / 2, 28);
    };
    this.scene.scale.on("resize", onResize);
    this.disposers.push(() => this.scene.scale.off("resize", onResize));
  }

  renderTurnOrder(order: Battler[], currentIx: number): void {
    this.turnHud.removeAll(true);
    this.turnHudIcons = [];
    this.turnHudHighlight = undefined;

    if (order.length === 0) return;

    const gap = 60;
    const scale = 0.825;
    const startX = -((order.length - 1) * gap) / 2;

    const panelW = order.length * gap + 18;
    const panel = this.scene.add
      .rectangle(0, 0, panelW, 50, 0x0f1117, 0.75)
      .setStrokeStyle(2, 0x2b2f3b, 0.9)
      .setDepth(0);
    this.turnHud.add(panel);

    this.turnHudHighlight = this.scene.add
      .rectangle(0, 0, 42, 42, 0xffffff, 0)
      .setStrokeStyle(2, 0xffe28a, 1)
      .setDepth(2);
    this.turnHud.add(this.turnHudHighlight);

    order.forEach((b, i) => {
      const x = startX + i * gap;
      const spr = this.scene.add
        .sprite(x, 0, b.idleKey, 0)
        .setOrigin(0.5)
        .setScale(scale)
        .setDepth(1)
        .setFlipX(false)
        .setAlpha(i === currentIx ? 1 : 0.55);

      this.turnHud.add(spr);
      this.turnHudIcons.push(spr);
    });

    const curX = startX + currentIx * gap;
    this.turnHudHighlight?.setPosition(curX, 0);
  }

  refreshHeroHud(): void {
    this.heroRows.forEach(({ hpBack, hpFill, apPips, who }) => {
      const w = hpBack.width as number;
      const hpPct = Phaser.Math.Clamp(who.hp / who.maxHp, 0, 1);
      hpFill.width = Math.max(0, Math.floor(w * hpPct));

      const col = hpPct > 0.66 ? 0x66e28a : hpPct > 0.33 ? 0xf5d259 : 0xff6b6b;
      hpFill.fillColor = col;

      apPips.forEach((p, i) => {
        p.fillColor = i < who.ap ? 0x9ad67a : 0x3a414f;
      });
    });
  }

  destroy(): void {
    this.disposers.forEach((fn) => {
      try {
        fn();
      } catch {
        // noop
      }
    });
    this.disposers.length = 0;

    this.turnHud?.destroy(true);
    this.turnHudIcons.forEach((icon) => icon.destroy());
    this.turnHudIcons = [];
    this.turnHudHighlight?.destroy();
    this.turnHudHighlight = undefined;

    this.heroHud?.destroy(true);
    this.heroRows = [];
  }

  private buildHeroRows(battlers: Battler[]): void {
    this.heroRows.forEach(({ row }) => row.destroy());
    this.heroRows = [];

    const heroes = battlers
      .filter((b) => b.side === "heroes")
      .sort((a, b) => a.ix - b.ix);

    const ROW_H = 44;
    const HP_W = 160;
    const HP_H = 10;
    const PIP = 10;
    const GAP = 6;

    heroes.forEach((h, i) => {
      const row = this.scene.add.container(0, i * ROW_H);
      const name = this.scene.add
        .text(0, 0, h.assets.name || `Hero ${i + 1}`, {
          fontFamily: "ui-sans-serif, system-ui",
          fontSize: "14px",
          color: "#e7e7ea",
        })
        .setOrigin(0, 0.5);
      name.y = 10;

      const hpBack = this.scene.add
        .rectangle(0, 24, HP_W, HP_H, 0x1a1e26, 1)
        .setOrigin(0, 0.5)
        .setStrokeStyle(1, 0x2b2f3b, 1);
      const hpFill = this.scene.add
        .rectangle(0, 24, HP_W, HP_H, 0x66e28a, 1)
        .setOrigin(0, 0.5);

      const apPips: Phaser.GameObjects.Rectangle[] = [];
      for (let k = 0; k < h.maxAp; k++) {
        const pip = this.scene.add
          .rectangle(k * (PIP + GAP), 36, PIP, PIP, 0x9ad67a, 1)
          .setOrigin(0, 0.5)
          .setStrokeStyle(1, 0x2b2f3b, 1);
        apPips.push(pip);
        row.add(pip);
      }

      row.add([name, hpBack, hpFill]);
      this.heroHud.add(row);
      this.heroRows.push({ row, name, hpBack, hpFill, apPips, who: h });
    });
  }
}

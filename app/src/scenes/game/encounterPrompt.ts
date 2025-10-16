import Phaser from "phaser";
import type { UnitAssets } from "../../combat/types";

type EncounterPromptOptions = {
  scene: Phaser.Scene;
  uiLayer: Phaser.GameObjects.Layer;
  durationSeconds: number;
  torchPercent: () => number;
  enemies: UnitAssets[];
  onConfirm: () => void;
  onFlee: () => void;
};

export class EncounterPrompt {
  private readonly scene: Phaser.Scene;
  private readonly uiLayer: Phaser.GameObjects.Layer;
  private readonly duration: number;
  private readonly torchPercent: () => number;
  private readonly enemies: UnitAssets[];
  private readonly onConfirm: () => void;
  private readonly onFlee: () => void;

  private overlay?: Phaser.GameObjects.Rectangle;
  private panel?: Phaser.GameObjects.Container;
  private countdownText?: Phaser.GameObjects.Text;

  // new: sprite row container (we build row of animated enemy previews)
  private enemyRow?: Phaser.GameObjects.Container;
  private enemySprites: Phaser.GameObjects.Sprite[] = [];
  private placeholderSprites: Phaser.GameObjects.Container[] = [];
  private footerLayout?: {
    buttons: Phaser.GameObjects.Container;
    cardHeight: number;
    buttonHeight: number;
    topMargin: number;
    bottomMargin: number;
  };

  private timer?: Phaser.Time.TimerEvent;
  private secondsRemaining = 0;
  private active = false;

  // keys for our local preview animations
  private makeIdleKey = (ix: number) => `enc:${ix}:idle`;
  private knightIdleKey = `enc:knight:idle`; // placeholder sheet

  constructor(opts: EncounterPromptOptions) {
    this.scene = opts.scene;
    this.uiLayer = opts.uiLayer;
    this.duration = Math.max(1, opts.durationSeconds);
    this.torchPercent = opts.torchPercent;
    this.enemies = opts.enemies;
    this.onConfirm = opts.onConfirm;
    this.onFlee = opts.onFlee;
  }

  show(width: number, height: number): void {
    this.destroy();

    // 1) Solid black backdrop for dramatic contrast
    this.overlay = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.9)
      .setOrigin(0)
      .setDepth(1800)
      .setInteractive();
    this.uiLayer.add(this.overlay);

    // 2) Main panel (centered)
    this.panel = this.scene.add.container(width / 2, height / 2).setDepth(1810);
    this.uiLayer.add(this.panel);

    const cardWidth = Math.min(720, width * 0.9);
    const cardHeight = 360;

    const card = this.scene.add
      .rectangle(0, 0, cardWidth, cardHeight, 0x0b0c10, 0.95)
      .setStrokeStyle(2, 0x2d3343, 1)
      .setOrigin(0.5);
    const title = this.scene.add
      .text(0, -cardHeight * 0.5 + 30, "Enemies Spotted", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "26px",
        color: "#f4f6fd",
      })
      .setOrigin(0.5, 0.5);

    // 3) Enemy sprite row (animated)
    this.enemyRow = this.scene.add.container(0, -16);
    this.panel.add([card, title, this.enemyRow]);

    // Build row as soon as assets are available
    this.prepareEnemySprites(() => {
      this.renderEnemyRow(cardWidth);
    });

    // 4) Countdown + buttons
    this.countdownText = this.scene.add
      .text(0, 0, "", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "16px",
        color: "#9db4d4",
      })
      .setOrigin(0.5);
    const buttons = this.scene.add.container(0, 0);

    const enter = this.buildButton("Enter Combat", 0x29a36a, () =>
      this.handleConfirm()
    ).setPosition(-120, 0);

    const flee = this.buildButton("Flee", 0xaa3b3b, () =>
      this.handleFlee()
    ).setPosition(120, 0);

    buttons.add([enter, flee]);
    this.panel.add([this.countdownText, buttons]);

    const buttonHeight = 46;
    const topMargin = 3;
    const bottomMargin = 6;
    this.footerLayout = {
      buttons,
      cardHeight,
      buttonHeight,
      topMargin,
      bottomMargin,
    };
    this.repositionFooter();

    // 5) Timer
    this.secondsRemaining = this.duration;
    this.updateCountdownLabel();
    this.startTimer();

    this.active = true;
  }

  handleResize(width: number, height: number): void {
    if (!this.active) return;
    this.overlay?.setSize(width, height).setPosition(0, 0);
    this.panel?.setPosition(width / 2, height / 2);
    this.repositionFooter();
  }

  destroy(): void {
    this.stopTimer();

    // clean sprites/containers
    this.enemySprites.forEach((s) => s.destroy());
    this.enemySprites = [];
    this.placeholderSprites.forEach((c) => c.destroy());
    this.placeholderSprites = [];

    this.enemyRow?.destroy();
    this.enemyRow = undefined;

    this.overlay?.destroy();
    this.overlay = undefined;

    this.panel?.destroy(true);
    this.panel = undefined;

    this.countdownText = undefined;
    this.footerLayout = undefined;

    this.active = false;
  }

  // ---------------- internals ----------------

  private buildButton(
    label: string,
    fill: number,
    handler: () => void
  ): Phaser.GameObjects.Container {
    const rect = this.scene.add
      .rectangle(0, 0, 210, 46, fill, 1)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0xffffff, 0.2)
      .setInteractive({ useHandCursor: true });
    rect.on("pointerover", () => rect.setFillStyle(fill, 0.85));
    rect.on("pointerout", () => rect.setFillStyle(fill, 1));
    rect.on("pointerdown", handler);

    const text = this.scene.add
      .text(0, 0, label, {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "18px",
        color: "#f4f6fd",
      })
      .setOrigin(0.5);

    return this.scene.add.container(0, 0, [rect, text]);
  }

  /**
   * Ensure enemy idle sheets (and knight placeholder) are in cache.
   * We only load what's missing, then invoke `done()`.
   */
  private prepareEnemySprites(done: () => void) {
    const loader = this.scene.load;
    let toLoad = 0;

    // Knight placeholder: use heroes/Knight idle as our outline base.
    // We'll tint & faux-outline it when hidden.
    const knightPath = "assets/heroes/Knight/Knight/Knight-Idle.png";
    if (!this.scene.textures.exists(this.knightIdleKey)) {
      loader.spritesheet(this.knightIdleKey, knightPath, {
        frameWidth: 100,
        frameHeight: 100,
      });
      toLoad++;
    }

    // For each enemy, request its idle sheet if missing
    this.enemies.forEach((e, i) => {
      const key = this.makeIdleKey(i);
      const file = e.sheets.idle;
      if (!file) return; // sanity
      if (!this.scene.textures.exists(key)) {
        loader.spritesheet(key, `${e.base}/${file}`, {
          frameWidth: 100,
          frameHeight: 100,
        });
        toLoad++;
      }
    });

    if (toLoad === 0) {
      done();
      return;
    }

    loader.once(Phaser.Loader.Events.COMPLETE, done);
    loader.start();
  }

  /** Build the animated row of enemy previews according to torch visibility. */
  private renderEnemyRow(maxWidth: number) {
    if (!this.enemyRow) return;

    // clear previous row (if re-render on resize/torch change)
    this.enemyRow.removeAll(true);
    this.enemySprites.forEach((s) => s.destroy());
    this.enemySprites = [];
    this.placeholderSprites.forEach((c) => c.destroy());
    this.placeholderSprites = [];

    const torch = this.torchPercent();
    const visibleCount =
      torch >= 66
        ? this.enemies.length
        : torch >= 33
        ? Math.min(2, this.enemies.length)
        : 0;

    // layout
    const n = this.enemies.length;
    const gap = Math.min(
      140,
      Math.max(96, Math.floor((maxWidth - 60) / Math.max(n, 1)))
    );
    const startX = -((n - 1) * gap) / 2;
    const y = 40;

    // Build entries
    for (let i = 0; i < n; i++) {
      const x = startX + i * gap;
      if (i < visibleCount) {
        // visible enemy sprite (idle)
        const idleKey = this.makeIdleKey(i);
        const spr = this.scene.add
          .sprite(x, y, idleKey, 0)
          .setOrigin(0.5)
          .setDepth(2);
        // bigger to read nicely in the panel
        spr.setScale(1.1);

        // face enemies left in preview (mirrors combat preview you had)
        spr.setFlipX(true);

        // create a local looping anim if missing
        if (!this.scene.anims.exists(idleKey)) {
          const frames =
            this.scene.textures.get(idleKey).getFrameNames().length || 6;
          this.scene.anims.create({
            key: idleKey,
            frames: this.scene.anims.generateFrameNumbers(idleKey, {
              start: 0,
              end: frames - 1,
            }),
            frameRate: 8,
            repeat: -1,
          });
        }
        spr.play(idleKey);
        this.enemyRow.add(spr);
        this.enemySprites.push(spr);

        // subtle hover pulse
        this.scene.tweens.add({
          targets: spr,
          scale: 1.14,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "sine.inout",
        });
      } else {
        // HIDDEN → outlined Knight placeholder (stylized)
        const ph = this.buildKnightOutline(x, y);
        this.enemyRow.add(ph);
        this.placeholderSprites.push(ph);
      }
    }

    // small caption under the row
    const caption =
      visibleCount === n
        ? "Your torch reveals all enemies."
        : visibleCount > 0
        ? "Only some shapes step out of the darkness…"
        : "The shapes are unknown in the dark…";
    const label = this.scene.add
      .text(0, y + 78, caption, {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "14px",
        color: "#9db4d4",
      })
      .setOrigin(0.5);
    this.enemyRow.add(label);
  }

  /**
   * Build a stylized “outlined Knight” placeholder using the Knight idle sheet.
   * We fake an outline by stacking tinted copies with tiny offsets.
   */
  private buildKnightOutline(
    x: number,
    y: number
  ): Phaser.GameObjects.Container {
    const c = this.scene.add.container(x, y);

    const shadow = this.scene.add
      .ellipse(0, 42, 68, 16, 0x000000, 0.35)
      .setStrokeStyle(1, 0x000000, 0.2)
      .setOrigin(0.5);
    c.add(shadow);

    if (!this.scene.anims.exists(this.knightIdleKey)) {
      const frames =
        this.scene.textures.get(this.knightIdleKey).getFrameNames().length || 6;
      this.scene.anims.create({
        key: this.knightIdleKey,
        frames: this.scene.anims.generateFrameNumbers(this.knightIdleKey, {
          start: 0,
          end: frames - 1,
        }),
        frameRate: 8,
        repeat: -1,
      });
    }

    const silhouette = this.scene.add
      .sprite(0, 0, this.knightIdleKey, 0)
      .setOrigin(0.5)
      .setScale(1.05)
      .setFlipX(true)
      .setTintFill(0x6d7388);
    silhouette.play(this.knightIdleKey);
    c.add(silhouette);

    const txt = this.scene.add
      .text(0, 52, "Unknown", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "12px",
        color: "#6d7388",
      })
      .setOrigin(0.5);
    c.add(txt);

    return c;
  }

  private repositionFooter() {
    if (!this.countdownText || !this.footerLayout) return;
    const { buttons, cardHeight, buttonHeight } = this.footerLayout;

    const marginTop = 3;
    const marginBottom = 6;

    const buttonsY = cardHeight * 0.5 - marginBottom - buttonHeight / 2;
    buttons.setY(buttonsY);

    const countdownHeight = this.countdownText.height || 0;
    const countdownY =
      buttonsY - buttonHeight / 2 - marginTop - countdownHeight / 2;

    this.countdownText.setY(countdownY);
  }

  private startTimer() {
    this.stopTimer();
    this.timer = this.scene.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (!this.active) return;
        this.secondsRemaining = Math.max(0, this.secondsRemaining - 1);
        this.updateCountdownLabel();
        if (this.secondsRemaining <= 0) {
          this.handleConfirm();
        }
      },
    });
  }

  private stopTimer() {
    if (this.timer) {
      this.timer.remove();
      this.timer = undefined;
    }
  }

  private updateCountdownLabel() {
    this.countdownText?.setText(
      `Auto-entering combat in ${this.secondsRemaining}s`
    );
    this.repositionFooter();
  }

  private handleConfirm() {
    if (!this.active) return;
    this.active = false;
    this.stopTimer();
    this.onConfirm();
  }

  private handleFlee() {
    if (!this.active) return;
    this.active = false;
    this.stopTimer();
    this.onFlee();
  }
}

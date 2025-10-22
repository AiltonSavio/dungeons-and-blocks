import Phaser from "phaser";
import type { CombatData, UnitAssets } from "../combat/types";
import type { Battler, Side, UIMode } from "./combat/state";
import { CombatHud } from "./combat/hud";
import { createBattler } from "./combat/battlerFactory";
import type { LootReward } from "../state/loot";
import type { CombatResolution } from "../state/combatEvents";
import type { ItemId } from "../state/items";
export type { CombatData, UnitAssets } from "../combat/types";

/** Utility: count frames of a loaded spritesheet by asking the texture. */
function sheetFrames(scene: Phaser.Scene, key: string): number {
  const tex = scene.textures.get(key);
  // for spritesheets, frame names are "0","1",... we can count them:
  return tex.getFrameNames().length;
}

export default class Combat extends Phaser.Scene {
  constructor() {
    super("Combat");
  }

  private dataIn!: CombatData;
  private battlers: Battler[] = [];
  private turnIndex = 0;
  private inAction = false;

  // layout
  private mid!: Phaser.Math.Vector2;
  private heroSlots!: Phaser.Math.Vector2[];
  private enemySlots!: Phaser.Math.Vector2[];

  private awaitingPlayer = false;
  private currentHero?: Battler;
  private selectedEnemyIx = 0;
  private targetMarker?: Phaser.GameObjects.Arc;
  private targetDisposers: Array<() => void> = [];
  private cleanupFns: Array<() => void> = [];

  private hud!: CombatHud;

  private uiMode: UIMode = "idle";
  private actionCtx: {
    type: "attack" | "skill1" | "skill2" | "defend" | null;
    source?: Battler;
    targetSide?: Side; // "enemies" for attack/skills, "heroes" for Priest heal
  } = { type: null };

  // Menus
  private mainMenu?: Phaser.GameObjects.Container;
  private skillsMenu?: Phaser.GameObjects.Container;

  // Defend state
  private defended: Set<Battler> = new Set();

  private pendingIsHeal = false;

  init(data: CombatData) {
    this.dataIn = data;
  }

  preload() {
    // Load only needed sheets for this encounter.
    const loadUnit = (u: UnitAssets, prefix: string) => {
      const add = (key: string, file: string | undefined) => {
        if (!file) return;
        this.load.spritesheet(`${prefix}:${key}`, `${u.base}/${file}`, {
          frameWidth: 100,
          frameHeight: 100,
        });
      };

      add("idle", u.sheets.idle);
      add("walk", u.sheets.walk);
      add("hurt", u.sheets.hurt);
      add("death", u.sheets.death);
      add("atk1", u.sheets.atk1);
      add("atk2", u.sheets.atk2);
      add("atk3", u.sheets.atk3);

      // VFX (optional)
      const addV = (k: string, file?: string) => {
        if (!file) return;
        this.load.spritesheet(`${prefix}:vfx:${k}`, `${u.base}/${file}`, {
          frameWidth: 100,
          frameHeight: 100,
        });
      };
      addV("atk1", u.vfx?.atk1);
      addV("atk2", u.vfx?.atk2);
      addV("atk3", u.vfx?.atk3);
    };

    this.dataIn.heroes.forEach((u, i) => loadUnit(u, `H${i}`));
    this.dataIn.enemies.forEach((u, i) => loadUnit(u, `E${i}`));
  }

  create() {
    this.cleanScene();
    this.cameras.main.setBackgroundColor(0x0b0c10);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanScene());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanScene());

    // Simple battleground: vignette-ish panel
    const W = this.scale.width;
    const H = this.scale.height;

    // world space (we use world camera directly)
    const bg = this.add
      .rectangle(W / 2, H / 2, W * 0.9, H * 0.75, 0x14161c, 1)
      .setStrokeStyle(2, 0x232730, 1);
    bg.setDepth(0);

    // layout: diagonal slots (front closer/bigger)
    this.mid = new Phaser.Math.Vector2(W / 2, H / 2 + 20);

    // Pull sides further apart & spread rows more
    const leftX = W * 0.26;
    const rightX = W * 0.74;
    const rowDY = 150;
    const rowDX = 45;

    // front row are indexes 0 and 1, back row 2 and 3
    this.heroSlots = [
      new Phaser.Math.Vector2(leftX - rowDX, this.mid.y + rowDY), // front-left
      new Phaser.Math.Vector2(leftX + rowDX * 0.4, this.mid.y + rowDY * 0.35), // front-right
      new Phaser.Math.Vector2(leftX - rowDX * 0.8, this.mid.y - rowDY * 0.2), // back-left
      new Phaser.Math.Vector2(leftX + rowDX * 0.15, this.mid.y - rowDY * 0.9), // back-right
    ];
    this.enemySlots = [
      new Phaser.Math.Vector2(rightX + rowDX * 0.2, this.mid.y + rowDY), // front-left (enemy)
      new Phaser.Math.Vector2(rightX - rowDX * 0.5, this.mid.y + rowDY * 0.35),
      new Phaser.Math.Vector2(rightX + rowDX * 0.9, this.mid.y - rowDY * 0.2),
      new Phaser.Math.Vector2(rightX - rowDX * 0.15, this.mid.y - rowDY * 0.9),
    ];

    this.dataIn.heroes.forEach((u, i) => {
      const slot = this.heroSlots[i];
      this.battlers.push(
        createBattler({
          scene: this,
          anims: this.anims,
          textures: this.textures,
          asset: u,
          side: "heroes",
          index: i,
          slot,
          countFrames: (key) => sheetFrames(this, key),
        })
      );
    });
    this.dataIn.enemies.forEach((u, i) => {
      const slot = this.enemySlots[i];
      this.battlers.push(
        createBattler({
          scene: this,
          anims: this.anims,
          textures: this.textures,
          asset: u,
          side: "enemies",
          index: i,
          slot,
          countFrames: (key) => sheetFrames(this, key),
        })
      );
    });

    // Target marker (a ring) placed over selected enemy
    this.targetMarker = this.add
      .circle(0, 0, 40)
      .setStrokeStyle(3, 0x9ad67a, 1)
      .setVisible(false)
      .setDepth(50);

    this.hud = new CombatHud(this);
    this.hud.initialize(this.battlers);
    this.hud.refreshHeroHud();

    this.hud.renderTurnOrder(this.computeOrder(), 0);
    this.time.delayedCall(150, () => this.nextTurn());

    const esc = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    if (esc) {
      const handler = () => this.handleEscape();
      esc.on("down", handler);
      this.cleanupFns.push(() => esc.off("down", handler));
    }
  }

  /** Simple round-robin: alive heroes then alive enemies. */
  private nextTurn() {
    if (this.inAction) return;

    const order = this.computeOrder();
    if (order.length === 0) return;

    const idx = this.turnIndex % order.length;

    // refresh HUD to reflect upcoming actor
    this.hud.renderTurnOrder(order, idx);

    const b = order[idx];
    this.takeAction(b);
    this.turnIndex++;
  }

  private liveEnemies(): Battler[] {
    return this.battlers
      .filter((b) => b.side === "enemies" && b.alive)
      .sort((a, b) => a.ix - b.ix);
  }

  private liveHeroes(): Battler[] {
    return this.battlers
      .filter((b) => b.side === "heroes" && b.alive)
      .sort((a, b) => a.ix - b.ix);
  }
  private setSelectedEnemy(ixAmongAlive: number) {
    const foes = this.liveEnemies();
    if (foes.length === 0) {
      this.targetMarker?.setVisible(false);
      return;
    }
    this.selectedEnemyIx =
      ((ixAmongAlive % foes.length) + foes.length) % foes.length;
    const tgt = foes[this.selectedEnemyIx];
    this.targetMarker
      ?.setPosition(tgt.sprite.x, tgt.sprite.y - 6)
      .setVisible(true);
  }

  private takeAction(b: Battler) {
    if (!b.alive) return this.nextTurn();

    this.defended.delete(b); // reset

    if (b.side === "heroes") {
      if (this.turnIndex % this.computeOrder().length === 0) {
        this.refillHeroAp(); // per full round
      }
      const foes = this.liveEnemies();
      if (foes.length === 0) return this.endCombat("heroes");

      // Step 1: move hero to center-left spot
      this.currentHero = b;
      this.awaitingPlayer = false;
      this.inAction = true; // lock other turns while tweening
      this.uiMode = "heroMoving";

      const toX = this.mid.x - 90; // slightly left of exact center
      const toY = this.mid.y + 6;
      this.tweens.add({
        targets: b.sprite,
        x: toX,
        y: toY,
        scale: b.baseScale * 1.15,
        duration: 220,
        ease: "sine.out",
        onComplete: () => {
          // Step 2: open the main menu
          this.openMainMenu(b);
        },
      });
      return;
    } else {
      // AI (unchanged): pick a random live hero and act
      const heroes = this.battlers.filter(
        (x) => x.side === "heroes" && x.alive
      );
      if (heroes.length === 0) return this.endCombat("enemies");
      const tgt = Phaser.Utils.Array.GetRandom(heroes);
      this.takeActionAgainst(b, tgt);
    }
  }

  private takeActionAgainst(b: Battler, tgt: Battler) {
    if (!b.alive) return this.nextTurn();
    this.inAction = true;

    const atkKey =
      b.atkKeys.length > 0
        ? Phaser.Utils.Array.GetRandom(b.atkKeys)
        : b.idleKey;

    const toX = this.mid.x + (b.side === "heroes" ? -60 : 60);
    const toY = this.mid.y + (b.side === "heroes" ? 12 : -12);
    const toScale = b.baseScale * 1.15;

    this.tweens.add({
      targets: b.sprite,
      x: toX,
      y: toY,
      scale: toScale,
      duration: 220,
      ease: "sine.out",
      onComplete: () => {
        const atkFrames = sheetFrames(this, atkKey);
        const atkDur = Math.max(200, Math.min(900, (atkFrames / 12) * 1000));
        b.sprite.play(atkKey);

        const vfxK = atkKey.endsWith(":atk1")
          ? "atk1"
          : atkKey.endsWith(":atk2")
          ? "atk2"
          : atkKey.endsWith(":atk3")
          ? "atk3"
          : undefined;

        this.time.delayedCall(Math.floor(atkDur * 0.45), () => {
          this.showHitVFX(b, tgt, vfxK);
          this.onHit(b, tgt);
        });

        this.time.delayedCall(atkDur, () => {
          this.tweens.add({
            targets: b.sprite,
            x: b.basePos.x,
            y: b.basePos.y,
            scale: b.baseScale,
            duration: 220,
            ease: "sine.in",
            onComplete: () => {
              if (this.anims.exists(b.idleKey)) b.sprite.play(b.idleKey, true);
              this.inAction = false;
              this.time.delayedCall(150, () => this.nextTurn());
            },
          });
        });
      },
    });
  }

  private openMainMenu(hero: Battler) {
    this.closeMenus();
    this.uiMode = "mainMenu";
    this.awaitingPlayer = true;
    this.inAction = false; // allow inputs
    this.actionCtx = { type: null, source: hero };

    const x = hero.sprite.x + 72,
      y = hero.sprite.y - 20;

    const items = [
      {
        label: "Attack",
        onSelect: () => {
          this.closeMenus();
          this.actionCtx = {
            type: "attack",
            source: hero,
            targetSide: "enemies",
          };
          this.beginTargeting("enemies");
        },
      },
      {
        label: "Skills",
        onSelect: () => this.openSkillsMenu(hero),
      },
      {
        label: "Item",
        onSelect: () => {
          this.cameras.main.flash(80, 60, 60, 60);
        },
      },
      {
        label: "Defend",
        onSelect: () => this.doDefend(hero),
      },
    ];
    this.mainMenu = this.createMenu(x, y, items);
  }

  private openSkillsMenu(hero: Battler) {
    // Skill costs: 2 and 3 AP
    this.closeSkills();
    this.uiMode = "skillsMenu";

    // Submenu offset a bit to the right of Skills row
    const x = (this.mainMenu?.x ?? hero.sprite.x) + 140;
    const y = (this.mainMenu?.y ?? hero.sprite.y) - 10;

    const items = [
      {
        label: "Skill 1  (2 AP)",
        onSelect: () => this.onSkillChoose(hero, 0),
      },
      {
        label: "Skill 2  (3 AP)",
        onSelect: () => this.onSkillChoose(hero, 1),
      },
      {
        label: "Back",
        onSelect: () => {
          this.closeSkills();
          this.uiMode = "mainMenu";
        },
      },
    ];
    this.skillsMenu = this.createMenu(x, y, items);
  }

  private onSkillChoose(hero: Battler, ix: number) {
    const cost = ix === 0 ? 2 : 3;
    if (hero.ap < cost) {
      this.cameras.main.shake(100, 0.004); // not enough AP
      return;
    }
    // Priest heal special-case: Skill 2 (your assets map: Priest atk3 is Heal)
    const isPriest = /priest/i.test(hero.assets.name);
    if (isPriest && ix === 1) {
      this.closeMenus();
      this.actionCtx = { type: "skill2", source: hero, targetSide: "heroes" };
      this.beginTargeting("heroes"); // green ring
    } else {
      this.closeMenus();
      this.actionCtx = {
        type: ix === 0 ? "skill1" : "skill2",
        source: hero,
        targetSide: "enemies",
      };
      this.beginTargeting("enemies"); // red ring
    }
  }

  private createMenu(
    x: number,
    y: number,
    items: { label: string; onSelect: () => void }[]
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(800);
    const w = 150;
    const lineH = 24;

    const panel = this.add
      .rectangle(0, 0, w, items.length * lineH + 12, 0x0f1117, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x2b2f3b, 1);
    c.add(panel);

    items.forEach((item, i) => {
      const text = this.add
        .text(8, 6 + i * lineH, item.label, {
          fontFamily: "ui-sans-serif, system-ui",
          fontSize: "14px",
          color: "#e7e7ea",
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      text.on("pointerover", () => text.setColor("#ffe28a"));
      text.on("pointerout", () => text.setColor("#e7e7ea"));
      text.on("pointerdown", () => item.onSelect());
      c.add(text);
    });

    return c;
  }

  private closeMenus() {
    this.mainMenu?.destroy();
    this.mainMenu = undefined;
    this.closeSkills();
    this.clearTargetingInteractions();
  }
  private closeSkills() {
    this.skillsMenu?.destroy();
    this.skillsMenu = undefined;
    if (this.uiMode === "skillsMenu") this.uiMode = "mainMenu";
  }

  private clearTargetingInteractions() {
    this.targetDisposers.forEach((fn) => fn());
    this.targetDisposers = [];
    this.targetMarker?.setVisible(false);
  }

  private handleEscape() {
    if (this.inAction) return;

    if (this.uiMode === "targeting") {
      this.clearTargetingInteractions();
      if (this.currentHero) this.openMainMenu(this.currentHero);
    } else if (this.uiMode === "skillsMenu") {
      this.closeSkills();
      if (this.currentHero) this.openMainMenu(this.currentHero);
    } else if (this.uiMode === "mainMenu") {
      this.cancelHeroTurn();
    }
  }

  private beginTargeting(side: Side) {
    this.clearTargetingInteractions();
    this.uiMode = "targeting";
    this.awaitingPlayer = true;
    this.inAction = false;

    const isEnemy = side === "enemies";
    const ringColor = isEnemy ? 0xff6b6b : 0x66e28a; // red enemies / green heroes
    this.targetMarker?.setStrokeStyle(3, ringColor, 1);

    const targets = isEnemy ? this.liveEnemies() : this.liveHeroes();
    if (targets.length === 0) {
      this.clearTargetingInteractions();
      this.uiMode = "mainMenu";
      return;
    }

    targets.forEach((b, idx) => {
      const onOver = () => {
        if (isEnemy) this.setSelectedEnemy(idx);
        else this.setSelectedHero(idx);
      };
      const onOut = () => {
        this.targetMarker?.setVisible(false);
      };
      const onDown = () => {
        if (isEnemy) this.setSelectedEnemy(idx);
        else this.setSelectedHero(idx);
        this.playerConfirm();
      };
      b.sprite.setInteractive({ useHandCursor: true });
      b.sprite.on("pointerover", onOver);
      b.sprite.on("pointerout", onOut);
      b.sprite.on("pointerdown", onDown);
      this.targetDisposers.push(() => {
        b.sprite.off("pointerover", onOver);
        b.sprite.off("pointerout", onOut);
        b.sprite.off("pointerdown", onDown);
        b.sprite.disableInteractive();
      });
    });
  }

  private setSelectedHero(ixAmongAlive: number) {
    const allies = this.liveHeroes();
    if (allies.length === 0) {
      this.targetMarker?.setVisible(false);
      return;
    }
    const ix = ((ixAmongAlive % allies.length) + allies.length) % allies.length;
    this.selectedEnemyIx = ix; // reuse same field for simplicity
    const tgt = allies[ix];
    this.targetMarker
      ?.setPosition(tgt.sprite.x, tgt.sprite.y - 6)
      .setVisible(true);
  }

  private playerConfirm() {
    // Confirm target only if targeting
    if (this.uiMode !== "targeting") return;
    const src = this.currentHero!;
    const choosingEnemies = this.actionCtx.targetSide === "enemies";

    let tgt: Battler | undefined;
    if (choosingEnemies) {
      const foes = this.liveEnemies();
      tgt = foes[this.selectedEnemyIx];
    } else {
      const allies = this.battlers
        .filter((b) => b.side === "heroes" && b.alive)
        .sort((a, b) => a.ix - b.ix);
      tgt = allies[this.selectedEnemyIx];
    }
    if (!src || !tgt) return;

    // costs
    const tp = this.actionCtx.type;
    if (tp === "attack") {
      // no AP cost
    } else if (tp === "skill1") {
      if (src.ap < 2) {
        this.cameras.main.shake(100, 0.004);
        return;
      }
      src.ap -= 2;
    } else if (tp === "skill2") {
      if (src.ap < 3) {
        this.cameras.main.shake(100, 0.004);
        return;
      }
      src.ap -= 3;
    }
    this.hud.refreshHeroHud();

    this.clearTargetingInteractions();
    this.closeMenus();
    this.uiMode = "idle";

    // map action -> animation key
    const key =
      tp === "attack"
        ? src.atkKeys[0] ?? src.idleKey
        : tp === "skill1"
        ? src.atkKeys[1] ?? src.atkKeys[0] ?? src.idleKey
        : tp === "skill2"
        ? src.atkKeys[2] ?? src.atkKeys[1] ?? src.idleKey
        : src.atkKeys[0] ?? src.idleKey;

    this.pendingIsHeal =
      this.actionCtx.type === "skill2" &&
      this.actionCtx.targetSide === "heroes";

    // drive animation
    this.inAction = true;
    this.tweenAct(src, tgt, key);
  }

  private tweenAct(b: Battler, tgt: Battler, atkKey: string) {
    const toX = this.mid.x + (b.side === "heroes" ? -60 : 60);
    const toY = this.mid.y + (b.side === "heroes" ? 12 : -12);
    const toScale = b.baseScale * 1.15;

    this.tweens.add({
      targets: b.sprite,
      x: toX,
      y: toY,
      scale: toScale,
      duration: 180,
      ease: "sine.out",
      onComplete: () => {
        const atkFrames = sheetFrames(this, atkKey);
        const atkDur = Math.max(200, Math.min(900, (atkFrames / 12) * 1000));
        b.sprite.play(atkKey);

        const vfxK = atkKey.endsWith(":atk1")
          ? "atk1"
          : atkKey.endsWith(":atk2")
          ? "atk2"
          : atkKey.endsWith(":atk3")
          ? "atk3"
          : undefined;

        this.time.delayedCall(Math.floor(atkDur * 0.45), () => {
          this.showHitVFX(b, tgt, vfxK);
          this.onHit(b, tgt);
        });

        this.time.delayedCall(atkDur, () => {
          this.tweens.add({
            targets: b.sprite,
            x: b.basePos.x,
            y: b.basePos.y,
            scale: b.baseScale,
            duration: 200,
            ease: "sine.in",
            onComplete: () => {
              if (this.anims.exists(b.idleKey)) b.sprite.play(b.idleKey, true);
              this.inAction = false;
              this.time.delayedCall(120, () => this.nextTurn());
            },
          });
        });
      },
    });
  }

  private cancelHeroTurn() {
    const h = this.currentHero;
    if (!h) return;
    this.closeMenus();
    this.uiMode = "idle";
    this.awaitingPlayer = false;
    this.inAction = true;
    this.tweens.add({
      targets: h.sprite,
      x: h.basePos.x,
      y: h.basePos.y,
      scale: h.baseScale,
      duration: 180,
      ease: "sine.in",
      onComplete: () => {
        if (this.anims.exists(h.idleKey)) h.sprite.play(h.idleKey, true);
        this.inAction = false;
        // still consume turn to avoid soft-lock
        this.time.delayedCall(80, () => this.nextTurn());
      },
    });
  }

  private doDefend(hero: Battler) {
    this.defended.add(hero);
    // tiny visual feedback
    hero.sprite.setTint(0x88aaff);
    this.time.delayedCall(250, () => hero.sprite.clearTint());

    this.closeMenus();
    this.uiMode = "idle";
    this.awaitingPlayer = false;

    // End turn, return home (already at center-left; send back)
    this.inAction = true;
    this.tweens.add({
      targets: hero.sprite,
      x: hero.basePos.x,
      y: hero.basePos.y,
      scale: hero.baseScale,
      duration: 180,
      ease: "sine.in",
      onComplete: () => {
        if (this.anims.exists(hero.idleKey))
          hero.sprite.play(hero.idleKey, true);
        this.inAction = false;
        this.time.delayedCall(80, () => this.nextTurn());
      },
    });
  }

  /** Refill all heroes’ AP at some cadence (call when you want, e.g., round start). */
  private refillHeroAp() {
    this.battlers
      .filter((b) => b.side === "heroes")
      .forEach((h) => {
        h.ap = h.maxAp;
      });
    this.hud.refreshHeroHud();
  }

  private showHitVFX(
    attacker: Battler,
    target: Battler,
    which?: "atk1" | "atk2" | "atk3"
  ) {
    if (!which) return;

    // Look up vfx sheet on the attacker
    const prefix =
      attacker.side === "heroes" ? `H${attacker.ix}` : `E${attacker.ix}`;
    const k = `${prefix}:vfx:${which}`;
    if (!this.textures.exists(k)) return;

    const v = this.add
      .sprite(target.sprite.x, target.sprite.y - 28, k, 0)
      .setScale(1.0)
      .setDepth(999);

    const frames = sheetFrames(this, k);
    const animKey = `${k}:once`;
    if (!this.anims.exists(animKey)) {
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(k, {
          start: 0,
          end: frames - 1,
        }),
        frameRate: 14,
        repeat: 0,
      });
    }
    v.play(animKey);
    v.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => v.destroy());
  }

  private onHit(attacker: Battler, target: Battler) {
    if (!target.alive) return;

    if (this.pendingIsHeal) {
      // heal 28–40
      const heal = 28 + Math.floor(Math.random() * 13);
      target.hp = Phaser.Math.Clamp(target.hp + heal, 0, target.maxHp);
      this.hud.refreshHeroHud();
      this.pendingIsHeal = false;
      // play hurt->idle skip; just a tiny flash
      target.sprite.setTint(0x66e28a);
      this.time.delayedCall(150, () => target.sprite.clearTint());
      // no KO/victory checks on heals
      return;
    }

    const wasDefending = this.defended.has(target);
    let block = false;
    if (wasDefending) {
      block = Math.random() < 0.5; // 50% block chance while defended
    }

    // simple damage model
    let damage = 0;
    if (block) {
      damage = 4 + Math.floor(Math.random() * 4); // small chip
    } else if (Math.random() < 0.25) {
      damage = target.hp; // lethal demo
    } else {
      damage = 18 + Math.floor(Math.random() * 10); // 18–27
    }

    target.hp = Phaser.Math.Clamp(target.hp - damage, 0, target.maxHp);
    const killed = target.hp <= 0;
    if (killed) target.alive = false;

    // play anims as before...
    if (killed) {
      if (this.anims.exists(target.deathKey)) {
        target.sprite.play(target.deathKey);
        target.sprite.once(
          Phaser.Animations.Events.ANIMATION_COMPLETE,
          () => {}
        );
      }
    } else {
      if (this.anims.exists(target.hurtKey)) {
        target.sprite.play(target.hurtKey);
        target.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          const idle = target.idleKey;
          if (this.anims.exists(idle) && target.alive)
            target.sprite.play(idle, true);
        });
      }
    }

    // refresh hero HUD (only shows heroes; harmless for enemies)
    this.hud.refreshHeroHud();

    // victory check (unchanged)
    const enemiesAlive = this.battlers.some(
      (b) => b.side === "enemies" && b.alive
    );
    const heroesAlive = this.battlers.some(
      (b) => b.side === "heroes" && b.alive
    );
    if (!enemiesAlive) this.endCombat("heroes");
    else if (!heroesAlive) this.endCombat("enemies");
  }

  /** Current alive order used for turns (same logic as nextTurn). */
  private computeOrder(): Battler[] {
    return [
      ...this.battlers.filter((b) => b.side === "heroes" && b.alive),
      ...this.battlers.filter((b) => b.side === "enemies" && b.alive),
    ];
  }

  private endCombat(winner: Side) {
    const W = this.scale.width,
      H = this.scale.height;
    this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setDepth(1000);
    this.add
      .text(W / 2, H / 2, winner === "heroes" ? "Victory!" : "Defeat...", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "38px",
        color: "#e7e7ea",
      })
      .setOrigin(0.5)
      .setDepth(1001);

    const resolution: CombatResolution = {
      victory: winner === "heroes",
      loot: winner === "heroes" ? this.generateLoot() : { gold: 0, items: [] },
      stressDelta: winner === "heroes" ? -8 : 16,
    };

    this.time.delayedCall(1100, () => {
      this.game.events.emit("combatEnd", resolution);
      // Return to the overworld
      this.scene.stop("Combat");
      this.scene.resume("game");
    });
  }

  private generateLoot(): LootReward {
    const loot: LootReward = {
      gold: 0,
      items: [],
    };
    const pouchStacks = Phaser.Math.Between(1, 2);
    loot.items.push({ id: "pouch_gold", quantity: pouchStacks });

    const rollCount = Phaser.Math.Between(0, 2);
    for (let i = 0; i < rollCount; i++) {
      const id = Phaser.Utils.Array.GetRandom(LOOT_POOL);
      const quantity = id === "pouch_gold" ? 1 : Phaser.Math.Between(1, 2);
      loot.items.push({ id, quantity });
    }
    return loot;
  }

  private cleanScene() {
    this.cleanupFns.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    this.cleanupFns = [];
    this.clearTargetingInteractions();
    // stop timers/tweens
    this.tweens?.killAll();
    this.time?.removeAllEvents();

    // destroy HUDs and markers
    this.hud?.destroy();
    // @ts-ignore allow GC after destroy during shutdown
    this.hud = undefined;

    // sprites (battlers)
    this.battlers.forEach((b) => b.sprite?.destroy());
    this.battlers = [];

    // other flags
    this.awaitingPlayer = false;
    this.currentHero = undefined;
    this.inAction = false;
    this.turnIndex = 0;

    // target marker
    this.targetMarker?.destroy();
    this.targetMarker = undefined;

    this.uiMode = "idle";
    this.actionCtx = { type: null };
    this.defended.clear();
    this.mainMenu?.destroy();
    this.mainMenu = undefined;
    this.skillsMenu?.destroy();
    this.skillsMenu = undefined;
  }
}

const LOOT_POOL: ItemId[] = [
  "pouch_gold",
  "stress_tonic",
  "minor_torch",
  "healing_salve",
  "mystery_relic",
];

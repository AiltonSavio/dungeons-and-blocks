import Phaser from "phaser";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  pollCombatState,
  submitCombatAction,
  concludeCombat,
  isHeroTurn,
  isCombatResolved,
  isVictory,
  getCurrentActor,
  getStatusEffectName,
  getStatusEffectColor,
  getActiveStatuses,
  canAffordAction,
  HERO_AP_MAX,
  getEffectiveAp,
  type CombatContext,
  type CombatActionOptions,
} from "../state/combatIntegration";
import {
  HeroActionKind,
  type ChainCombat,
  type ChainHeroCombatant,
  type ChainEnemyCombatant,
  type ChainStatusInstance,
} from "../state/adventureChain";
import {
  HERO_ASSETS,
  ENEMY_ASSETS,
  HERO_CLASS_TO_KEY,
  type HeroClassKey,
} from "../content/units";

interface CombatInitData {
  adventureKey: string;
  ownerKey: string;
  connection: Connection;
  authority: {
    publicKey: PublicKey;
    signTransaction?: (tx: Transaction) => Promise<Transaction>;
    signAndSendTransaction?: (
      tx: Transaction
    ) => Promise<string | { signature: string }>;
  };
  heroClasses?: HeroClassKey[];
}

type UIMode = "idle" | "selectingAction" | "selectingTarget" | "processing";

export default class Combat extends Phaser.Scene {
  private ctx!: CombatContext;
  private combatState: ChainCombat | null = null;
  private pollTimer?: Phaser.Time.TimerEvent;

  // UI state
  private uiMode: UIMode = "idle";
  private selectedHeroIndex = 0;
  private selectedAction?: HeroActionKind;
  private selectedTargetIndex = 0;

  // Visual elements
  private heroSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private enemySprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private heroHpBars: Map<number, Phaser.GameObjects.Graphics> = new Map();
  private enemyHpBars: Map<number, Phaser.GameObjects.Graphics> = new Map();
  private heroApTexts: Map<number, Phaser.GameObjects.Text> = new Map();
  private statusContainers: Map<number, Phaser.GameObjects.Container> =
    new Map();

  private targetIndicator?: Phaser.GameObjects.Arc;
  private actionMenu?: Phaser.GameObjects.Container;
  private turnIndicator?: Phaser.GameObjects.Text;

  private heroSlots: Phaser.Math.Vector2[] = [];
  private enemySlots: Phaser.Math.Vector2[] = [];

  private bootstrapped = false;
  private statusText?: Phaser.GameObjects.Text;

  private mainMenu?: Phaser.GameObjects.Container;
  private skillsMenu?: Phaser.GameObjects.Container;
  private awaitingPlayer = false;
  private currentHeroIndex?: number;
  private targetDisposers: Array<() => void> = [];
  private defendedHeroes = new Set<number>();

  private heroBaseScale = new Map<number, number>();
  private enemyBaseScale = new Map<number, number>();
  private enemyAnimating = false;
  private pendingEnemyActions: Array<{ enemy: number; target: number | null }> =
    [];
  private pendingHeroTurnIndex: number | null = null;
  private lastEnemyActionSignature?: string;
  private heroClassOverridesBySlot = new Map<number, HeroClassKey>();
  private heroClassOverridesByHeroIndex = new Map<number, HeroClassKey>();

  constructor() {
    super("Combat");
  }

  init(data: CombatInitData) {
    this.ctx = {
      connection: data.connection,
      owner: new PublicKey(data.ownerKey),
      authority: data.authority,
      adventureKey: new PublicKey(data.adventureKey),
    };

    this.heroClassOverridesBySlot.clear();
    this.heroClassOverridesByHeroIndex.clear();
    data.heroClasses
      ?.map((cls) => cls)
      .forEach((cls, ix) => {
        if (cls) {
          this.heroClassOverridesBySlot.set(ix, cls);
          this.heroClassOverridesByHeroIndex.set(ix, cls);
        }
      });
  }

  async create() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());

    this.cameras.main.setBackgroundColor(0x0b0c10);

    // Persistent loading/status text
    this.statusText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "Loading combat…", {
        fontSize: "18px",
        color: "#e6e6e6",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setDepth(1000);

    // First try (non-blocking)
    this.combatState = await pollCombatState(this.ctx);

    console.log("Initial combat state:", this.combatState);

    // Create a single poll timer (every 1s until we bootstrap, then 2s)
    this.pollTimer = this.time.addEvent({
      delay: 1000,
      callback: () => void this.updateCombatState(),
      callbackScope: this,
      loop: true,
    });

    // If we already have state, bootstrap immediately
    if (this.combatState) {
      await this.loadEncounterAssets(this.combatState);
      this.createAllAnimsForEncounter(this.combatState);
      this.ensureBootstrapped();
      this.renderCombatState();
    }
  }

  // New helper
  private ensureBootstrapped() {
    if (this.bootstrapped) return;

    // Layout & static UI
    this.setupLayout();

    // Simple battleground panel (just visuals)
    const W = this.scale.width,
      H = this.scale.height;
    this.add
      .rectangle(W / 2, H / 2, W * 0.9, H * 0.75, 0x14161c, 1)
      .setStrokeStyle(2, 0x232730, 1)
      .setDepth(0);

    // Target marker ring (green by default; recolor per side)
    this.targetIndicator = this.add
      .circle(0, 0, 40)
      .setStrokeStyle(3, 0x9ad67a, 1)
      .setVisible(false)
      .setDepth(50);

    this.targetIndicator = this.add
      .circle(0, 0, 40)
      .setStrokeStyle(3, 0xff6b6b, 1)
      .setVisible(false)
      .setDepth(50);

    this.turnIndicator = this.add
      .text(this.scale.width / 2, 30, "", {
        fontSize: "18px",
        color: "#e6e6e6",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setDepth(100);

    this.setupInput();

    // Hide status text now that UI is ready
    this.statusText?.setVisible(false);

    // Slow polling a bit after bootstrap
    if (this.pollTimer) {
      this.pollTimer.remove(false);
    }
    this.pollTimer = this.time.addEvent({
      delay: 2000,
      callback: () => void this.updateCombatState(),
      callbackScope: this,
      loop: true,
    });

    this.bootstrapped = true;
  }

  private setupLayout() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Hero positions (left side)
    const leftX = W * 0.25;
    const heroY = H * 0.5;
    const heroSpacing = 120;

    for (let i = 0; i < 4; i++) {
      this.heroSlots.push(
        new Phaser.Math.Vector2(
          leftX,
          heroY - heroSpacing * 1.5 + i * heroSpacing
        )
      );
    }

    // Enemy positions (right side)
    const rightX = W * 0.75;
    const enemyY = H * 0.5;
    const enemySpacing = 120;

    for (let i = 0; i < 4; i++) {
      this.enemySlots.push(
        new Phaser.Math.Vector2(
          rightX,
          enemyY - enemySpacing * 1.5 + i * enemySpacing
        )
      );
    }
  }

  private setupInput() {
    // ESC to cancel
    const esc = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    esc?.on("down", () => {
      if (
        this.uiMode === "selectingTarget" ||
        this.uiMode === "selectingAction"
      ) {
        this.cancelAction();
      }
    });

    const digitCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
    ];

    digitCodes.forEach((code, idx) => {
      const key = this.input.keyboard?.addKey(code);
      key?.on("down", () => {
        if (this.uiMode === "selectingAction") {
          this.selectActionByIndex(idx);
        } else if (this.uiMode === "selectingTarget") {
          this.selectTargetByIndex(idx);
        }
      });
    });
  }

  private async updateCombatState() {
    const newState = await pollCombatState(this.ctx);

    if (!newState) {
      // keep status visible while waiting
      this.statusText?.setText("Waiting for combat state…");
      this.statusText?.setVisible(true);
      return;
    }

    const previousState = this.combatState;
    this.combatState = newState;
    newState.heroes.forEach((hero, ix) => {
      const override = this.heroClassOverridesByHeroIndex.get(hero.heroIndex);
      if (override) {
        this.heroClassOverridesBySlot.set(ix, override);
      } else {
        const slotOverride = this.heroClassOverridesBySlot.get(ix);
        if (slotOverride) {
          this.heroClassOverridesByHeroIndex.set(hero.heroIndex, slotOverride);
        }
      }
    });

    if (!this.bootstrapped) {
      this.ensureBootstrapped();
    }

    this.renderCombatState();
    if (previousState) {
      this.handleEnemyAction(previousState, newState);
    }

    if (isCombatResolved(this.combatState)) {
      this.pollTimer?.destroy();
      await this.handleCombatEnd();
    } else if (isHeroTurn(this.combatState) && this.uiMode === "idle") {
      const actor = getCurrentActor(this.combatState);
      if (actor && actor.kind === "hero") {
        if (this.enemyAnimating) {
          this.pendingHeroTurnIndex = actor.index;
        } else {
          this.startHeroTurn(actor.index);
        }
      } else {
        this.pendingHeroTurnIndex = null;
      }
    }
  }

  private startHeroTurn(heroIndex: number) {
    if (!this.combatState) return;
    const hero = this.combatState.heroes[heroIndex];
    if (!hero?.alive) return;

    this.currentHeroIndex = heroIndex;
    this.selectedHeroIndex = heroIndex;
    this.awaitingPlayer = false;
    this.uiMode = "processing";

    // Move the hero “center-left” before opening the menu
    const slot = this.heroSlots[heroIndex];
    const toX = this.scale.width / 2 - 90;
    const toY = this.scale.height / 2 + 6;

    const sprite = this.heroSprites.get(heroIndex);
    if (!sprite) return;

    const base = this.heroBaseScale.get(heroIndex) ?? 1;
    this.tweens.add({
      targets: sprite,
      x: toX,
      y: toY,
      scale: base * 1.2, // a bit larger while acting
      duration: 220,
      ease: "sine.out",
      onComplete: () => {
        this.awaitingPlayer = true;
        this.uiMode = "selectingAction";
        this.openMainMenu(heroIndex);
      },
    });
  }

  private createMenu(
    x: number,
    y: number,
    items: { label: string; onSelect: () => void; enabled?: boolean }[]
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(800);
    const w = 160,
      lineH = 24;
    const panel = this.add
      .rectangle(0, 0, w, items.length * lineH + 12, 0x0f1117, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x2b2f3b, 1);
    c.add(panel);

    items.forEach((item, i) => {
      const enabled = item.enabled !== false;
      const txt = this.add
        .text(8, 6 + i * lineH, item.label, {
          fontFamily: "ui-sans-serif, system-ui",
          fontSize: "14px",
          color: enabled ? "#e7e7ea" : "#666666",
        })
        .setOrigin(0, 0.5);
      if (enabled) {
        txt.setInteractive({ useHandCursor: true });
        txt.on("pointerover", () => txt.setColor("#ffe28a"));
        txt.on("pointerout", () => txt.setColor("#e7e7ea"));
        txt.on("pointerdown", () => item.onSelect());
      }
      c.add(txt);
    });
    return c;
  }

  private closeMenus() {
    this.mainMenu?.destroy();
    this.mainMenu = undefined;
    this.skillsMenu?.destroy();
    this.skillsMenu = undefined;
    this.clearTargetingInteractions();
  }

  private openMainMenu(heroIndex: number) {
    if (!this.combatState) return;
    const hero = this.combatState.heroes[heroIndex];
    const sprite = this.heroSprites.get(heroIndex);
    if (!hero || !sprite) return;

    this.closeMenus(); // cleanup prior

    const x = sprite.x + 72,
      y = sprite.y - 20;
    this.mainMenu = this.createMenu(x, y, [
      {
        label: "Attack",
        onSelect: () => {
          this.selectedAction = HeroActionKind.Attack;
          this.closeMenus();
          this.beginTargeting("enemy");
        },
        enabled: hero.alive && canAffordAction(hero, HeroActionKind.Attack),
      },
      {
        label: "Skills",
        onSelect: () => this.openSkillsMenu(heroIndex),
        enabled: hero.alive,
      },
      {
        label: "Defend",
        onSelect: () => this.doDefend(),
        enabled: hero.alive && canAffordAction(hero, HeroActionKind.Defend),
      },
      {
        label: "Cancel",
        onSelect: () => this.cancelHeroTurn(), // returns to slot, consumes turn
      },
    ]);
  }

  private openSkillsMenu(heroIndex: number) {
    if (!this.combatState || this.uiMode !== "selectingAction") return;
    const hero = this.combatState.heroes[heroIndex];
    const x = (this.mainMenu?.x ?? 0) + 140;
    const y = (this.mainMenu?.y ?? 0) - 10;

    this.skillsMenu?.destroy();
    this.skillsMenu = this.createMenu(x, y, [
      {
        label: "Skill 1 (2 AP)",
        onSelect: () => {
          this.closeMenus();
          this.selectedAction = HeroActionKind.Skill1;
          this.beginTargeting("enemy");
        },
        enabled: canAffordAction(hero, HeroActionKind.Skill1),
      },
      {
        label: "Skill 2 (3 AP)",
        onSelect: () => {
          this.closeMenus();
          this.selectedAction = HeroActionKind.Skill2;
          this.beginTargeting("enemy");
        },
        enabled: canAffordAction(hero, HeroActionKind.Skill2),
      },
      {
        label: "Back",
        onSelect: () => {
          this.skillsMenu?.destroy();
          this.skillsMenu = undefined;
        },
      },
    ]);
  }

  private doDefend() {
    this.selectedAction = HeroActionKind.Defend;
    const heroIdx = this.getActiveHeroIndex();
    if (!this.canHeroAffordAction(this.selectedAction)) {
      this.showError("Not enough AP");
      return;
    }
    if (heroIdx == null) {
      this.showError("Not hero turn");
      return;
    }
    this.confirmTarget(heroIdx, "hero");
  }

  private cancelHeroTurn() {
    this.closeMenus();
    this.clearTargetingInteractions();
    this.selectedAction = undefined;
    this.uiMode = "idle";
    this.awaitingPlayer = false;
    this.returnHeroHome();
  }

  private clearTargetingInteractions() {
    this.targetDisposers.forEach((fn) => fn());
    this.targetDisposers = [];
    this.targetIndicator?.setVisible(false);
  }

  private canHeroAffordAction(action?: HeroActionKind): boolean {
    if (!this.combatState || action == null) return false;
    const heroIdx = this.getActiveHeroIndex();
    if (heroIdx == null) return false;
    const hero = this.combatState.heroes[heroIdx];
    if (!hero) return false;
    return canAffordAction(hero, action);
  }

  private getActiveHeroIndex(): number | null {
    if (!this.combatState) return null;
    const actor = getCurrentActor(this.combatState);
    if (actor?.kind === "hero") {
      return actor.index;
    }
    if (this.currentHeroIndex != null) return this.currentHeroIndex;
    return null;
  }

  private findFirstAliveEnemy(): number | null {
    if (!this.combatState) return null;
    const slot = this.combatState.initiative.find(
      (s) => s.kind === 1 && s.active
    );
    if (slot) return slot.index;
    const idx = this.combatState.enemies.findIndex((enemy) => enemy.alive);
    return idx >= 0 ? idx : null;
  }

  private findFirstAliveHero(): number | null {
    if (!this.combatState) return null;
    const slot = this.combatState.initiative.find(
      (s) => s.kind === 0 && s.active
    );
    if (slot) return slot.index;
    const idx = this.combatState.heroes.findIndex((hero) => hero.alive);
    return idx >= 0 ? idx : null;
  }

  private isEnemyIndexActive(index: number): boolean {
    if (!this.combatState) return false;
    return this.combatState.initiative.some(
      (slot) => slot.kind === 1 && slot.active && slot.index === index
    );
  }

  private isHeroIndexActive(index: number): boolean {
    if (!this.combatState) return false;
    return this.combatState.initiative.some(
      (slot) => slot.kind === 0 && slot.active && slot.index === index
    );
  }

  private async syncCombatSnapshot(): Promise<void> {
    try {
      const latest = await pollCombatState(this.ctx);
      if (latest) {
        this.combatState = latest;
        latest.heroes.forEach((hero, ix) => {
          const override = this.heroClassOverridesByHeroIndex.get(
            hero.heroIndex
          );
          if (override) {
            this.heroClassOverridesBySlot.set(ix, override);
          } else {
            const slotOverride = this.heroClassOverridesBySlot.get(ix);
            if (slotOverride) {
              this.heroClassOverridesByHeroIndex.set(
                hero.heroIndex,
                slotOverride
              );
            }
          }
        });
      }
    } catch (err) {
      console.warn("Failed to sync combat snapshot", err);
    }
  }

  private resolveTargetIndexForTx(
    desiredIndex: number | null,
    side: "hero" | "enemy"
  ): number | null {
    if (!this.combatState) return null;

    if (side === "enemy") {
      if (
        desiredIndex != null &&
        desiredIndex >= 0 &&
        desiredIndex < this.combatState.enemies.length &&
        this.isEnemyIndexActive(desiredIndex) &&
        this.combatState.enemies[desiredIndex]?.alive
      ) {
        return desiredIndex;
      }
      return this.findFirstAliveEnemy();
    }

    if (
      desiredIndex != null &&
      desiredIndex >= 0 &&
      desiredIndex < this.combatState.heroes.length &&
      this.isHeroIndexActive(desiredIndex) &&
      this.combatState.heroes[desiredIndex]?.alive
    ) {
      return desiredIndex;
    }
    return this.findFirstAliveHero();
  }

  private beginTargeting(side: "enemy" | "hero") {
    if (!this.combatState) return;

    this.uiMode = "selectingTarget";
    this.awaitingPlayer = true;

    const isEnemy = side === "enemy";
    this.targetIndicator?.setStrokeStyle(3, isEnemy ? 0xff6b6b : 0x66e28a, 1);

    const list = (isEnemy ? this.combatState.enemies : this.combatState.heroes)
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.alive);

    if (list.length === 0) {
      this.uiMode = "selectingAction";
      return;
    }

    list.forEach(({ i }) => {
      const sprite = isEnemy
        ? this.enemySprites.get(i)
        : this.heroSprites.get(i);
      if (!sprite) return;

      const onOver = () => {
        const slot = isEnemy ? this.enemySlots[i] : this.heroSlots[i];
        this.targetIndicator?.setPosition(slot.x, slot.y - 6).setVisible(true);
      };
      const onOut = () => this.targetIndicator?.setVisible(false);
      const onDown = () => {
        this.selectedTargetIndex = i;
        // default action if none chosen yet = Attack
        if (!this.selectedAction) this.selectedAction = HeroActionKind.Attack;
        if (!this.canHeroAffordAction(this.selectedAction)) {
          this.showError("Not enough AP");
          this.selectedAction = undefined;
          this.uiMode = "selectingAction";
          this.clearTargetingInteractions();
          return;
        }
        this.confirmTarget(i, side);
      };

      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerover", onOver);
      sprite.on("pointerout", onOut);
      sprite.on("pointerdown", onDown);
      this.targetDisposers.push(() => {
        sprite.off("pointerover", onOver);
        sprite.off("pointerout", onOut);
        sprite.off("pointerdown", onDown);
        sprite.disableInteractive();
      });
    });
  }

  private renderCombatState() {
    if (!this.combatState) return;

    // Render heroes
    this.combatState.heroes.forEach((hero, idx) => {
      this.renderHero(hero, idx);
    });

    // Render enemies
    this.combatState.enemies.forEach((enemy, idx) => {
      this.renderEnemy(enemy, idx);
    });

    // Update turn indicator
    this.updateTurnIndicator();
  }

  private handleEnemyAction(prev: ChainCombat, next: ChainCombat) {
    if (!prev || prev.turn.isHero || !next) return;

    const enemyIndex = prev.turn.actorIndex;
    if (enemyIndex < 0 || enemyIndex >= prev.enemies.length) return;
    const actingEnemy = prev.enemies[enemyIndex];
    if (!actingEnemy || !actingEnemy.alive) return;

    const signature = this.buildEnemyActionSignature(prev, enemyIndex);
    if (signature === this.lastEnemyActionSignature) return;

    this.lastEnemyActionSignature = signature;

    const targetIndex = this.identifyEnemyTarget(prev, next);
    this.enqueueEnemyAction(enemyIndex, targetIndex);
  }

  private buildEnemyActionSignature(state: ChainCombat, enemyIndex: number) {
    const heroHp = state.heroes.map((hero) => hero.hp).join("-");
    const enemyHp = state.enemies.map((enemy) => enemy.hp).join("-");
    return `${
      state.round
    }:${enemyIndex}:${state.rngState.toString()}:${heroHp}:${enemyHp}`;
  }

  private identifyEnemyTarget(
    prev: ChainCombat,
    next: ChainCombat
  ): number | null {
    let bestIndex = -1;
    let bestDelta = 0;

    prev.heroes.forEach((hero, idx) => {
      const after = next.heroes[idx];
      if (!after) return;
      const delta = hero.hp - after.hp;
      if (delta > bestDelta) {
        bestDelta = delta;
        bestIndex = idx;
      }
      if (hero.alive && !after.alive && bestIndex !== idx) {
        bestIndex = idx;
        bestDelta = Math.max(bestDelta, 1);
      }
    });

    if (bestIndex >= 0) return bestIndex;

    const guardTarget = prev.heroes.findIndex(
      (hero, idx) => hero.guard !== next.heroes[idx]?.guard
    );
    return guardTarget >= 0 ? guardTarget : null;
  }

  private renderHero(hero: ChainHeroCombatant, index: number) {
    const slot = this.heroSlots[index];
    if (!slot) return;

    let sprite = this.heroSprites.get(index);
    if (!sprite) {
      const cls = this.heroClassKeyFromChain(index);
      const u = HERO_ASSETS[cls];

      sprite = this.add
        .sprite(slot.x, slot.y, this.heroKey(index, "idle"), 0)
        .setDepth(10);
      const baseScale = (u.scale ?? 1) * 2;
      sprite.setScale(baseScale);
      this.heroBaseScale.set(index, baseScale);

      this.playIfExists(sprite, `H${index}:idle`);
      this.heroSprites.set(index, sprite);
    }

    // death/idle state
    if (!hero.alive) {
      sprite.setAlpha(0.35);
      if (sprite.anims?.currentAnim?.key !== `H${index}:death`) {
        this.playIfExists(sprite, `H${index}:death`);
      }
    } else {
      sprite.setAlpha(1);
      this.playIfExists(sprite, `H${index}:idle`, true);
    }

    // UI
    this.renderHpBar(index, hero.hp, hero.maxHp, slot, true);
    this.renderApDisplay(index, hero, slot);
    this.renderStatusEffects(index, hero.statuses, slot, true);
  }

  private renderEnemy(enemy: ChainEnemyCombatant, index: number) {
    const slot = this.enemySlots[index];
    if (!slot) return;

    // If this is an empty slot (no unit), nuke any remnants and bail
    if (!enemy || enemy.maxHp <= 0) {
      // cleanup any existing visuals for this index
      const old = this.enemySprites.get(index);
      if (old) {
        old.destroy();
        this.enemySprites.delete(index);
      }
      const hp = this.enemyHpBars.get(index);
      if (hp) {
        hp.getData("hpText")?.destroy();
        hp.destroy();
        this.enemyHpBars.delete(index);
      }
      const status = this.statusContainers.get(index);
      if (status) {
        status.destroy();
        this.statusContainers.delete(index);
      }
      return;
    }

    const asset =
      ENEMY_ASSETS[enemy.kind] ?? ENEMY_ASSETS[index % ENEMY_ASSETS.length];

    let sprite = this.enemySprites.get(index);
    if (!sprite) {
      sprite = this.add
        .sprite(slot.x, slot.y, this.enemyKey(index, "idle"), 0)
        .setDepth(10);
      const baseScale = (asset.scale ?? 1) * 2;
      sprite.setScale(baseScale);
      this.enemyBaseScale.set(index, baseScale);

      sprite.setFlipX(true);

      this.playIfExists(sprite, `E${index}:idle`);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", () => {
        if (this.uiMode === "selectingTarget")
          this.confirmTarget(index, "enemy");
      });

      this.enemySprites.set(index, sprite);
    }

    const desiredScale = (asset.scale ?? 1) * 2;
    if (this.enemyBaseScale.get(index) !== desiredScale) {
      sprite.setScale(desiredScale);
      this.enemyBaseScale.set(index, desiredScale);
    }

    // death/idle state (FIX: use E keys + enemySprites)
    if (!enemy.alive) {
      sprite.setAlpha(0.35);
      if (sprite.anims?.currentAnim?.key !== `E${index}:death`) {
        this.playIfExists(sprite, `E${index}:death`);
      }
    } else {
      sprite.setAlpha(1);
      this.playIfExists(sprite, `E${index}:idle`, true);
    }

    // UI
    this.renderHpBar(index, enemy.hp, enemy.maxHp, slot, false);
    this.renderStatusEffects(index, enemy.statuses, slot, false);
  }

  private enqueueEnemyAction(enemyIndex: number, targetIndex: number | null) {
    if (this.enemyAnimating) {
      this.pendingEnemyActions.push({ enemy: enemyIndex, target: targetIndex });
      return;
    }
    this.animateEnemyAction(enemyIndex, targetIndex);
  }

  private animateEnemyAction(enemyIndex: number, targetIndex: number | null) {
    const sprite = this.enemySprites.get(enemyIndex);
    const slot = this.enemySlots[enemyIndex];
    if (!sprite || !slot) {
      this.finishEnemyAnimation();
      return;
    }

    this.enemyAnimating = true;
    this.uiMode = "processing";
    this.awaitingPlayer = false;

    const base = this.enemyBaseScale.get(enemyIndex) ?? 1;
    const toX = this.scale.width / 2 + 90;
    const toY = this.scale.height / 2 + 6;

    this.tweens.add({
      targets: sprite,
      x: toX,
      y: toY,
      scale: base * 1.2,
      duration: 200,
      ease: "sine.out",
      onComplete: () => {
        const atkKey = this.enemyKey(enemyIndex, "atk1");
        if (this.anims.exists(atkKey)) {
          sprite.play(atkKey);
        }

        if (targetIndex !== null) {
          this.flashHeroHit(targetIndex);
        }

        const frames =
          this.sheetFrames(this.enemyKey(enemyIndex, "atk1")) ||
          this.sheetFrames(this.enemyKey(enemyIndex, "idle")) ||
          12;
        const swingMs = Math.max(200, Math.min(900, (frames / 12) * 1000));

        this.time.delayedCall(Math.floor(swingMs * 0.45), () => {
          this.returnEnemyHome(enemyIndex, () => this.finishEnemyAnimation());
        });
      },
    });
  }

  private flashHeroHit(index: number) {
    const targetSprite = this.heroSprites.get(index);
    if (!targetSprite) return;
    this.tweens.add({
      targets: targetSprite,
      alpha: { from: 1, to: 0.4 },
      duration: 80,
      yoyo: true,
      repeat: 2,
    });
  }

  private returnEnemyHome(index: number, onComplete?: () => void) {
    const sprite = this.enemySprites.get(index);
    const slot = this.enemySlots[index];
    if (!sprite || !slot) {
      onComplete?.();
      return;
    }

    const base = this.enemyBaseScale.get(index) ?? 1;
    this.tweens.add({
      targets: sprite,
      x: slot.x,
      y: slot.y,
      scale: base,
      duration: 200,
      ease: "sine.in",
      onComplete: () => {
        this.playIfExists(sprite, this.enemyKey(index, "idle"));
        onComplete?.();
      },
    });
  }

  private finishEnemyAnimation() {
    const nextAction = this.pendingEnemyActions.shift();
    if (nextAction) {
      this.animateEnemyAction(nextAction.enemy, nextAction.target);
      return;
    }

    this.enemyAnimating = false;

    if (this.pendingHeroTurnIndex != null) {
      const heroIndex = this.pendingHeroTurnIndex;
      this.pendingHeroTurnIndex = null;
      if (this.combatState && isHeroTurn(this.combatState)) {
        this.startHeroTurn(heroIndex);
        return;
      }
    }

    this.uiMode = "idle";
  }

  private playIfExists(
    s: Phaser.GameObjects.Sprite | undefined,
    key: string,
    ignoreIfPlaying = true
  ) {
    if (!s) return;
    if (this.anims.exists(key)) s.play(key, ignoreIfPlaying);
  }

  private renderHpBar(
    index: number,
    currentHp: number,
    maxHp: number,
    slot: Phaser.Math.Vector2,
    isHero: boolean
  ) {
    const map = isHero ? this.heroHpBars : this.enemyHpBars;
    let bar = map.get(index);

    if (!bar) {
      bar = this.add.graphics().setDepth(15);
      map.set(index, bar);
    }

    bar.clear();

    const barWidth = 80;
    const barHeight = 8;
    const x = slot.x - barWidth / 2;
    const y = slot.y + 40;

    // Background
    bar.fillStyle(0x000000, 0.5);
    bar.fillRect(x, y, barWidth, barHeight);

    // HP fill
    const hpPercent = Math.max(0, Math.min(1, currentHp / maxHp));
    const fillWidth = barWidth * hpPercent;
    const hpColor =
      hpPercent > 0.5 ? 0x4ecca3 : hpPercent > 0.25 ? 0xffe66d : 0xff6b6b;

    bar.fillStyle(hpColor);
    bar.fillRect(x, y, fillWidth, barHeight);

    // Border
    bar.lineStyle(1, 0xffffff, 0.3);
    bar.strokeRect(x, y, barWidth, barHeight);

    // HP text
    const hpText = `${currentHp}/${maxHp}`;
    if (!bar.getData("hpText")) {
      const text = this.add
        .text(slot.x, y + barHeight / 2, hpText, {
          fontSize: "10px",
          color: "#ffffff",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setDepth(16);
      bar.setData("hpText", text);
    } else {
      bar.getData("hpText").setText(hpText);
    }
  }

  private renderApDisplay(
    index: number,
    hero: ChainHeroCombatant,
    slot: Phaser.Math.Vector2
  ) {
    let text = this.heroApTexts.get(index);

    if (!text) {
      text = this.add
        .text(slot.x, slot.y - 50, "", {
          fontSize: "12px",
          color: "#6dd5ff",
          fontFamily: "monospace",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(16);
      this.heroApTexts.set(index, text);
    }

    const effectiveAp = getEffectiveAp(hero);
    if (effectiveAp !== hero.ap) {
      text.setText(`AP: ${hero.ap} (+${effectiveAp - hero.ap})`);
    } else {
      text.setText(`AP: ${hero.ap}/${HERO_AP_MAX}`);
    }
  }

  private renderStatusEffects(
    index: number,
    statuses: ChainStatusInstance[],
    slot: Phaser.Math.Vector2,
    isHero: boolean
  ) {
    const key = isHero ? `hero_${index}` : `enemy_${index}`;
    let container = this.statusContainers.get(index);

    if (!container) {
      container = this.add.container(slot.x - 40, slot.y - 70).setDepth(20);
      this.statusContainers.set(index, container);
    }

    container.removeAll(true);

    const activeStatuses = getActiveStatuses(statuses);

    activeStatuses.forEach((status, idx) => {
      const x = idx * 20;
      const color = getStatusEffectColor(status.effect);

      const icon = this.add.circle(x, 0, 6, color);
      container!.add(icon);

      // Tooltip on hover
      icon.setInteractive({ useHandCursor: true });
      icon.on("pointerover", () => {
        const name = getStatusEffectName(status.effect);
        const tooltip = this.add
          .text(
            slot.x,
            slot.y - 90,
            `${name} x${status.stacks} (${status.duration} turns)`,
            {
              fontSize: "10px",
              color: "#ffffff",
              backgroundColor: "#000000",
              padding: { x: 4, y: 2 },
            }
          )
          .setOrigin(0.5)
          .setDepth(100);

        icon.setData("tooltip", tooltip);
      });

      icon.on("pointerout", () => {
        const tooltip = icon.getData("tooltip");
        if (tooltip) {
          tooltip.destroy();
          icon.setData("tooltip", null);
        }
      });
    });
  }

  private updateTurnIndicator() {
    if (!this.combatState || !this.turnIndicator) return;

    const actor = getCurrentActor(this.combatState);
    if (!actor) {
      this.turnIndicator.setText("");
      return;
    }

    if (actor.kind === "hero") {
      this.turnIndicator.setText(`Hero ${actor.index + 1}'s Turn`);
      this.turnIndicator.setColor("#4ecca3");
    } else {
      this.turnIndicator.setText(`Enemy ${actor.index + 1}'s Turn`);
      this.turnIndicator.setColor("#ff6b6b");
    }
  }

  private selectAction(action: HeroActionKind) {
    if (!this.combatState) return;
    const heroIdx = this.getActiveHeroIndex();
    const hero = heroIdx != null ? this.combatState.heroes[heroIdx] : undefined;
    if (!hero || !hero.alive) {
      this.showError("Selected hero is unavailable");
      return;
    }
    if (!canAffordAction(hero, action)) {
      this.showError("Not enough AP");
      return;
    }

    this.selectedAction = action;
    this.actionMenu?.destroy();
    this.actionMenu = undefined;

    if (action === HeroActionKind.Defend) {
      // Defend doesn't need a target
      void this.submitAction(action, 0, "hero");
    } else {
      // Show targeting
      this.showTargeting();
    }
  }

  private selectActionByIndex(index: number) {
    const actions = [
      HeroActionKind.Attack,
      HeroActionKind.Skill1,
      HeroActionKind.Skill2,
      HeroActionKind.Defend,
    ];

    if (index < actions.length) {
      this.selectAction(actions[index]);
    }
  }

  private showTargeting() {
    if (!this.combatState) return;

    this.uiMode = "selectingTarget";
    this.selectedTargetIndex = 0;

    // Find first alive enemy
    const aliveEnemies = this.combatState.enemies
      .map((e, idx) => ({ enemy: e, idx }))
      .filter(({ enemy }) => enemy.alive);

    if (aliveEnemies.length > 0) {
      this.selectedTargetIndex = aliveEnemies[0].idx;
      this.showTargetIndicator(this.selectedTargetIndex);
    }
  }

  private showTargetIndicator(enemyIndex: number) {
    const slot = this.enemySlots[enemyIndex];
    if (!slot || !this.targetIndicator) return;

    this.targetIndicator.setPosition(slot.x, slot.y).setVisible(true);
  }

  private selectTargetByIndex(index: number) {
    if (!this.combatState) return;

    const aliveEnemies = this.combatState.enemies
      .map((e, idx) => ({ enemy: e, idx }))
      .filter(({ enemy }) => enemy.alive);

    if (index < aliveEnemies.length) {
      this.confirmTarget(aliveEnemies[index].idx, "enemy");
    }
  }

  private confirmTarget(targetIndex: number, targetSide: "hero" | "enemy") {
    if (!this.combatState || this.selectedAction == null) return;

    let resolvedTargetIndex: number | null = targetIndex;
    if (targetSide === "enemy") {
      const enemy = this.combatState.enemies[targetIndex];
      if (!enemy?.alive || !this.isEnemyIndexActive(targetIndex)) {
        resolvedTargetIndex = this.findFirstAliveEnemy();
        if (resolvedTargetIndex == null) {
          this.showError("No enemies remain");
          this.uiMode = "selectingAction";
          return;
        }
        this.selectedTargetIndex = resolvedTargetIndex;
      }
    } else {
      const hero = this.combatState.heroes[targetIndex];
      if (!hero?.alive || !this.isHeroIndexActive(targetIndex)) {
        resolvedTargetIndex = this.findFirstAliveHero();
        if (resolvedTargetIndex == null) {
          this.showError("No valid hero target");
          this.uiMode = "selectingAction";
          return;
        }
        this.selectedTargetIndex = resolvedTargetIndex;
      }
    }

    const actorIx = this.getActiveHeroIndex();
    if (actorIx == null) {
      this.showError("Not hero turn");
      return;
    }

    this.currentHeroIndex = actorIx;
    this.selectedHeroIndex = actorIx;
    if (!this.combatState.heroes[actorIx]?.alive) {
      this.showError("Selected hero is unavailable");
      return;
    }

    const actorSprite = this.heroSprites.get(actorIx);
    if (!actorSprite) return;

    this.targetIndicator?.setVisible(false);
    this.clearTargetingInteractions();
    this.uiMode = "processing";
    this.awaitingPlayer = false;

    const toX = this.scale.width / 2 - 60;
    const toY = this.scale.height / 2 + 12;

    // Choose attack key by action (fallback to atk1/idle)
    const atkKey =
      this.selectedAction === HeroActionKind.Skill2
        ? `H${actorIx}:atk3`
        : this.selectedAction === HeroActionKind.Skill1
        ? `H${actorIx}:atk2`
        : this.selectedAction === HeroActionKind.Defend
        ? `H${actorIx}:idle`
        : `H${actorIx}:atk1`;

    const base = this.heroBaseScale.get(actorIx) ?? 1;
    this.tweens.add({
      targets: actorSprite,
      x: toX,
      y: toY,
      scale: base * 1.2,
      duration: 180,
      ease: "sine.out",
      onComplete: () => {
        // Play the swing/heal anim if we have it
        if (this.anims.exists(atkKey)) actorSprite.play(atkKey);

        // Optional VFX (exists for Wizard/Priest etc.)
        const vfxKey = atkKey.endsWith(":atk3")
          ? `H${actorIx}:vfx_atk3:once`
          : atkKey.endsWith(":atk2")
          ? `H${actorIx}:vfx_atk2:once`
          : atkKey.endsWith(":atk1")
          ? `H${actorIx}:vfx_atk1:once`
          : undefined;

        if (vfxKey && this.anims.exists(vfxKey)) {
          // place over the chosen target
          const slot =
            targetSide === "enemy"
              ? this.enemySlots[resolvedTargetIndex]
              : this.heroSlots[resolvedTargetIndex];
          const v = this.add
            .sprite(slot.x, slot.y - 28, vfxKey.split(":once")[0], 0)
            .setDepth(999);
          v.play(vfxKey);
          v.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
            v.destroy()
          );
        }

        // Wait roughly half the swing time so chain can process while we animate
        const frames =
          this.sheetFrames(atkKey.replace(/:.*$/, "") + ":atk1") || 14;
        const swingMs = Math.max(180, Math.min(900, (frames / 12) * 1000));
        this.time.delayedCall(Math.floor(swingMs * 0.45), () => {
          // Submit on-chain while the animation is happening
          void this.submitAction(
            this.selectedAction!,
            resolvedTargetIndex,
            targetSide
          );
        });
      },
    });
  }

  private returnHeroHome() {
    if (this.currentHeroIndex == null) return;
    const sprite = this.heroSprites.get(this.currentHeroIndex);
    const slot = this.heroSlots[this.currentHeroIndex];
    if (!sprite || !slot) return;

    const base = this.heroBaseScale.get(this.currentHeroIndex) ?? 1;
    this.tweens.add({
      targets: sprite,
      x: slot.x,
      y: slot.y,
      scale: base,
      duration: 200,
      ease: "sine.in",
    });
  }

  private async submitAction(
    action: HeroActionKind,
    targetIndex: number | null,
    targetSide: "hero" | "enemy"
  ) {
    if (!this.combatState) return;

    this.uiMode = "processing";

    await this.syncCombatSnapshot();
    if (!this.combatState) return;

    try {
      const actor = getCurrentActor(this.combatState);
      if (!actor || actor.kind !== "hero") {
        throw new Error("Not hero turn");
      }

      const resolvedTargetIndex = this.resolveTargetIndexForTx(
        targetIndex,
        targetSide
      );
      if (targetSide === "enemy" && resolvedTargetIndex == null) {
        throw new Error("No enemies remain");
      }
      if (targetSide === "hero" && resolvedTargetIndex == null) {
        throw new Error("No hero target available");
      }

      const options: CombatActionOptions = {
        heroIndex: actor.index,
        action,
        targetIndex: resolvedTargetIndex,
        targetSide,
      };
      const sig = await submitCombatAction(this.ctx, options, async (tx) => {
        const { blockhash } = await this.ctx.connection.getLatestBlockhash(
          "confirmed"
        );
        tx.recentBlockhash = blockhash;
        tx.feePayer = this.ctx.authority.publicKey;

        console.log("Attempting transaction simulation...");
        try {
          const simulation = await this.ctx.connection.simulateTransaction(tx);
          if (simulation.value.err) {
            console.error("Simulation error:", simulation.value.err);
            console.error("Simulation logs:", simulation.value.logs);
            throw new Error(
              `Simulation failed: ${JSON.stringify(simulation.value.err)}`
            );
          } else {
            console.log("Simulation successful");
            console.log("Simulation logs:", simulation.value.logs);
          }
        } catch (simErr) {
          console.error(
            "Simulation attempt failed (this might be expected):",
            simErr
          );
          throw new Error("Transaction simulation failed.");
        }

        if (this.ctx.authority.signAndSendTransaction) {
          const result = await this.ctx.authority.signAndSendTransaction(tx);
          return typeof result === "string" ? result : result.signature;
        } else if (this.ctx.authority.signTransaction) {
          const signed = await this.ctx.authority.signTransaction(tx);
          return await this.ctx.connection.sendRawTransaction(
            signed.serialize()
          );
        } else {
          throw new Error("Wallet does not support transaction signing");
        }
      });

      // Wait for confirmation
      const { blockhash, lastValidBlockHeight } =
        await this.ctx.connection.getLatestBlockhash("confirmed");
      await this.ctx.connection.confirmTransaction({
        signature: sig,
        blockhash,
        lastValidBlockHeight,
      });

      // Immediately update state
      await this.updateCombatState();
    } catch (err) {
      console.error("Failed to submit combat action:", err);
      this.cameras.main.shake(200, 0.01);
      this.showError("Action failed");
    } finally {
      this.selectedAction = undefined;
      this.uiMode = "idle";
      this.returnHeroHome();
    }
  }

  private cancelAction() {
    this.actionMenu?.destroy();
    this.actionMenu = undefined;
    this.targetIndicator?.setVisible(false);
    this.selectedAction = undefined;
    this.uiMode = "idle";
  }

  private async handleCombatEnd() {
    if (!this.combatState) return;

    const victory = isVictory(this.combatState);

    // Show end screen
    this.showEndScreen(victory);

    // Conclude combat on-chain (applies rewards)
    try {
      const sig = await concludeCombat(this.ctx, async (tx) => {
        const { blockhash } = await this.ctx.connection.getLatestBlockhash(
          "confirmed"
        );
        tx.recentBlockhash = blockhash;
        tx.feePayer = this.ctx.authority.publicKey;

        if (this.ctx.authority.signAndSendTransaction) {
          const result = await this.ctx.authority.signAndSendTransaction(tx);
          return typeof result === "string" ? result : result.signature;
        } else if (this.ctx.authority.signTransaction) {
          const signed = await this.ctx.authority.signTransaction(tx);
          return await this.ctx.connection.sendRawTransaction(
            signed.serialize()
          );
        } else {
          throw new Error("Wallet does not support transaction signing");
        }
      });

      const { blockhash, lastValidBlockHeight } =
        await this.ctx.connection.getLatestBlockhash("confirmed");
      await this.ctx.connection.confirmTransaction({
        signature: sig,
        blockhash,
        lastValidBlockHeight,
      });
    } catch (err) {
      console.error("Failed to conclude combat:", err);
    }

    // Return to game scene after delay
    this.time.delayedCall(3000, () => {
      this.scene.stop("Combat");
      this.scene.resume("game");
    });
  }

  private showEndScreen(victory: boolean) {
    const W = this.scale.width;
    const H = this.scale.height;

    const overlay = this.add
      .rectangle(0, 0, W, H, 0x000000, 0.8)
      .setOrigin(0)
      .setDepth(300);

    const text = this.add
      .text(W / 2, H / 2, victory ? "VICTORY!" : "DEFEAT", {
        fontSize: "48px",
        color: victory ? "#4ecca3" : "#ff6b6b",
        fontFamily: "Arial",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(301);

    // Fade in
    overlay.setAlpha(0);
    text.setAlpha(0);

    this.tweens.add({
      targets: [overlay, text],
      alpha: 1,
      duration: 500,
      ease: "sine.inOut",
    });
  }

  private showError(message: string) {
    const errorText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, message, {
        fontSize: "24px",
        color: "#ff6b6b",
        fontFamily: "monospace",
        backgroundColor: "#000000",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(400);

    this.time.delayedCall(2000, () => errorText.destroy());
  }

  private cleanup() {
    this.pollTimer?.destroy();
    this.pollTimer = undefined;

    this.actionMenu?.destroy();
    this.actionMenu = undefined;

    this.targetIndicator?.destroy();
    this.targetIndicator = undefined;

    this.heroSprites.forEach((s) => s.destroy());
    this.heroSprites.clear();

    this.enemySprites.forEach((s) => s.destroy());
    this.enemySprites.clear();

    this.heroHpBars.forEach((g) => {
      g.getData("hpText")?.destroy();
      g.destroy();
    });
    this.heroHpBars.clear();

    this.enemyHpBars.forEach((g) => {
      g.getData("hpText")?.destroy();
      g.destroy();
    });
    this.enemyHpBars.clear();

    this.heroApTexts.forEach((t) => t.destroy());
    this.heroApTexts.clear();

    this.statusContainers.forEach((c) => c.destroy());
    this.statusContainers.clear();

    this.turnIndicator?.destroy();
    this.turnIndicator = undefined;

    this.pendingEnemyActions = [];
    this.enemyAnimating = false;
    this.pendingHeroTurnIndex = null;
    this.lastEnemyActionSignature = undefined;
    this.heroClassOverridesBySlot.clear();
    this.heroClassOverridesByHeroIndex.clear();
  }

  private sheetFrames = (key: string) =>
    this.textures.exists(key)
      ? this.textures.get(key).getFrameNames().length
      : 0;

  private heroKey = (ix: number, part: string) => `H${ix}:${part}`;
  private enemyKey = (ix: number, part: string) => `E${ix}:${part}`;

  private heroClassKeyFromChain(ix: number): HeroClassKey {
    const override = this.heroClassOverridesBySlot.get(ix);
    if (override) return override;

    const h = this.combatState?.heroes[ix];
    if (h) {
      const byHeroIndex = this.heroClassOverridesByHeroIndex.get(h.heroIndex);
      if (byHeroIndex) {
        this.heroClassOverridesBySlot.set(ix, byHeroIndex);
        return byHeroIndex;
      }
    }

    const raw =
      (h as any)?.heroClass ||
      (h as any)?.class ||
      (h as any)?.className ||
      null;
    if (raw && HERO_CLASS_TO_KEY[raw as keyof typeof HERO_CLASS_TO_KEY]) {
      return HERO_CLASS_TO_KEY[raw as keyof typeof HERO_CLASS_TO_KEY];
    }
    // Fallback: keep your usual party order
    const fallbackOrder: HeroClassKey[] = [
      "knight",
      "knightTemplar",
      "wizard",
      "priest",
    ];
    const fb = fallbackOrder[ix] ?? "knight";
    this.heroClassOverridesBySlot.set(ix, fb);
    if (h) this.heroClassOverridesByHeroIndex.set(h.heroIndex, fb);
    return fb;
  }

  /** Load all needed sheets for heroes in this encounter, and a minimal enemy pack. */
  private async loadEncounterAssets(state: ChainCombat): Promise<void> {
    // ---- HEROES (only the ones present) ----
    state.heroes.forEach((hero, i) => {
      if (hero) {
        const override = this.heroClassOverridesByHeroIndex.get(hero.heroIndex);
        if (override) {
          this.heroClassOverridesBySlot.set(i, override);
        }
      }
      const key = this.heroClassKeyFromChain(i);
      if (hero) {
        this.heroClassOverridesByHeroIndex.set(hero.heroIndex, key);
      }
      this.heroClassOverridesBySlot.set(i, key);
      const u = HERO_ASSETS[key];
      const add = (k: string | undefined, id: string) => {
        if (!k) return;
        // Each sheet is a 100x100 spritesheet in your asset pack
        this.load.spritesheet(this.heroKey(i, id), `${u.base}/${k}`, {
          frameWidth: 100,
          frameHeight: 100,
        });
      };
      add(u.sheets.idle, "idle");
      add(u.sheets.walk, "walk");
      add(u.sheets.hurt, "hurt");
      add(u.sheets.death, "death");
      add(u.sheets.atk1, "atk1");
      add(u.sheets.atk2, "atk2");
      add((u.sheets as any).atk3, "atk3"); // some heroes have atk3

      // Optional VFX
      if (u.vfx) {
        if (u.vfx.atk1)
          this.load.spritesheet(
            this.heroKey(i, "vfx_atk1"),
            `${u.base}/${u.vfx.atk1}`,
            {
              frameWidth: 100,
              frameHeight: 100,
            }
          );
        if (u.vfx.atk2)
          this.load.spritesheet(
            this.heroKey(i, "vfx_atk2"),
            `${u.base}/${u.vfx.atk2}`,
            {
              frameWidth: 100,
              frameHeight: 100,
            }
          );
        if (u.vfx.atk3)
          this.load.spritesheet(
            this.heroKey(i, "vfx_atk3"),
            `${u.base}/${u.vfx.atk3}`,
            {
              frameWidth: 100,
              frameHeight: 100,
            }
          );
      }
    });

    // ---- ENEMIES ----
    state.enemies.forEach((enemy, i) => {
      if (!enemy || (!enemy.alive && enemy.maxHp === 0)) return;
      const asset =
        ENEMY_ASSETS[enemy.kind] ?? ENEMY_ASSETS[i % ENEMY_ASSETS.length];
      if (!asset) return;
      const add = (k: string | undefined, id: string) => {
        if (!k) return;
        this.load.spritesheet(this.enemyKey(i, id), `${asset.base}/${k}`, {
          frameWidth: 100,
          frameHeight: 100,
        });
      };
      add(asset.sheets.idle, "idle");
      add(asset.sheets.walk, "walk");
      add(asset.sheets.hurt, "hurt");
      add(asset.sheets.death, "death");
      add(asset.sheets.atk1, "atk1");
      add(asset.sheets.atk2, "atk2");
      add((asset.sheets as any).atk3, "atk3");
    });

    await new Promise<void>((resolve) => {
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      this.load.start();
    });
  }

  private ensureAnim(key: string, srcKey: string, fps = 14) {
    if (!this.textures.exists(srcKey)) return;
    if (this.anims.exists(key)) return;
    const frames = this.sheetFrames(srcKey);
    if (!frames) return;

    this.anims.create({
      key,
      frames: this.anims.generateFrameNumbers(srcKey, {
        start: 0,
        end: frames - 1,
      }),
      frameRate: fps,
      repeat: key.endsWith(":idle") || key.endsWith(":walk") ? -1 : 0,
    });
  }

  private createAllAnimsForEncounter(state: ChainCombat) {
    // HEROES
    state.heroes.forEach((_h, i) => {
      const base = `H${i}`;
      ["idle", "walk", "hurt", "death", "atk1", "atk2", "atk3"].forEach((p) => {
        this.ensureAnim(`${base}:${p}`, `${base}:${p}`);
      });
      // VFX
      ["vfx_atk1", "vfx_atk2", "vfx_atk3"].forEach((p) => {
        const k = `${base}:${p}`;
        if (this.textures.exists(k)) {
          const animK = `${k}:once`;
          if (!this.anims.exists(animK)) {
            const frames = this.sheetFrames(k);
            this.anims.create({
              key: animK,
              frames: this.anims.generateFrameNumbers(k, {
                start: 0,
                end: frames - 1,
              }),
              frameRate: 14,
              repeat: 0,
            });
          }
        }
      });
    });

    // ENEMIES — match actual deployed slots
    state.enemies.forEach((_enemy, i) => {
      const base = `E${i}`;
      ["idle", "walk", "hurt", "death", "atk1", "atk2", "atk3"].forEach((p) => {
        this.ensureAnim(`${base}:${p}`, `${base}:${p}`);
      });
    });
  }
}

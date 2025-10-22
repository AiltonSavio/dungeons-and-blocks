import type Phaser from "phaser";
import type { Inventory } from "../state/inventory";
import { resolveItem, type ItemId } from "../state/items";
import type { LootReward } from "../state/loot";

export type LootModalCallbacks = {
  onComplete: () => void;
  onTakeItem: (id: ItemId, quantity: number) => boolean;
};

export class LootModal {
  private readonly scene: Phaser.Scene;
  private readonly callbacks: LootModalCallbacks;
  private readonly rewards: LootReward;
  private overlay?: Phaser.GameObjects.Rectangle;
  private container?: Phaser.GameObjects.Container;
  private chest?: Phaser.GameObjects.Image;
  private textGroup: Phaser.GameObjects.Container | null = null;
  private opened = false;

  constructor(
    scene: Phaser.Scene,
    rewards: LootReward,
    callbacks: LootModalCallbacks
  ) {
    this.scene = scene;
    this.rewards = rewards;
    this.callbacks = callbacks;
  }

  show() {
    const { width, height } = this.scene.scale;
    this.overlay = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.85)
      .setOrigin(0)
      .setDepth(2500)
      .setInteractive();

    this.container = this.scene.add
      .container(width / 2, height / 2)
      .setDepth(2510);

    const panel = this.scene.add
      .rectangle(0, 20, 420, 360, 0x0f1119, 0.95)
      .setStrokeStyle(2, 0x313646, 1)
      .setOrigin(0.5);
    this.container.add(panel);

    this.chest = this.scene.add
      .image(0, -80, "loot_chest_01")
      .setOrigin(0.5)
      .setScale(2.2);
    this.container.add(this.chest);

    this.scene.time.delayedCall(200, () =>
      this.chest?.setTexture("loot_chest_02")
    );
    this.scene.time.delayedCall(400, () =>
      this.chest?.setTexture("loot_chest_03")
    );
    this.scene.time.delayedCall(600, () => {
      this.spawnLootList();
      this.opened = true;
    });

    this.scene.input.keyboard
      ?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
      .once("down", () => {
        this.close();
      });
  }

  destroy() {
    this.overlay?.destroy();
    this.container?.destroy(true);
    this.textGroup?.destroy(true);
    this.overlay = undefined;
    this.container = undefined;
    this.chest = undefined;
    this.textGroup = null;
  }

  private spawnLootList() {
    if (!this.container) return;
    const items = this.rewards.items;

    this.textGroup = this.scene.add.container(-160, 20);
    this.container.add(this.textGroup);

    let offsetY = 0;

    items.forEach((reward) => {
      const itemName = resolveItem(reward.id).name;
      const row = this.createLootRow(
        `• ${reward.quantity} × ${itemName}`,
        () => {
          const success = this.callbacks.onTakeItem(reward.id, reward.quantity);
          if (!success) {
            this.scene.sound?.play("deny", { volume: 0.2 });
            return;
          }
          row.setText("Item collected");
          row.disableInteractive();
        }
      );
      row.setPosition(0, offsetY);
      this.textGroup?.add(row);
      offsetY += 36;
    });

    const closeHint = this.scene.add
      .text(0, offsetY + 32, "Press ESC to continue", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "16px",
        color: "#cbd2e1",
      })
      .setOrigin(0, 0.5);
    this.textGroup?.add(closeHint);
  }

  private createLootRow(text: string, handler: () => void) {
    const label = this.scene.add
      .text(0, 0, text, {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "18px",
        color: "#f4f6fd",
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    label.on("pointerdown", handler);
    label.on("pointerover", () => label.setColor("#ffe28a"));
    label.on("pointerout", () => label.setColor("#f4f6fd"));
    return label;
  }

  private close() {
    if (!this.opened) return;
    this.callbacks.onComplete();
    this.destroy();
  }
}

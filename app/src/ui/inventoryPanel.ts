import type Phaser from "phaser";
import type { Inventory } from "../state/inventory";
import type { InventorySlot } from "../state/items";

export type InventoryCallbacks = {
  onUse: (slotIndex: number) => void;
  onDiscard: (slotIndex: number) => void;
};

export class InventoryPanel {
  private readonly scene: Phaser.Scene;
  private readonly inventory: Inventory;
  private readonly callbacks: InventoryCallbacks;
  private readonly container: Phaser.GameObjects.Container;
  private panelHeight = 0;
  private slotSprites: {
    frame: Phaser.GameObjects.Rectangle;
    icon?: Phaser.GameObjects.GameObject;
    label?: Phaser.GameObjects.Text;
    count?: Phaser.GameObjects.Text;
  }[] = [];

  constructor(
    scene: Phaser.Scene,
    inventory: Inventory,
    callbacks: InventoryCallbacks,
    parentLayer?: Phaser.GameObjects.Layer
  ) {
    this.scene = scene;
    this.inventory = inventory;
    this.callbacks = callbacks;
    this.container = scene.add.container(32, scene.scale.height - 180);
    this.container.setDepth(1500);
    this.container.setScrollFactor(0);
    if (parentLayer) parentLayer.add(this.container);
    this.build();
    this.container.setY(this.scene.scale.height - this.panelHeight - 32);
    scene.scale.on("resize", this.onResize);
  }

  destroy() {
    this.scene.scale.off("resize", this.onResize);
    this.container.destroy(true);
    this.slotSprites = [];
  }

  private build() {
    const slots = this.inventory.getSlots().length;
    const cols = 3;
    const rows = Math.ceil(slots / cols);
    const spacing = 78;
    const padding = 16;

    const width = cols * spacing + padding;
    const height = rows * spacing + padding;
    this.panelHeight = height;

    this.container.add(
      this.scene.add
        .rectangle(width / 2, height / 2, width, height, 0x0b0e16, 0.72)
        .setStrokeStyle(2, 0x262a36, 1)
        .setOrigin(0.5)
    );

    for (let i = 0; i < slots; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = padding / 2 + col * spacing;
      const y = padding / 2 + row * spacing;

      const frame = this.scene.add
        .rectangle(x, y, 68, 68, 0x141923, 0.8)
        .setStrokeStyle(1, 0x2f3547, 1)
        .setOrigin(0);
      frame.setInteractive({ useHandCursor: true });
      frame.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) {
          this.callbacks.onDiscard(i);
        } else {
          this.callbacks.onUse(i);
        }
      });

      this.container.add(frame);
      this.slotSprites.push({ frame });
    }

    this.refresh();
  }

  refresh() {
    const slots = this.inventory.getSlots();
    this.slotSprites.forEach((slotUI, index) => {
      const data = slots[index];
      slotUI.icon?.destroy();
      slotUI.label?.destroy();
      slotUI.count?.destroy();
      slotUI.icon = undefined;
      slotUI.label = undefined;
      slotUI.count = undefined;

      if (!data) return;
      this.populateSlot(slotUI, data);
    });
  }

  private populateSlot(
    slotUI: {
      frame: Phaser.GameObjects.Rectangle;
      icon?: Phaser.GameObjects.GameObject;
      label?: Phaser.GameObjects.Text;
      count?: Phaser.GameObjects.Text;
    },
    slot: InventorySlot
  ) {
    if (!slot) return;
    const baseX = slotUI.frame.x + 4;
    const baseY = slotUI.frame.y + 4;

    slotUI.label = this.scene.add
      .text(baseX + 3, baseY + 2, slot.def.name, {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "10px",
        color: "#d5d8e4",
        wordWrap: { width: 60 },
      })
      .setOrigin(0, 0);
    this.container.add(slotUI.label);

    slotUI.count = this.scene.add
      .text(baseX + 50, baseY + 46, `x${slot.quantity}`, {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "12px",
        color: "#9db4d4",
      })
      .setOrigin(1, 1);
    this.container.add(slotUI.count);

    const rect = this.scene.add
      .rectangle(baseX + 26, baseY + 30, 36, 24, 0x516079, 1)
      .setOrigin(0.5);
    slotUI.icon = rect;
    this.container.add(rect);
  }

  private onResize = () => {
    const { height } = this.scene.scale;
    this.container.setPosition(32, height - this.panelHeight - 32);
  };
}

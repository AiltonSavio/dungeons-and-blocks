import Phaser from "phaser";

export type ChestLootRow = {
  slotIndex: number;
  itemKey: number;
  quantity: number;
  label: string;
};

export type ChestInventoryRow = {
  slotIndex: number;
  itemKey: number;
  quantity: number;
  label: string;
};

export type ChestLootSelection = {
  take: { slotIndex: number; itemKey: number; quantity: number }[];
  drop: { slotIndex: number; itemKey: number; quantity: number }[];
};

export type ChestLootModalCallbacks = {
  onConfirm: (
    selection: ChestLootSelection
  ) => Promise<{ success: boolean; error?: string }>;
  onPickAll: () => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
};

export class ChestLootModal {
  private readonly scene: Phaser.Scene;
  private readonly loot: ChestLootRow[];
  private readonly inventory: ChestInventoryRow[];
  private readonly callbacks: ChestLootModalCallbacks;

  private overlay?: Phaser.GameObjects.Rectangle;
  private container?: Phaser.GameObjects.Container;
  private errorText?: Phaser.GameObjects.Text;

  private readonly selectedLoot = new Set<number>();
  private readonly selectedDrops = new Set<number>();

  constructor(
    scene: Phaser.Scene,
    loot: ChestLootRow[],
    inventory: ChestInventoryRow[],
    callbacks: ChestLootModalCallbacks
  ) {
    this.scene = scene;
    this.loot = loot;
    this.inventory = inventory;
    this.callbacks = callbacks;
  }

  show() {
    const { width, height } = this.scene.scale;

    this.overlay = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.75)
      .setOrigin(0)
      .setDepth(2000)
      .setInteractive();

    this.container = this.scene.add
      .container(width / 2, height / 2)
      .setDepth(2010);

    const panelWidth = 520;
    const panelHeight = 440;

    const panelBg = this.scene.add
      .rectangle(0, 0, panelWidth, panelHeight, 0x11131c, 0.95)
      .setStrokeStyle(2, 0x2b3244)
      .setOrigin(0.5);
    this.container.add(panelBg);

    const title = this.scene.add
      .text(0, -panelHeight / 2 + 32, "Chest Loot", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "24px",
        color: "#f4f6fd",
      })
      .setOrigin(0.5);
    this.container.add(title);

    const lootLabel = this.scene.add
      .text(-panelWidth / 2 + 24, -panelHeight / 2 + 74, "Loot Contents", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "18px",
        color: "#cbd2e1",
      })
      .setOrigin(0, 0.5);
    this.container.add(lootLabel);

    let cursorY = -panelHeight / 2 + 110;
    this.loot.forEach((row) => {
      const text = this.makeToggleRow({
        x: -panelWidth / 2 + 36,
        y: cursorY,
        label: row.label,
        isSelected: false,
        onToggle: (selected) => {
          if (selected) {
            this.selectedLoot.add(row.slotIndex);
          } else {
            this.selectedLoot.delete(row.slotIndex);
          }
        },
      });
      this.container?.add(text);
      cursorY += 32;
    });

    const dropsLabel = this.scene.add
      .text(
        -panelWidth / 2 + 24,
        cursorY + 16,
        "Inventory (drop to free space)",
        {
          fontFamily: "ui-sans-serif, system-ui",
          fontSize: "18px",
          color: "#cbd2e1",
        }
      )
      .setOrigin(0, 0.5);
    this.container.add(dropsLabel);

    cursorY += 50;
    this.inventory.forEach((row) => {
      const text = this.makeToggleRow({
        x: -panelWidth / 2 + 36,
        y: cursorY,
        label: row.label,
        isSelected: false,
        onToggle: (selected) => {
          if (selected) {
            this.selectedDrops.add(row.slotIndex);
          } else {
            this.selectedDrops.delete(row.slotIndex);
          }
        },
      });
      this.container?.add(text);
      cursorY += 28;
    });

    this.errorText = this.scene.add
      .text(0, panelHeight / 2 - 110, "", {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "16px",
        color: "#ff6b6b",
        align: "center",
        wordWrap: { width: panelWidth - 60 },
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.container.add(this.errorText);

    this.addButtons(panelWidth, panelHeight);
  }

  destroy() {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.container?.destroy(true);
    this.container = undefined;
  }

  private addButtons(panelWidth: number, panelHeight: number) {
    const buttonY = panelHeight / 2 - 60;
    const buttonConfig = [
      {
        label: "Pick Selected",
        x: -panelWidth / 2 + 120,
        color: 0x4ecca3,
        hover: 0x3dbb92,
        handler: () => void this.handleConfirm(),
      },
      {
        label: "Pick All",
        x: 0,
        color: 0x3498db,
        hover: 0x2f89c6,
        handler: () => void this.handlePickAll(),
      },
      {
        label: "Skip",
        x: panelWidth / 2 - 120,
        color: 0x4a4f63,
        hover: 0x3c4154,
        handler: () => this.callbacks.onClose(),
      },
    ];

    buttonConfig.forEach(({ label, x, color, hover, handler }) => {
      const btn = this.scene.add
        .rectangle(x, buttonY, 150, 44, color)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerover", () => btn.setFillStyle(hover));
      btn.on("pointerout", () => btn.setFillStyle(color));
      btn.on("pointerdown", handler);

      const text = this.scene.add
        .text(x, buttonY, label, {
          fontFamily: "ui-sans-serif, system-ui",
          fontSize: "18px",
          fontStyle: "bold",
          color: "#f4f6fd",
        })
        .setOrigin(0.5);

      this.container?.add(btn);
      this.container?.add(text);
    });
  }

  private makeToggleRow(options: {
    x: number;
    y: number;
    label: string;
    isSelected: boolean;
    onToggle: (selected: boolean) => void;
  }): Phaser.GameObjects.Text {
    const { x, y, label } = options;
    let selected = options.isSelected;

    const text = this.scene.add
      .text(x, y, this.decorateLabel(label, selected), {
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "16px",
        color: "#f4f6fd",
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });

    text.on("pointerdown", () => {
      selected = !selected;
      text.setText(this.decorateLabel(label, selected));
      options.onToggle(selected);
      this.errorText?.setVisible(false);
    });

    text.on("pointerover", () => text.setColor("#ffe28a"));
    text.on("pointerout", () => text.setColor("#f4f6fd"));

    return text;
  }

  private decorateLabel(label: string, selected: boolean): string {
    return `${selected ? "[✓]" : "[ ]"} ${label}`;
  }

  private getSelection(): ChestLootSelection {
    const take = this.loot
      .filter((row) => this.selectedLoot.has(row.slotIndex))
      .map((row) => ({
        slotIndex: row.slotIndex,
        itemKey: row.itemKey,
        quantity: row.quantity,
      }));

    const drop = this.inventory
      .filter((row) => this.selectedDrops.has(row.slotIndex))
      .map((row) => ({
        slotIndex: row.slotIndex,
        itemKey: row.itemKey,
        quantity: row.quantity,
      }));

    return { take, drop };
  }

  private async handleConfirm() {
    if (!this.callbacks.onConfirm) return;

    const result = await this.callbacks.onConfirm(this.getSelection());
    if (result.success) {
      this.callbacks.onClose();
      return;
    }

    this.showError(result.error ?? "Unable to collect loot.");
  }

  private async handlePickAll() {
    const result = await this.callbacks.onPickAll();
    if (result.success) {
      this.callbacks.onClose();
      return;
    }

    this.showError(result.error ?? "Unable to pick all items.");
  }

  private showError(message: string) {
    if (!this.errorText) return;
    this.errorText.setVisible(true);
    this.errorText.setText(message);
  }
}

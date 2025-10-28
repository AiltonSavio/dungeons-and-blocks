import {
  resolveItem,
  type InventoryItem,
  type InventorySlot,
  type ItemId,
} from "./items";

export type InventorySnapshot = {
  slots: InventorySlot[];
  capacity: number;
  gold: number;
};

export class Inventory {
  private slots: InventorySlot[];
  private readonly capacity: number;
  private gold = 0;

  constructor(capacity = 6) {
    this.capacity = capacity;
    this.slots = Array.from({ length: capacity }, () => null);
  }

  toJSON(): InventorySnapshot {
    return {
      slots: this.slots.map((slot) =>
        slot
          ? {
              def: slot.def,
              quantity: slot.quantity,
            }
          : null
      ),
      capacity: this.capacity,
      gold: this.gold,
    };
  }

  fromSnapshot(snapshot: InventorySnapshot) {
    this.gold = snapshot.gold;
    this.slots = snapshot.slots
      .slice(0, this.capacity)
      .map((slot) => (slot ? { ...slot } : null));
  }

  getGold(): number {
    return this.gold;
  }

  addGold(amount: number) {
    this.gold += Math.max(0, Math.floor(amount));
  }

  spendGold(amount: number): boolean {
    const amt = Math.max(0, Math.floor(amount));
    if (this.gold < amt) return false;
    this.gold -= amt;
    return true;
  }

  getSlots(): InventorySlot[] {
    return this.slots;
  }

  /**
   * Attempt to add an item to inventory.
   * Returns true if added, false if no slot available.
   */
  addItem(id: ItemId, quantity = 1): boolean {
    const def = resolveItem(id);
    const maxStackRaw = def.maxStack;
    const calculatedMaxStack =
      maxStackRaw === undefined
        ? 1
        : maxStackRaw === 0
        ? Number.MAX_SAFE_INTEGER
        : maxStackRaw;
    const stackable = calculatedMaxStack > 1;
    let remaining = quantity;

    if (stackable) {
      for (const slot of this.slots) {
        if (slot && slot.def.id === id) {
          const available = Math.max(0, calculatedMaxStack - slot.quantity);
          const transfer = Math.min(available, remaining);
          slot.quantity += transfer;
          remaining -= transfer;
          if (remaining <= 0) return true;
        }
      }
    }

    while (remaining > 0) {
      const target = this.slots.findIndex((s) => s === null);
      if (target === -1) return false;
      const transfer = stackable ? Math.min(calculatedMaxStack, remaining) : 1;
      this.slots[target] = {
        def,
        quantity: transfer,
      };
      remaining -= transfer;
    }

    return true;
  }

  removeSlot(index: number): InventoryItem | null {
    if (index < 0 || index >= this.slots.length) return null;
    const slot = this.slots[index];
    this.slots[index] = null;
    return slot;
  }

  decrementSlot(index: number, amount = 1): boolean {
    const slot = this.slots[index];
    if (!slot) return false;
    slot.quantity -= amount;
    if (slot.quantity <= 0) {
      this.slots[index] = null;
    }
    return true;
  }

  isFull(): boolean {
    return this.slots.every((s) => s !== null);
  }

  freeSlots(): number {
    return this.slots.filter((s) => !s).length;
  }
}

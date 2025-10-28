export type ItemId =
  | "pouch_gold"
  | "stress_tonic"
  | "minor_torch"
  | "healing_salve"
  | "mystery_relic"
  | "calming_incense"
  | "phoenix_feather";

export type ItemRarity = "common" | "uncommon" | "rare";

export type ItemDefinition = {
  id: ItemId;
  name: string;
  description: string;
  rarity: ItemRarity;
  maxStack?: number;
  usable?: boolean;
  buyPrice?: number;
  sellPrice?: number;
};

export type InventoryItem = {
  def: ItemDefinition;
  quantity: number;
};

export type InventorySlot = InventoryItem | null;

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  pouch_gold: {
    id: "pouch_gold",
    name: "Gold Pouch",
    description: "Redeem for a burst of 25 gold.",
    rarity: "common",
    usable: false,
    sellPrice: 25,
  },
  stress_tonic: {
    id: "stress_tonic",
    name: "Stress Tonic",
    description: "Consumes to clear 20 stress from all allies.",
    rarity: "uncommon",
    usable: true,
    buyPrice: 21,
    sellPrice: 10,
  },
  minor_torch: {
    id: "minor_torch",
    name: "Torch Bundle",
    description: "Adds 25 light when used.",
    rarity: "common",
    usable: true,
    buyPrice: 14,
    sellPrice: 7,
  },
  healing_salve: {
    id: "healing_salve",
    name: "Healing Salve",
    description: "Restores a small portion of a hero's HP.",
    rarity: "uncommon",
    usable: true,
    buyPrice: 32,
    sellPrice: 16,
  },
  mystery_relic: {
    id: "mystery_relic",
    name: "Ancient Relic",
    description: "Sell in town for profit. Not usable in the field.",
    rarity: "rare",
    usable: false,
    sellPrice: 70,
  },
  calming_incense: {
    id: "calming_incense",
    name: "Calming Incense",
    description: "Removes one active status effect from a hero.",
    rarity: "rare",
    usable: true,
    maxStack: 3,
    sellPrice: 45,
  },
  phoenix_feather: {
    id: "phoenix_feather",
    name: "Phoenix Feather",
    description: "Revives a fallen ally during combat with half HP.",
    rarity: "rare",
    usable: true,
    maxStack: 1,
    sellPrice: 110,
  },
};

export function resolveItem(id: ItemId): ItemDefinition {
  const def = ITEM_DEFINITIONS[id];
  if (!def) throw new Error(`Unknown item definition for ${id}`);
  return def;
}

export type InventoryItemParam = { id: keyof typeof ITEM_DEFINITIONS; qty: number };

export type InventorySlotView = {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  icon?: Phaser.GameObjects.Image;
  countBg?: Phaser.GameObjects.Rectangle;
  countText?: Phaser.GameObjects.Text;
  border?: Phaser.GameObjects.Rectangle;
  idx: number;
  id?: keyof typeof ITEM_DEFINITIONS;
  qty: number;
  usable: boolean;
};

export type SupplySlot = { itemKey: number; quantity: number };

export const ITEM_SLOT_EMPTY = 255 as const;

export const ITEM_KEY_TO_ID: Record<number, keyof typeof ITEM_DEFINITIONS | undefined> = {
  0: "pouch_gold",
  1: "stress_tonic",
  2: "minor_torch",
  3: "healing_salve",
  4: "calming_incense",
  5: "mystery_relic",
  6: "phoenix_feather",
  [ITEM_SLOT_EMPTY]: undefined, // 255 => empty
};
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

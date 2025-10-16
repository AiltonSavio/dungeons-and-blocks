import type { ItemId } from "./items";

export type LootReward = {
  gold: number;
  items: { id: ItemId; quantity: number }[];
};

export function mergeLoot(...rewards: LootReward[]): LootReward {
  const combined: LootReward = { gold: 0, items: [] };
  for (const reward of rewards) {
    combined.gold += reward.gold;
    reward.items.forEach((item) => {
      const existing = combined.items.find((i) => i.id === item.id);
      if (existing) existing.quantity += item.quantity;
      else combined.items.push({ ...item });
    });
  }
  return combined;
}

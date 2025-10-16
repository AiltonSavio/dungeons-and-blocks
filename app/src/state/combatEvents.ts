import type { LootReward } from "./loot";

export type CombatResolution = {
  victory: boolean;
  loot: LootReward;
  stressDelta: number; // applied to all party members (positive = add stress)
};

import type { HeroClassKey } from "../content/units";
import { Inventory, type InventorySnapshot } from "./inventory";

export type HeroStress = {
  cls: HeroClassKey;
  stress: number; // 0..200
};

export type RunSnapshot = {
  inventory: InventorySnapshot;
  partyStress: HeroStress[];
};

export class RunState {
  readonly inventory: Inventory;
  readonly partyStress: HeroStress[];

  constructor(partyOrder: HeroClassKey[]) {
    this.inventory = new Inventory(6);
    this.partyStress = partyOrder.map((cls) => ({
      cls,
      stress: 0,
    }));
  }

  toJSON(): RunSnapshot {
    return {
      inventory: this.inventory.toJSON(),
      partyStress: this.partyStress.map((p) => ({ ...p })),
    };
  }

  load(snapshot: RunSnapshot) {
    this.inventory.fromSnapshot(snapshot.inventory);
    snapshot.partyStress.forEach((stress) => {
      const entry = this.partyStress.find((p) => p.cls === stress.cls);
      if (entry) entry.stress = stress.stress;
    });
  }

  modifyStress(cls: HeroClassKey, delta: number) {
    const entry = this.partyStress.find((p) => p.cls === cls);
    if (!entry) return;
    entry.stress = clamp(entry.stress + delta, 0, 200);
  }

  setStress(cls: HeroClassKey, value: number) {
    const entry = this.partyStress.find((p) => p.cls === cls);
    if (!entry) return;
    entry.stress = clamp(value, 0, 200);
  }

  getStress(cls: HeroClassKey): number {
    const entry = this.partyStress.find((p) => p.cls === cls);
    return entry ? entry.stress : 0;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

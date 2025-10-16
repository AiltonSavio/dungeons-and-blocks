export type UnitAnimationSheets = {
  idle: string;
  walk?: string;
  hurt: string;
  death: string;
  atk1?: string;
  atk2?: string;
  atk3?: string;
};

export type UnitVfxSheets = {
  atk1?: string;
  atk2?: string;
  atk3?: string;
};

export type UnitAssets = {
  name: string;
  base: string;
  sheets: UnitAnimationSheets;
  vfx?: UnitVfxSheets;
  scale?: number;
  faceRight?: boolean;
};

export type CombatData = {
  torchPercent: number;
  heroes: UnitAssets[];
  enemies: UnitAssets[];
};

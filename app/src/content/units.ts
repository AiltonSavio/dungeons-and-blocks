import type { UnitAssets } from "../combat/types";
import type { HeroClass } from "../state/models";

export type HeroClassKey =
  | "archer"
  | "armoredAxeman"
  | "knight"
  | "knightTemplar"
  | "priest"
  | "soldier"
  | "swordsman"
  | "wizard";

export const HERO_CLASS_TO_KEY: Record<HeroClass, HeroClassKey> = {
  Archer: "archer",
  "Armored Axeman": "armoredAxeman",
  Knight: "knight",
  "Knight Templar": "knightTemplar",
  Priest: "priest",
  Soldier: "soldier",
  Swordsman: "swordsman",
  Wizard: "wizard",
};

export const HERO_KEY_TO_CLASS: Record<HeroClassKey, HeroClass> = {
  archer: "Archer",
  armoredAxeman: "Armored Axeman",
  knight: "Knight",
  knightTemplar: "Knight Templar",
  priest: "Priest",
  soldier: "Soldier",
  swordsman: "Swordsman",
  wizard: "Wizard",
};

export const PARTY_ORDER: HeroClassKey[] = [
  "knight",
  "knightTemplar",
  "wizard",
  "priest",
];

export const HERO_SHEETS: Record<HeroClassKey, { idle: string; walk: string }> =
  {
    archer: {
      idle: "assets/heroes/Archer/Archer with shadows/Archer-Idle.png",
      walk: "assets/heroes/Archer/Archer with shadows/Archer-Walk.png",
    },
    armoredAxeman: {
      idle: "assets/heroes/Armored Axeman/Armored Axeman with shadows/Armored Axeman-Idle.png",
      walk: "assets/heroes/Armored Axeman/Armored Axeman with shadows/Armored Axeman-Walk.png",
    },
    knight: {
      idle: "assets/heroes/Knight/Knight with shadows/Knight-Idle.png",
      walk: "assets/heroes/Knight/Knight with shadows/Knight-Walk.png",
    },
    knightTemplar: {
      idle: "assets/heroes/Knight Templar/Knight Templar with shadows/Knight Templar-Idle.png",
      walk: "assets/heroes/Knight Templar/Knight Templar with shadows/Knight Templar-Walk01.png",
    },
    priest: {
      idle: "assets/heroes/Priest/Priest with shadows/Priest-Idle.png",
      walk: "assets/heroes/Priest/Priest with shadows/Priest-Walk.png",
    },
    soldier: {
      idle: "assets/heroes/Soldier/Soldier with shadows/Soldier-Idle.png",
      walk: "assets/heroes/Soldier/Soldier with shadows/Soldier-Walk.png",
    },
    swordsman: {
      idle: "assets/heroes/Swordsman/Swordsman with shadows/Swordsman-Idle.png",
      walk: "assets/heroes/Swordsman/Swordsman with shadows/Swordsman-Walk.png",
    },
    wizard: {
      idle: "assets/heroes/Wizard/Wizard with shadows/Wizard-Idle.png",
      walk: "assets/heroes/Wizard/Wizard with shadows/Wizard-Walk.png",
    },
  };

export const HERO_ANIM_KEYS = {
  idle: (cls: HeroClassKey) => `${cls}_idle`,
  walk: (cls: HeroClassKey) => `${cls}_walk`,
};

export const HERO_ASSETS: Record<HeroClassKey, UnitAssets> = {
  archer: {
    name: "Archer",
    base: "assets/heroes/Archer/Archer with shadows",
    sheets: {
      idle: "Archer-Idle.png",
      walk: "Archer-Walk.png",
      hurt: "Archer-Hurt.png",
      death: "Archer-Death.png",
      atk1: "Archer-Attack01.png",
      atk2: "Archer-Attack02.png",
    },
    scale: 1.0,
    faceRight: true,
  },
  armoredAxeman: {
    name: "Armored Axeman",
    base: "assets/heroes/Armored Axeman/Armored Axeman with shadows",
    sheets: {
      idle: "Armored Axeman-Idle.png",
      walk: "Armored Axeman-Walk.png",
      hurt: "Armored Axeman-Hurt.png",
      death: "Armored Axeman-Death.png",
      atk1: "Armored Axeman-Attack01.png",
      atk2: "Armored Axeman-Attack02.png",
      atk3: "Armored Axeman-Attack03.png",
    },
    scale: 1.0,
    faceRight: true,
  },
  knight: {
    name: "Knight",
    base: "assets/heroes/Knight/Knight with shadows",
    sheets: {
      idle: "Knight-Idle.png",
      walk: "Knight-Walk.png",
      hurt: "Knight-Hurt.png",
      death: "Knight-Death.png",
      atk1: "Knight-Attack01.png",
      atk2: "Knight-Attack02.png",
      atk3: "Knight-Attack03.png",
    },
    scale: 1.0,
    faceRight: true,
  },
  knightTemplar: {
    name: "Knight Templar",
    base: "assets/heroes/Knight Templar/Knight Templar with shadows",
    sheets: {
      idle: "Knight Templar-Idle.png",
      walk: "Knight Templar-Walk01.png",
      hurt: "Knight Templar-Hurt.png",
      death: "Knight Templar-Death.png",
      atk1: "Knight Templar-Attack01.png",
      atk2: "Knight Templar-Attack02.png",
      atk3: "Knight Templar-Attack03.png",
    },
    scale: 1.0,
    faceRight: true,
  },
  priest: {
    name: "Priest",
    base: "assets/heroes/Priest/Priest with shadows",
    sheets: {
      idle: "Priest-Idle.png",
      walk: "Priest-Walk.png",
      hurt: "Priest-Hurt.png",
      death: "Priest-Death.png",
      atk1: "Priest-Attack.png",
      atk2: "Priest-Attack.png",
      atk3: "Priest-Heal.png",
    },
    vfx: {
      atk2: "../Magic(projectile)/Priest-Attack_Effect.png",
      atk3: "../Magic(projectile)/Priest-Heal_Effect.png",
    },
    scale: 1.0,
    faceRight: true,
  },
  soldier: {
    name: "Soldier",
    base: "assets/heroes/Soldier/Soldier with shadows",
    sheets: {
      idle: "Soldier-Idle.png",
      walk: "Soldier-Walk.png",
      hurt: "Soldier-Hurt.png",
      death: "Soldier-Death.png",
      atk1: "Soldier-Attack01.png",
      atk2: "Soldier-Attack02.png",
      atk3: "Soldier-Attack03.png",
    },
    scale: 1.0,
    faceRight: true,
  },
  swordsman: {
    name: "Swordsman",
    base: "assets/heroes/Swordsman/Swordsman with shadows",
    sheets: {
      idle: "Swordsman-Idle.png",
      walk: "Swordsman-Walk.png",
      hurt: "Swordsman-Hurt.png",
      death: "Swordsman-Death.png",
      atk1: "Swordsman-Attack01.png",
      atk2: "Swordsman-Attack02.png",
      atk3: "Swordsman-Attack3.png",
    },
    scale: 1.0,
    faceRight: true,
  },
  wizard: {
    name: "Wizard",
    base: "assets/heroes/Wizard/Wizard with shadows",
    sheets: {
      idle: "Wizard-Idle.png",
      walk: "Wizard-Walk.png",
      hurt: "Wizard-Hurt.png",
      death: "Wizard-DEATH.png",
      atk1: "Wizard-Attack01.png",
      atk2: "Wizard-Attack02.png",
    },
    vfx: {
      atk1: "../Magic(projectile)/Wizard-Attack01_Effect.png",
      atk2: "../Magic(projectile)/Wizard-Attack02_Effect.png",
    },
    scale: 1.0,
    faceRight: true,
  },
};

export const ENEMY_ASSETS: UnitAssets[] = [
  {
    name: "Orc",
    base: "assets/enemies/Orc/Orc with shadows",
    sheets: {
      idle: "Orc-Idle.png",
      walk: "Orc-Walk.png",
      hurt: "Orc-Hurt.png",
      death: "Orc-Death.png",
      atk1: "Orc-Attack01.png",
      atk2: "Orc-Attack02.png",
    },
    scale: 1.05,
    faceRight: false,
  },
  {
    name: "Skeleton",
    base: "assets/enemies/Skeleton/Skeleton with shadows",
    sheets: {
      idle: "Skeleton-Idle.png",
      walk: "Skeleton-Walk.png",
      hurt: "Skeleton-Hurt.png",
      death: "Skeleton-Death.png",
      atk1: "Skeleton-Attack01.png",
      atk2: "Skeleton-Attack02.png",
    },
    scale: 1.0,
    faceRight: false,
  },
  {
    name: "Skeleton Archer",
    base: "assets/enemies/Skeleton Archer/Skeleton Archer with shadows",
    sheets: {
      idle: "Skeleton Archer-Idle.png",
      walk: "Skeleton Archer-Walk.png",
      hurt: "Skeleton Archer-Hurt.png",
      death: "Skeleton Archer-Death.png",
      atk1: "Skeleton Archer-Attack.png",
    },
    scale: 1.0,
    faceRight: false,
  },
  {
    name: "Armored Orc",
    base: "assets/enemies/Armored Orc/Armored Orc with shadows",
    sheets: {
      idle: "Armored Orc-Idle.png",
      walk: "Armored Orc-Walk.png",
      hurt: "Armored Orc-Hurt.png",
      death: "Armored Orc-Death.png",
      atk1: "Armored Orc-Attack01.png",
      atk2: "Armored Orc-Attack02.png",
      atk3: "Armored Orc-Attack03.png",
    },
    scale: 1.1,
    faceRight: false,
  },
  {
    name: "Armored Skeleton",
    base: "assets/enemies/Armored Skeleton/Armored Skeleton with shadows",
    sheets: {
      idle: "Armored Skeleton-Idle.png",
      walk: "Armored Skeleton-Walk.png",
      hurt: "Armored Skeleton-Hurt.png",
      death: "Armored Skeleton-Death.png",
      atk1: "Armored Skeleton-Attack01.png",
      atk2: "Armored Skeleton-Attack02.png",
    },
    scale: 1.0,
    faceRight: false,
  },
  {
    name: "Elite Orc",
    base: "assets/enemies/Elite Orc/Elite Orc with shadows",
    sheets: {
      idle: "Elite Orc-Idle.png",
      walk: "Elite Orc-Walk.png",
      hurt: "Elite Orc-Hurt.png",
      death: "Elite Orc-Death.png",
      atk1: "Elite Orc-Attack01.png",
      atk2: "Elite Orc-Attack02.png",
      atk3: "Elite Orc-Attack03.png",
    },
    scale: 1.08,
    faceRight: false,
  },
  {
    name: "Greatsword Skeleton",
    base: "assets/enemies/Greatsword Skeleton/Greatsword Skeleton with shadows",
    sheets: {
      idle: "Greatsword Skeleton-Idle.png",
      walk: "Greatsword Skeleton-Walk.png",
      hurt: "Greatsword Skeleton-Hurt.png",
      death: "Greatsword Skeleton-Death.png",
      atk1: "Greatsword Skeleton-Attack01.png",
      atk2: "Greatsword Skeleton-Attack02.png",
      atk3: "Greatsword Skeleton-Attack03.png",
    },
    scale: 1.0,
    faceRight: false,
  },
  {
    name: "Orc Rider",
    base: "assets/enemies/Orc rider/Orc rider with shadows",
    sheets: {
      idle: "Orc rider-Idle.png",
      walk: "Orc rider-Walk.png",
      hurt: "Orc rider-Hurt.png",
      death: "Orc rider-Death.png",
      atk1: "Orc rider-Attack01.png",
      atk2: "Orc rider-Attack02.png",
      atk3: "Orc rider-Attack03.png",
    },
    scale: 1.15,
    faceRight: false,
  },
  {
    name: "Slime",
    base: "assets/enemies/Slime/Slime with shadows",
    sheets: {
      idle: "Slime-Idle.png",
      walk: "Slime-Walk.png",
      hurt: "Slime-Hurt.png",
      death: "Slime-Death.png",
      atk1: "Slime-Attack01.png",
      atk2: "Slime-Attack02.png",
    },
    scale: 0.95,
    faceRight: false,
  },
  {
    name: "Werebear",
    base: "assets/enemies/Werebear/Werebear with shadows",
    sheets: {
      idle: "Werebear-Idle.png",
      walk: "Werebear-Walk.png",
      hurt: "Werebear-Hurt.png",
      death: "Werebear-Death.png",
      atk1: "Werebear-Attack01.png",
      atk2: "Werebear-Attack02.png",
      atk3: "Werebear-Attack03.png",
    },
    scale: 1.15,
    faceRight: false,
  },
  {
    name: "Werewolf",
    base: "assets/enemies/Werewolf/Werewolf with shadows",
    sheets: {
      idle: "Werewolf-Idle.png",
      walk: "Werewolf-Walk.png",
      hurt: "Werewolf-Hurt.png",
      death: "Werewolf-Death.png",
      atk1: "Werewolf-Attack01.png",
      atk2: "Werewolf-Attack02.png",
    },
    scale: 1.1,
    faceRight: false,
  },
];

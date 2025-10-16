export type HeroClass =
  | "Archer"
  | "Armored Axeman"
  | "Knight"
  | "Knight Templar"
  | "Priest"
  | "Soldier"
  | "Swordsman"
  | "Wizard";

export type Element = "fire" | "ice" | "holy" | "shadow";

export type HeroCoreStats = {
  hpMax: number;
  atk: number;
  def: number;
  mag: number;
  res: number;
  spd: number;
  lck: number;
  sta: number;
};

export type DamageRange = {
  min: number;
  max: number;
};

export type HeroDerivedStats = {
  accuracy: number;
  critChance: number;
  dodge: number;
  physicalDamage: DamageRange;
  magicDamage: DamageRange;
  armorPen: number;
  initiative: number;
  debuffResist: number;
};

export type TraitCategory = "virtue" | "affliction" | "quirk" | "disease";

export type HeroTraitCondition =
  | { type: "always" }
  | { type: "hpBelowPercent"; threshold: number }
  | { type: "hpAbovePercent"; threshold: number }
  | { type: "stressAbove"; threshold: number }
  | { type: "stressBelow"; threshold: number }
  | { type: "torchBelow"; threshold: number };

export type HeroStatKey = keyof HeroCoreStats | keyof HeroDerivedStats;

export type TraitModifier = {
  stat: HeroStatKey;
  operation: "add" | "multiply";
  value: number;
  condition?: HeroTraitCondition;
};

export type HeroTrait = {
  id: string;
  name: string;
  category: TraitCategory;
  description: string;
  modifiers?: TraitModifier[];
};

export type HeroSkill = {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  level: number;
  owned: boolean;
  classRestriction: HeroClass;
};

export type StatusEffectId =
  | "bleeding"
  | "poison"
  | "stun"
  | "burn"
  | "chill"
  | "curse"
  | "mark"
  | "taunt";

export type StatusStackingRule = "refresh" | "stack" | "extend";

export type StatusEffectDefinition = {
  id: StatusEffectId;
  name: string;
  baseDuration: number;
  maxStacks: number;
  stacking: StatusStackingRule;
  tags: ("damage" | "control" | "debuff" | "mark")[];
};

export type StatusEffectInstance = {
  id: StatusEffectId;
  duration: number;
  stacks: number;
};

export type HeroStatusFlags = {
  blessed?: boolean;
  blessingPending?: boolean;
  wounded?: boolean;
  diseased?: boolean;
};

export type HeroStatus = {
  flags: HeroStatusFlags;
  effects: StatusEffectInstance[];
};

export type ElementalProfile = {
  offense: Record<Element, number>;
  resistance: Record<Element, number>;
};

export type Hero = {
  id: string;
  name: string;
  cls: HeroClass;
  level: number;
  coreStats: HeroCoreStats;
  hp: number;
  maxHp: number;
  stress: number;
  weaponLevel: number;
  armorLevel: number;
  traits: HeroTrait[];
  diseases: HeroTrait[];
  skills: HeroSkill[];
  activeSkillIds: string[];
  statuses: HeroStatus;
  elemental: ElementalProfile;
};

export type ItemId =
  | "torch"
  | "potion"
  | "bandage"
  | "antidote"
  | "elixir"
  | "food";

export type ItemDefinition = {
  id: ItemId;
  name: string;
  description: string;
  buyPrice: number;
  sellPrice: number;
};

export type Inventory = {
  gold: number;
  items: Record<ItemId, number>;
};

export type CustomDungeon = {
  id: string;
  name: string;
  difficulty: number;
  seed: string;
  description: string;
};

export type CommunityDungeon = CustomDungeon & {
  author: string;
  likes: number;
};

export type TownState = {
  heroes: Hero[];
  inventory: Inventory;
  customDungeons: CustomDungeon[];
  lastCommunityUpdate: number;
  suppliesReserve: Record<ItemId, number>;
};

export const MARKET_ITEMS: ItemDefinition[] = [
  {
    id: "torch",
    name: "Torch Bundle",
    description: "Keeps the darkness at bay.",
    buyPrice: 20,
    sellPrice: 8,
  },
  {
    id: "potion",
    name: "Healing Potion",
    description: "Restores a modest amount of vitality.",
    buyPrice: 30,
    sellPrice: 12,
  },
  {
    id: "bandage",
    name: "Sterile Bandage",
    description: "Stops bleeding and minor wounds.",
    buyPrice: 18,
    sellPrice: 7,
  },
  {
    id: "antidote",
    name: "Antidote",
    description: "Removes common poisons.",
    buyPrice: 24,
    sellPrice: 10,
  },
  {
    id: "elixir",
    name: "Arcane Elixir",
    description: "Boosts magical aptitude temporarily.",
    buyPrice: 45,
    sellPrice: 16,
  },
  {
    id: "food",
    name: "Provision Crate",
    description: "Useful for camping and morale.",
    buyPrice: 15,
    sellPrice: 6,
  },
];

export const HERO_CLASS_PALETTE: Record<HeroClass, number> = {
  Archer: 0x9cc7ff,
  "Armored Axeman": 0xffa46d,
  Knight: 0x8aa5ff,
  "Knight Templar": 0xf0c674,
  Priest: 0xffd3a8,
  Soldier: 0xc5d68b,
  Swordsman: 0xbb9bff,
  Wizard: 0xb082ff,
};

export const MAX_HEROES = 20;
export const MAX_ACTIVE_SKILLS = 3;

export type StoreResult = {
  ok: boolean;
  message?: string;
};

import { ITEM_DEFINITIONS } from "./items";
import type { ItemDefinition, ItemId } from "./items";

export type { ItemDefinition, ItemId } from "./items";

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

export type StatusEffectId = "bleeding" | "poison" | "burn" | "chill";

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
  customDungeons: CustomDungeon[];
  lastCommunityUpdate: number;
};

export const MARKET_ITEMS: ItemDefinition[] = [
  { ...ITEM_DEFINITIONS.stress_tonic },
  { ...ITEM_DEFINITIONS.minor_torch },
  { ...ITEM_DEFINITIONS.healing_salve },
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

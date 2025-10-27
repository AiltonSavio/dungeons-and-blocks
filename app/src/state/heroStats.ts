import {
  type Element,
  type ElementalProfile,
  type Hero,
  type HeroCoreStats,
  type HeroDerivedStats,
  type HeroStatKey,
  type HeroStatus,
  type HeroTrait,
  type StatusEffectDefinition,
  type StatusEffectId,
  type TraitModifier,
} from "./models";
import type { HeroClass } from "./models";

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type DerivedStatsOptions = {
  torchPercent?: number;
};

const ZERO_ELEMENTAL: Record<Element, number> = {
  fire: 0,
  ice: 0,
  holy: 0,
  shadow: 0,
};

export const DEFAULT_ELEMENTAL_PROFILE: ElementalProfile = {
  offense: { ...ZERO_ELEMENTAL },
  resistance: { ...ZERO_ELEMENTAL },
};

export const HERO_BASE_CORE_STATS: Record<HeroClass, HeroCoreStats> = {
  Archer: {
    hpMax: 34,
    atk: 12,
    def: 6,
    mag: 6,
    res: 6,
    spd: 12,
    lck: 10,
    sta: 9,
  },
  "Armored Axeman": {
    hpMax: 46,
    atk: 15,
    def: 10,
    mag: 4,
    res: 8,
    spd: 8,
    lck: 6,
    sta: 11,
  },
  Knight: {
    hpMax: 42,
    atk: 13,
    def: 12,
    mag: 5,
    res: 9,
    spd: 7,
    lck: 7,
    sta: 12,
  },
  "Knight Templar": {
    hpMax: 40,
    atk: 12,
    def: 11,
    mag: 8,
    res: 11,
    spd: 7,
    lck: 6,
    sta: 11,
  },
  Priest: {
    hpMax: 32,
    atk: 7,
    def: 6,
    mag: 15,
    res: 14,
    spd: 8,
    lck: 9,
    sta: 8,
  },
  Soldier: {
    hpMax: 44,
    atk: 14,
    def: 10,
    mag: 5,
    res: 7,
    spd: 9,
    lck: 6,
    sta: 11,
  },
  Swordsman: {
    hpMax: 36,
    atk: 13,
    def: 8,
    mag: 6,
    res: 7,
    spd: 11,
    lck: 9,
    sta: 10,
  },
  Wizard: {
    hpMax: 28,
    atk: 6,
    def: 5,
    mag: 17,
    res: 12,
    spd: 9,
    lck: 10,
    sta: 7,
  },
};

export const HERO_ELEMENTAL_PROFILES: Record<HeroClass, ElementalProfile> = {
  Archer: {
    offense: { fire: 5, ice: 0, holy: 0, shadow: 0 },
    resistance: { fire: 0, ice: 5, holy: 0, shadow: 0 },
  },
  "Armored Axeman": {
    offense: { fire: 0, ice: 0, holy: 0, shadow: 5 },
    resistance: { fire: 5, ice: 0, holy: 0, shadow: -5 },
  },
  Knight: {
    offense: { fire: 0, ice: 0, holy: 6, shadow: 0 },
    resistance: { fire: 5, ice: 5, holy: 8, shadow: -4 },
  },
  "Knight Templar": {
    offense: { fire: 0, ice: 0, holy: 10, shadow: -4 },
    resistance: { fire: 6, ice: 4, holy: 12, shadow: -6 },
  },
  Priest: {
    offense: { fire: 0, ice: 0, holy: 12, shadow: -6 },
    resistance: { fire: 4, ice: 6, holy: 14, shadow: -8 },
  },
  Soldier: {
    offense: { fire: 4, ice: 0, holy: 0, shadow: 0 },
    resistance: { fire: 6, ice: 2, holy: 0, shadow: 0 },
  },
  Swordsman: {
    offense: { fire: 0, ice: 5, holy: 0, shadow: 0 },
    resistance: { fire: 0, ice: 4, holy: 0, shadow: 0 },
  },
  Wizard: {
    offense: { fire: 10, ice: 10, holy: 0, shadow: 6 },
    resistance: { fire: 4, ice: 6, holy: 2, shadow: 4 },
  },
};

export const STATUS_EFFECT_LIBRARY: Record<
  StatusEffectId,
  StatusEffectDefinition
> = {
  bleeding: {
    id: "bleeding",
    name: "Bleeding",
    baseDuration: 3,
    maxStacks: 3,
    stacking: "stack",
    tags: ["damage", "debuff"],
  },
  poison: {
    id: "poison",
    name: "Poison",
    baseDuration: 4,
    maxStacks: 5,
    stacking: "stack",
    tags: ["damage", "debuff"],
  },
  burn: {
    id: "burn",
    name: "Burn",
    baseDuration: 3,
    maxStacks: 2,
    stacking: "extend",
    tags: ["damage", "debuff"],
  },
  chill: {
    id: "chill",
    name: "Chill",
    baseDuration: 2,
    maxStacks: 3,
    stacking: "stack",
    tags: ["debuff"],
  },
};

const STATUS_EFFECT_DERIVED_MODIFIERS: Record<
  StatusEffectId,
  Partial<Record<HeroStatKey, number>>
> = {
  bleeding: { dodge: -4 },
  poison: { dodge: -2, debuffResist: -5 },
  burn: { dodge: -3, accuracy: -3 },
  chill: { dodge: -4, initiative: -8 },
};

const TORCH_BANDS = [
  { min: 75, accuracy: 4, critChance: 2, dodge: 2, debuffResist: 4 },
  { min: 50, accuracy: 0, critChance: 0, dodge: 0, debuffResist: 0 },
  { min: 25, accuracy: -6, critChance: 2, dodge: -4, debuffResist: -4 },
  { min: 0, accuracy: -12, critChance: 4, dodge: -8, debuffResist: -8 },
] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const applyModifier = (
  target: Mutable<HeroDerivedStats>,
  key: HeroStatKey,
  value: number
) => {
  switch (key) {
    case "accuracy":
    case "critChance":
    case "dodge":
    case "armorPen":
    case "initiative":
    case "debuffResist":
      target[key] += value;
      break;
    case "physicalDamage":
    case "magicDamage":
      target[key].min = Math.max(0, target[key].min + value);
      target[key].max = Math.max(target[key].min, target[key].max + value);
      break;
    case "hpMax":
      // hpMax adjustments are reflected on the hero core stats, so ignore here.
      break;
    case "atk":
    case "def":
    case "mag":
    case "res":
    case "spd":
    case "lck":
    case "sta":
      // Core stat modifiers handled elsewhere before derived calculations.
      break;
    default:
      const exhaustive: never = key;
      return exhaustive;
  }
};

const mapTorch = (torchPercent: number) => {
  const pct = clamp(torchPercent, 0, 100);
  const band =
    TORCH_BANDS.find((entry) => pct >= entry.min) ??
    TORCH_BANDS[TORCH_BANDS.length - 1];
  return band;
};

export const applyTorchModifiers = (
  stats: HeroDerivedStats,
  torchPercent: number
): HeroDerivedStats => {
  const band = mapTorch(torchPercent);
  return {
    ...stats,
    accuracy: stats.accuracy + band.accuracy,
    critChance: stats.critChance + band.critChance,
    dodge: stats.dodge + band.dodge,
    debuffResist: clamp(stats.debuffResist + band.debuffResist, 0, 100),
  };
};

const applyTraitModifiers = (
  traits: HeroTrait[],
  baseStats: HeroDerivedStats,
  hero: Hero,
  torchPercent?: number
): HeroDerivedStats => {
  const stats: Mutable<HeroDerivedStats> = {
    ...baseStats,
    physicalDamage: { ...baseStats.physicalDamage },
    magicDamage: { ...baseStats.magicDamage },
  };

  const evaluator = (modifier: TraitModifier): boolean => {
    if (!modifier.condition) return true;
    switch (modifier.condition.type) {
      case "always":
        return true;
      case "hpBelowPercent":
        return hero.hp / hero.maxHp <= modifier.condition.threshold;
      case "hpAbovePercent":
        return hero.hp / hero.maxHp >= modifier.condition.threshold;
      case "stressAbove":
        return hero.stress >= modifier.condition.threshold;
      case "stressBelow":
        return hero.stress <= modifier.condition.threshold;
      case "torchBelow":
        if (torchPercent === undefined) return false;
        return torchPercent <= modifier.condition.threshold;
      default:
        return true;
    }
  };

  const apply = (trait: HeroTrait) => {
    trait.modifiers?.forEach((modifier) => {
      if (!evaluator(modifier)) return;
      if (
        "physicalDamage" === modifier.stat ||
        "magicDamage" === modifier.stat
      ) {
        applyModifier(stats, modifier.stat, modifier.value);
        return;
      }
      if (
        modifier.stat === "hpMax" ||
        modifier.stat === "atk" ||
        modifier.stat === "def" ||
        modifier.stat === "mag" ||
        modifier.stat === "res" ||
        modifier.stat === "spd" ||
        modifier.stat === "lck" ||
        modifier.stat === "sta"
      ) {
        // These should already be baked into core stats before derived calculations.
        return;
      }
      if (modifier.operation === "multiply") {
        const current = (stats as Record<string, unknown>)[modifier.stat];
        if (typeof current === "number") {
          if (typeof current === "number") {
            (stats as Mutable<HeroDerivedStats>)[modifier.stat] =
              current * modifier.value;
          }
        }
      } else {
        applyModifier(stats, modifier.stat, modifier.value);
      }
    });
  };

  traits.forEach(apply);
  return stats;
};

const applyStatusEffects = (
  statuses: HeroStatus,
  stats: HeroDerivedStats
): HeroDerivedStats => {
  if (!statuses.effects.length) return stats;
  const next: Mutable<HeroDerivedStats> = {
    ...stats,
    physicalDamage: { ...stats.physicalDamage },
    magicDamage: { ...stats.magicDamage },
  };

  statuses.effects.forEach((effect) => {
    const modifier = STATUS_EFFECT_DERIVED_MODIFIERS[effect.id];
    if (!modifier) return;
    Object.entries(modifier).forEach(([statKey, value]) => {
      const typedKey = statKey as HeroStatKey;
      applyModifier(next, typedKey, value);
    });
  });

  if (statuses.flags.wounded) {
    next.dodge -= 5;
    next.debuffResist -= 5;
  }
  if (statuses.flags.blessed) {
    next.accuracy += 4;
    next.critChance += 4;
  }

  next.debuffResist = clamp(next.debuffResist, -50, 100);

  return next;
};

const deriveBaseStats = (hero: Hero): HeroDerivedStats => {
  const { coreStats } = hero;
  const weaponBonus = hero.weaponLevel * 2;
  const armorPenalty = hero.armorLevel - 1;
  const stressPenalty = hero.stress > 100 ? 15 : Math.floor(hero.stress / 15);

  const physicalMin = Math.round(coreStats.atk * 0.85 + weaponBonus);
  const physicalMax = Math.round(coreStats.atk * 1.15 + weaponBonus + 4);
  const magicMin = Math.round(coreStats.mag * 0.8 + hero.level * 0.6);
  const magicMax = Math.round(coreStats.mag * 1.2 + hero.level * 1.4);

  return {
    accuracy: clamp(
      70 +
        coreStats.spd * 1.5 +
        coreStats.lck -
        armorPenalty * 2 -
        stressPenalty,
      0,
      110
    ),
    critChance: clamp(5 + coreStats.lck * 0.5 + hero.weaponLevel, 0, 100),
    dodge: clamp(
      10 +
        coreStats.spd * 1.2 +
        coreStats.lck * 0.2 -
        armorPenalty * 3 -
        stressPenalty * 0.5,
      -20,
      90
    ),
    physicalDamage: {
      min: physicalMin,
      max: Math.max(physicalMin, physicalMax),
    },
    magicDamage: {
      min: magicMin,
      max: Math.max(magicMin, magicMax),
    },
    armorPen: clamp(coreStats.atk * 0.4 + hero.weaponLevel * 2, 0, 100),
    initiative: Math.round(
      coreStats.spd * 2 + coreStats.lck + hero.level * 1.5
    ),
    debuffResist: clamp(
      20 + coreStats.res * 2 + coreStats.lck - stressPenalty,
      0,
      100
    ),
  };
};

export const computeDerivedStats = (
  hero: Hero,
  options: DerivedStatsOptions = {}
): HeroDerivedStats => {
  const base = deriveBaseStats(hero);
  const withStatuses = applyStatusEffects(hero.statuses, base);
  const allTraits: HeroTrait[] = [...hero.traits, ...hero.diseases];
  const withTraits = applyTraitModifiers(
    allTraits,
    withStatuses,
    hero,
    options.torchPercent
  );
  const torchAdjusted =
    options.torchPercent === undefined
      ? withTraits
      : applyTorchModifiers(withTraits, options.torchPercent);
  return {
    ...torchAdjusted,
    physicalDamage: {
      min: Math.round(torchAdjusted.physicalDamage.min),
      max: Math.round(torchAdjusted.physicalDamage.max),
    },
    magicDamage: {
      min: Math.round(torchAdjusted.magicDamage.min),
      max: Math.round(torchAdjusted.magicDamage.max),
    },
  };
};

export const createElementalProfile = (cls: HeroClass): ElementalProfile => {
  const profile = HERO_ELEMENTAL_PROFILES[cls] ?? DEFAULT_ELEMENTAL_PROFILE;
  return {
    offense: { ...profile.offense },
    resistance: { ...profile.resistance },
  };
};

export const createCoreStats = (cls: HeroClass): HeroCoreStats => {
  const stats = HERO_BASE_CORE_STATS[cls];
  return { ...stats };
};

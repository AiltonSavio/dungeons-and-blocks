import Phaser from "phaser";
import {
  CommunityDungeon,
  CustomDungeon,
  Hero,
  HeroClass,
  HeroSkill,
  HeroStatKey,
  HeroTrait,
  HeroTraitCondition,
  Inventory,
  ItemId,
  MARKET_ITEMS,
  MAX_ACTIVE_SKILLS,
  MAX_HEROES,
  StatusEffectId,
  StatusEffectInstance,
  StoreResult,
  TownState,
  TraitCategory,
  TraitModifier,
} from "./models";
import {
  createCoreStats,
  createElementalProfile,
  STATUS_EFFECT_LIBRARY,
} from "./heroStats";
import { ITEM_DEFINITIONS } from "./items";

const STORAGE_KEY = "pd-town-state-v1";

const HERO_NAMES = [
  "Aelric",
  "Seraphine",
  "Thalia",
  "Marrek",
  "Eldrin",
  "Lyra",
  "Bastian",
  "Corin",
  "Isolde",
  "Varyn",
  "Orel",
  "Nyra",
  "Kallin",
  "Mira",
  "Torren",
  "Alistair",
  "Fiora",
  "Garrik",
  "Sylas",
  "Ysolde",
];

const VIRTUES: HeroTrait[] = [
  {
    id: "brave",
    name: "Brave",
    category: "virtue",
    description: "Accuracy and evasion surge when near death.",
    modifiers: [
      {
        stat: "accuracy",
        operation: "add",
        value: 8,
        condition: { type: "hpBelowPercent", threshold: 0.4 },
      },
      {
        stat: "dodge",
        operation: "add",
        value: 6,
        condition: { type: "hpBelowPercent", threshold: 0.4 },
      },
    ],
  },
  {
    id: "focused",
    name: "Focused",
    category: "virtue",
    description: "Heightened perception when nerves are steady.",
    modifiers: [
      {
        stat: "accuracy",
        operation: "add",
        value: 6,
        condition: { type: "stressBelow", threshold: 35 },
      },
      {
        stat: "critChance",
        operation: "add",
        value: 3,
        condition: { type: "stressBelow", threshold: 35 },
      },
    ],
  },
  {
    id: "stalwart",
    name: "Stalwart",
    category: "virtue",
    description: "Stands firm as the torchlight wanes.",
    modifiers: [
      {
        stat: "accuracy",
        operation: "add",
        value: 5,
        condition: { type: "torchBelow", threshold: 40 },
      },
      {
        stat: "debuffResist",
        operation: "add",
        value: 8,
        condition: { type: "torchBelow", threshold: 40 },
      },
    ],
  },
];

const AFFLICTIONS: HeroTrait[] = [
  {
    id: "fearful",
    name: "Fearful",
    category: "affliction",
    description: "Accuracy tumbles when stress rises.",
    modifiers: [
      {
        stat: "accuracy",
        operation: "add",
        value: -10,
        condition: { type: "stressAbove", threshold: 50 },
      },
      {
        stat: "initiative",
        operation: "add",
        value: -8,
        condition: { type: "stressAbove", threshold: 50 },
      },
    ],
  },
  {
    id: "greedy",
    name: "Greedy",
    category: "affliction",
    description: "Struggles to stay focused unless wealth is secured.",
    modifiers: [
      {
        stat: "critChance",
        operation: "add",
        value: -4,
        condition: { type: "hpAbovePercent", threshold: 0.75 },
      },
      {
        stat: "dodge",
        operation: "add",
        value: -4,
        condition: { type: "hpAbovePercent", threshold: 0.75 },
      },
    ],
  },
  {
    id: "flat_footed",
    name: "Flat-Footed",
    category: "affliction",
    description: "Slow to react at the start of a battle.",
    modifiers: [{ stat: "initiative", operation: "add", value: -10 }],
  },
  {
    id: "anxious",
    name: "Anxious",
    category: "affliction",
    description: "Skittish when the torch burns low.",
    modifiers: [
      {
        stat: "dodge",
        operation: "add",
        value: -6,
        condition: { type: "torchBelow", threshold: 50 },
      },
      {
        stat: "critChance",
        operation: "add",
        value: -4,
        condition: { type: "torchBelow", threshold: 50 },
      },
    ],
  },
];

const DISEASES: HeroTrait[] = [
  {
    id: "the_shakes",
    name: "The Shakes",
    category: "disease",
    description: "Hands tremble uncontrollably.",
    modifiers: [{ stat: "accuracy", operation: "add", value: -8 }],
  },
  {
    id: "blight_fever",
    name: "Blight Fever",
    category: "disease",
    description: "Weakened resistance to toxins.",
    modifiers: [{ stat: "debuffResist", operation: "add", value: -12 }],
  },
  {
    id: "scarlet_ague",
    name: "Scarlet Ague",
    category: "disease",
    description: "Saps strength and stamina.",
    modifiers: [
      { stat: "physicalDamage", operation: "add", value: -4 },
      { stat: "dodge", operation: "add", value: -4 },
    ],
  },
];

const VALID_TRAIT_STATS: HeroStatKey[] = [
  "hpMax",
  "atk",
  "def",
  "mag",
  "res",
  "spd",
  "lck",
  "sta",
  "accuracy",
  "critChance",
  "dodge",
  "physicalDamage",
  "magicDamage",
  "armorPen",
  "initiative",
  "debuffResist",
];

const VALID_TRAIT_STATS_SET = new Set<string>(VALID_TRAIT_STATS);

const BASE_SKILLS: Record<HeroClass, HeroSkill[]> = {
  Archer: [
    {
      id: "archer-quick-shot",
      name: "Quick Shot",
      description: "Fire a rapid, accurate arrow at range.",
      maxLevel: 3,
      level: 1,
      owned: true,
      classRestriction: "Archer",
    },
    {
      id: "archer-pinning-arrow",
      name: "Pinning Arrow",
      description: "Hamper a foe's movement with a barbed shot.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Archer",
    },
    {
      id: "archer-volley",
      name: "Splitting Volley",
      description: "Loose a volley to chip multiple targets.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Archer",
    },
  ],
  "Armored Axeman": [
    {
      id: "axeman-hewing-strike",
      name: "Hewing Strike",
      description: "Deliver a heavy overhead chop.",
      maxLevel: 3,
      level: 1,
      owned: true,
      classRestriction: "Armored Axeman",
    },
    {
      id: "axeman-iron-wall",
      name: "Iron Wall",
      description: "Brace and reduce damage taken this round.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Armored Axeman",
    },
    {
      id: "axeman-whirlwind",
      name: "Whirlwind Sweep",
      description: "Spin the greataxe to hit nearby enemies.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Armored Axeman",
    },
  ],
  Knight: [
    {
      id: "knight-slash",
      name: "Shield Slash",
      description: "A balanced melee strike.",
      maxLevel: 3,
      level: 1,
      owned: true,
      classRestriction: "Knight",
    },
    {
      id: "knight-guard",
      name: "Guardian Stance",
      description: "Bolster defenses for the party.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Knight",
    },
    {
      id: "knight-holy",
      name: "Holy Smite",
      description: "Smite foes with radiant force.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Knight",
    },
  ],
  "Knight Templar": [
    {
      id: "templar-judgement",
      name: "Judgement Strike",
      description: "Smite the unworthy with blessed steel.",
      maxLevel: 3,
      level: 1,
      owned: true,
      classRestriction: "Knight Templar",
    },
    {
      id: "templar-vow",
      name: "Vow of Courage",
      description: "Inspire allies against fear.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Knight Templar",
    },
    {
      id: "templar-lance",
      name: "Lance of Dawn",
      description: "Pierce front and back rows.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Knight Templar",
    },
  ],
  Priest: [
    {
      id: "priest-mend",
      name: "Mending Light",
      description: "Restore health to an ally.",
      maxLevel: 4,
      level: 1,
      owned: true,
      classRestriction: "Priest",
    },
    {
      id: "priest-purge",
      name: "Purge",
      description: "Cleanse a negative effect.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Priest",
    },
    {
      id: "priest-sermon",
      name: "Sermon of Hope",
      description: "Reduce stress for the party.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Priest",
    },
  ],
  Soldier: [
    {
      id: "soldier-forward-strike",
      name: "Line Breaker",
      description: "Drive a spear forward, forcing space.",
      maxLevel: 3,
      level: 1,
      owned: true,
      classRestriction: "Soldier",
    },
    {
      id: "soldier-rally",
      name: "Rallying Banner",
      description: "Bolster nearby allies' morale.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Soldier",
    },
    {
      id: "soldier-iron-volley",
      name: "Volley Salvo",
      description: "Coordinate a ranged volley for chip damage.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Soldier",
    },
  ],
  Swordsman: [
    {
      id: "swordsman-flurry",
      name: "Twin Flurry",
      description: "Two swift strikes in succession.",
      maxLevel: 3,
      level: 1,
      owned: true,
      classRestriction: "Swordsman",
    },
    {
      id: "swordsman-parry",
      name: "Parry Stance",
      description: "Raise guard to counter the next blow.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Swordsman",
    },
    {
      id: "swordsman-riposte",
      name: "Riposte",
      description: "Immediate counterattack when struck.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Swordsman",
    },
  ],
  Wizard: [
    {
      id: "wizard-bolt",
      name: "Arcane Bolt",
      description: "Reliable magical projectile.",
      maxLevel: 4,
      level: 1,
      owned: true,
      classRestriction: "Wizard",
    },
    {
      id: "wizard-barrier",
      name: "Mystic Barrier",
      description: "Protect allies with a shield.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Wizard",
    },
    {
      id: "wizard-nova",
      name: "Mana Nova",
      description: "Area-of-effect pulse of energy.",
      maxLevel: 3,
      level: 0,
      owned: false,
      classRestriction: "Wizard",
    },
  ],
};

const COMMUNITY_DUNGEONS: CommunityDungeon[] = [
  {
    id: "cd-crypt-001",
    name: "Cathedral of Ashes",
    difficulty: 3,
    seed: "ASH-1138",
    description: "A ruined cathedral full of ash wraiths and cursed artifacts.",
    author: "ElderRune",
    likes: 128,
  },
  {
    id: "cd-ruins-004",
    name: "Sunken Colonnade",
    difficulty: 2,
    seed: "COL-4555",
    description: "Collapsed halls patrolled by animated statues.",
    author: "Marin",
    likes: 84,
  },
  {
    id: "cd-forest-002",
    name: "Whispering Glade",
    difficulty: 4,
    seed: "GLA-9234",
    description: "Beware the spirits that bind intruders to the trees.",
    author: "Sylvae",
    likes: 157,
  },
  {
    id: "cd-coast-003",
    name: "Tidebreaker Reef",
    difficulty: 5,
    seed: "REEF-7823",
    description: "Vicious sirens and brine fiends haunt these reefs.",
    author: "Corsair",
    likes: 211,
  },
  {
    id: "cd-volcano-001",
    name: "Smoldering Maw",
    difficulty: 5,
    seed: "VOL-9932",
    description: "Basalt caverns overflowing with magma and obsidian hulks.",
    author: "Pyrelord",
    likes: 175,
  },
  {
    id: "cd-catacombs-010",
    name: "Catacombs of Silence",
    difficulty: 2,
    seed: "CAT-1100",
    description: "Uneasy quiet hides the creeping swarm underneath.",
    author: "SilentSteps",
    likes: 64,
  },
  {
    id: "cd-tundra-007",
    name: "Frozen Reliquary",
    difficulty: 3,
    seed: "ICE-4477",
    description: "Frozen relics of a forgotten cult lie in stasis.",
    author: "FrostRune",
    likes: 98,
  },
];

const storageAvailable = typeof window !== "undefined" && !!window.localStorage;

const heroId = () => `hero-${cryptoId()}`;
const dungeonId = () => `dgn-${cryptoId()}`;

function cryptoId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function deepCopy<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

function cloneTrait(trait: HeroTrait): HeroTrait {
  return {
    ...trait,
    modifiers: trait.modifiers?.map((modifier) => ({
      ...modifier,
      condition: modifier.condition ? { ...modifier.condition } : undefined,
    })),
  };
}

function mapTraitCategory(
  value: string | undefined,
  fallback: TraitCategory
): TraitCategory {
  switch (value) {
    case "virtue":
    case "positive":
      return "virtue";
    case "affliction":
    case "negative":
      return "affliction";
    case "disease":
      return "disease";
    case "quirk":
      return "quirk";
    default:
      return fallback;
  }
}

function normalizeTrait(
  raw: unknown,
  fallback: TraitCategory
): HeroTrait | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const trait = raw as HeroTrait & { type?: string; modifiers?: unknown[] };
  const category = mapTraitCategory(
    (trait as { category?: string }).category ?? trait.type,
    fallback
  );

  const modifiers = Array.isArray(trait.modifiers)
    ? trait.modifiers
        .map((modifier) => {
          if (!modifier || typeof modifier !== "object") return undefined;
          const mod = modifier as TraitModifier & {
            stat?: unknown;
            value?: unknown;
            operation?: unknown;
          };
          if (!isValidTraitStat(mod.stat)) return undefined;
          const value = Number(mod.value);
          if (Number.isNaN(value)) return undefined;
          const operation: TraitModifier["operation"] =
            mod.operation === "multiply" ? "multiply" : "add";
          const condition = mod.condition ? { ...mod.condition } : undefined;
          return { stat: mod.stat as HeroStatKey, value, operation, condition };
        })
        .filter(
          (m): m is TraitModifier & { condition: HeroTraitCondition } =>
            Boolean(m) && "condition" in (m as object)
        )
    : undefined;

  return {
    id: typeof trait.id === "string" ? trait.id : `trait-${cryptoId()}`,
    name: typeof trait.name === "string" ? trait.name : "Unknown Trait",
    description: typeof trait.description === "string" ? trait.description : "",
    category,
    modifiers: modifiers && modifiers.length ? modifiers : undefined,
  };
}

function isValidTraitStat(stat: unknown): stat is HeroStatKey {
  return typeof stat === "string" && VALID_TRAIT_STATS_SET.has(stat);
}

function normalizeEffect(effect: unknown): StatusEffectInstance | undefined {
  if (!effect || typeof effect !== "object") return undefined;
  const candidate = effect as StatusEffectInstance & {
    id?: unknown;
    duration?: unknown;
    stacks?: unknown;
  };
  if (typeof candidate.id !== "string") return undefined;
  const def = STATUS_EFFECT_LIBRARY[candidate.id as StatusEffectId];
  if (!def) return undefined;
  const duration =
    typeof candidate.duration === "number"
      ? Math.max(0, Math.round(candidate.duration))
      : def.baseDuration;
  const stacksRaw = typeof candidate.stacks === "number" ? candidate.stacks : 1;
  const stacks = clamp(Math.max(1, Math.round(stacksRaw)), 1, def.maxStacks);
  return {
    id: candidate.id as StatusEffectId,
    duration,
    stacks,
  };
}

function normalizeStatus(raw: unknown, hasDisease: boolean): Hero["statuses"] {
  const defaultFlags = {
    blessed: false,
    blessingPending: false,
    wounded: false,
    diseased: hasDisease,
  };
  if (raw && typeof raw === "object") {
    const candidate = raw as Hero["statuses"] & {
      flags?: unknown;
      effects?: unknown;
    };
    if ("flags" in candidate && "effects" in candidate) {
      const flags = {
        ...defaultFlags,
        ...(candidate.flags ?? {}),
      };
      if (typeof flags.diseased !== "boolean") flags.diseased = hasDisease;
      const effects = Array.isArray(candidate.effects)
        ? candidate.effects
            .map((e) => normalizeEffect(e))
            .filter((e): e is StatusEffectInstance => Boolean(e))
        : [];
      return { flags, effects };
    }
    const oldFlags = candidate as Record<string, unknown>;
    return {
      flags: {
        blessed: Boolean(oldFlags.blessed),
        blessingPending: Boolean(oldFlags.blessingPending),
        wounded: Boolean(oldFlags.wounded),
        diseased: hasDisease,
      },
      effects: [],
    };
  }
  return { flags: defaultFlags, effects: [] };
}

function coerceElementValue(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeElemental(cls: HeroClass, raw: unknown) {
  const fallback = createElementalProfile(cls);
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as ElementalProfileLike;
  return {
    offense: {
      fire: coerceElementValue(candidate.offense?.fire, fallback.offense.fire),
      ice: coerceElementValue(candidate.offense?.ice, fallback.offense.ice),
      holy: coerceElementValue(candidate.offense?.holy, fallback.offense.holy),
      shadow: coerceElementValue(
        candidate.offense?.shadow,
        fallback.offense.shadow
      ),
    },
    resistance: {
      fire: coerceElementValue(
        candidate.resistance?.fire,
        fallback.resistance.fire
      ),
      ice: coerceElementValue(
        candidate.resistance?.ice,
        fallback.resistance.ice
      ),
      holy: coerceElementValue(
        candidate.resistance?.holy,
        fallback.resistance.holy
      ),
      shadow: coerceElementValue(
        candidate.resistance?.shadow,
        fallback.resistance.shadow
      ),
    },
  };
}

type ElementalProfileLike = {
  offense?: Partial<Record<"fire" | "ice" | "holy" | "shadow", number>>;
  resistance?: Partial<Record<"fire" | "ice" | "holy" | "shadow", number>>;
};

function migrateHero(raw: Hero): Hero {
  const cls = raw.cls;
  const baseCore = createCoreStats(cls);
  const rawCore =
    (raw as { coreStats?: Partial<typeof baseCore> }).coreStats ?? {};
  const maxHp = typeof raw.maxHp === "number" ? raw.maxHp : baseCore.hpMax;
  const coreStats = {
    ...baseCore,
    ...rawCore,
    hpMax: maxHp,
  };
  const hp = clamp(
    typeof raw.hp === "number" ? raw.hp : maxHp,
    0,
    coreStats.hpMax
  );
  const traits = Array.isArray(raw.traits)
    ? raw.traits
        .map((trait) => normalizeTrait(trait, "affliction"))
        .filter((trait): trait is HeroTrait => Boolean(trait))
    : [];
  const diseases = Array.isArray(raw.diseases)
    ? raw.diseases
        .map((trait) => normalizeTrait(trait, "disease"))
        .filter((trait): trait is HeroTrait => Boolean(trait))
    : [];
  const statuses = normalizeStatus(
    (raw as { statuses?: unknown }).statuses,
    diseases.length > 0
  );
  const elemental = normalizeElemental(
    cls,
    (raw as { elemental?: unknown }).elemental
  );
  return {
    ...raw,
    coreStats,
    hp,
    maxHp: coreStats.hpMax,
    traits,
    diseases,
    statuses,
    elemental,
  };
}

function migrateTownState(state: TownState): TownState {
  return {
    ...state,
    heroes: (state.heroes ?? []).map((hero) => migrateHero(hero)),
  };
}

function createDefaultInventory(): Inventory {
  return {
    gold: 0,
    items: {
      pouch_gold: 0,
      stress_tonic: 0,
      minor_torch: 0,
      healing_salve: 0,
      mystery_relic: 0,
      calming_incense: 0,
      phoenix_feather: 0,
    },
  };
}

function createBaseHero(cls: HeroClass, name: string): Hero {
  const coreStats = createCoreStats(cls);
  const elemental = createElementalProfile(cls);
  const affliction =
    AFFLICTIONS[Math.floor(Math.random() * AFFLICTIONS.length)];
  const virtue =
    Math.random() < 0.55
      ? VIRTUES[Math.floor(Math.random() * VIRTUES.length)]
      : undefined;
  const diseaseTemplate =
    Math.random() < 0.2
      ? DISEASES[Math.floor(Math.random() * DISEASES.length)]
      : undefined;
  const baseSkills = deepCopy(BASE_SKILLS[cls]);
  const owned = baseSkills.filter((s) => s.owned).map((s) => s.id);
  const traits: HeroTrait[] = [cloneTrait(affliction)];
  if (virtue) traits.push(cloneTrait(virtue));
  const diseases: HeroTrait[] = diseaseTemplate
    ? [cloneTrait(diseaseTemplate)]
    : [];

  return {
    id: heroId(),
    name,
    cls,
    level: 1,
    coreStats,
    hp: coreStats.hpMax,
    maxHp: coreStats.hpMax,
    stress: Math.floor(Math.random() * 20),
    weaponLevel: 1,
    armorLevel: 1,
    traits,
    diseases,
    skills: baseSkills,
    activeSkillIds: owned.slice(0, MAX_ACTIVE_SKILLS),
    statuses: {
      flags: {
        blessed: false,
        blessingPending: false,
        wounded: false,
        diseased: diseases.length > 0,
      },
      effects: [],
    },
    elemental,
  };
}

function createDefaultHeroes(): Hero[] {
  const classes: HeroClass[] = ["Knight", "Knight Templar", "Priest", "Archer"];
  return classes.map((cls, i) => createBaseHero(cls, HERO_NAMES[i]));
}

function createDefaultState(): TownState {
  return {
    heroes: createDefaultHeroes(),
    customDungeons: [
      {
        id: dungeonId(),
        name: "Old Road Crypt",
        difficulty: 2,
        seed: "CRYPT-001",
        description: "An abandoned crypt rumored to hold ancestral relics.",
      },
    ],
    lastCommunityUpdate: Date.now(),
  };
}

export class TownStore {
  private state: TownState;
  private inventory: Inventory; // In-memory only, sourced from blockchain
  private emitter = new Phaser.Events.EventEmitter();

  constructor() {
    this.state = this.loadState();
    this.inventory = createDefaultInventory();
  }

  private loadState(): TownState {
    if (storageAvailable) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as TownState;
          return migrateTownState(parsed);
        } catch (err) {
          console.warn("Failed to parse town state, using defaults.", err);
        }
      }
    }
    return createDefaultState();
  }

  private saveState() {
    if (!storageAvailable) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  private emitChange() {
    this.saveState();
    this.emitter.emit("change", this.getState());
  }

  getState(): TownState {
    return deepCopy(this.state);
  }

  subscribe(cb: (state: TownState) => void): () => void {
    this.emitter.on("change", cb);
    return () => this.emitter.off("change", cb);
  }

  onToast(cb: (message: string) => void): () => void {
    this.emitter.on("toast", cb);
    return () => this.emitter.off("toast", cb);
  }

  toast(message: string) {
    this.emitter.emit("toast", message);
  }

  getInventory(): Inventory {
    return { ...this.inventory };
  }

  creditGold(amount: number) {
    const delta = Math.max(0, Math.floor(amount));
    if (delta <= 0) return;
    this.inventory.gold += delta;
    this.emitChange();
  }

  syncInventoryFromChain(gold: number, items: Record<ItemId, number>) {
    this.inventory.gold = gold;
    this.inventory.items = { ...items };
    this.emitChange();
  }

  recruitHero(): StoreResult {
    if (this.state.heroes.length >= MAX_HEROES) {
      return { ok: false, message: "Hero roster is at maximum capacity." };
    }
    const cost = 100;
    if (this.inventory.gold < cost) {
      return { ok: false, message: "Not enough gold to recruit." };
    }
    const clsPool: HeroClass[] = [
      "Archer",
      "Armored Axeman",
      "Knight",
      "Knight Templar",
      "Priest",
      "Soldier",
      "Swordsman",
      "Wizard",
    ];
    const cls = clsPool[Math.floor(Math.random() * clsPool.length)];
    const name = HERO_NAMES[Math.floor(Math.random() * HERO_NAMES.length)];
    const hero = createBaseHero(cls, name);
    this.state.heroes.push(hero);
    this.inventory.gold -= cost;
    this.emitChange();
    return { ok: true, message: `${hero.name} has joined the roster.` };
  }

  restHero(heroId: string): StoreResult {
    const hero = this.state.heroes.find((h) => h.id === heroId);
    if (!hero) return { ok: false, message: "Hero not found." };
    const cost = 25;
    if (this.inventory.gold < cost)
      return { ok: false, message: "Not enough gold to rest." };
    const stressBefore = hero.stress;
    hero.stress = clamp(hero.stress - 30, 0, 100);
    this.inventory.gold -= cost;
    this.emitChange();
    const reduced = stressBefore - hero.stress;
    return { ok: true, message: `${hero.name} recovers ${reduced} stress.` };
  }

  sanitizeHero(heroId: string): StoreResult {
    const hero = this.state.heroes.find((h) => h.id === heroId);
    if (!hero) return { ok: false, message: "Hero not found." };
    const hasAffliction = hero.traits.some((t) => t.category === "affliction");
    const hasDisease = hero.diseases.length > 0;
    if (!hasAffliction && !hasDisease)
      return { ok: false, message: "No afflictions to cure." };
    const cost = 60;
    if (this.inventory.gold < cost)
      return { ok: false, message: "Not enough gold for treatment." };
    this.inventory.gold -= cost;
    const success = Math.random() > 0.2;
    if (!success) {
      this.emitChange();
      return { ok: false, message: `Treatment failed for ${hero.name}.` };
    }
    if (hasDisease) {
      hero.diseases.shift();
      if (!hero.statuses.flags) hero.statuses.flags = {};
      hero.statuses.flags.diseased = hero.diseases.length > 0;
    } else if (hasAffliction) {
      const nextTraits = hero.traits.slice();
      const idx = nextTraits.findIndex((t) => t.category === "affliction");
      if (idx !== -1) nextTraits.splice(idx, 1);
      hero.traits = nextTraits;
    }
    this.emitChange();
    return { ok: true, message: `${hero.name} is cured of an affliction.` };
  }

  upgradeWeapon(heroId: string): StoreResult {
    const hero = this.state.heroes.find((h) => h.id === heroId);
    if (!hero) return { ok: false, message: "Hero not found." };
    const maxTier = 5;
    if (hero.weaponLevel >= maxTier)
      return { ok: false, message: "Weapon already masterworked." };
    const cost = 50 * hero.weaponLevel;
    if (this.inventory.gold < cost)
      return { ok: false, message: "Not enough gold for weapon upgrade." };
    hero.weaponLevel += 1;
    hero.coreStats.atk += 1;
    hero.coreStats.hpMax += 2;
    hero.maxHp = hero.coreStats.hpMax;
    hero.hp = Math.min(hero.hp + 4, hero.maxHp);
    this.inventory.gold -= cost;
    this.emitChange();
    return {
      ok: true,
      message: `${hero.name}'s weapon improved to tier ${hero.weaponLevel}.`,
    };
  }

  upgradeArmor(heroId: string): StoreResult {
    const hero = this.state.heroes.find((h) => h.id === heroId);
    if (!hero) return { ok: false, message: "Hero not found." };
    const maxTier = 5;
    if (hero.armorLevel >= maxTier)
      return { ok: false, message: "Armor already reinforced." };
    const cost = 50 * hero.armorLevel;
    if (this.inventory.gold < cost)
      return { ok: false, message: "Not enough gold for armor upgrade." };
    hero.armorLevel += 1;
    hero.coreStats.def += 1;
    hero.coreStats.hpMax += 4;
    hero.maxHp = hero.coreStats.hpMax;
    hero.hp = Math.min(hero.hp + 6, hero.maxHp);
    this.inventory.gold -= cost;
    this.emitChange();
    return {
      ok: true,
      message: `${hero.name}'s armor reinforced to tier ${hero.armorLevel}.`,
    };
  }

  learnSkill(heroId: string, skillId: string): StoreResult {
    const hero = this.state.heroes.find((h) => h.id === heroId);
    if (!hero) return { ok: false, message: "Hero not found." };
    const skill = hero.skills.find((s) => s.id === skillId);
    if (!skill)
      return { ok: false, message: "Skill unavailable for this hero." };
    if (skill.owned)
      return { ok: false, message: `${skill.name} already learned.` };
    const cost = 75;
    if (this.inventory.gold < cost)
      return { ok: false, message: "Not enough gold to learn skill." };
    this.inventory.gold -= cost;
    skill.owned = true;
    skill.level = 1;
    if (hero.activeSkillIds.length < MAX_ACTIVE_SKILLS) {
      hero.activeSkillIds.push(skill.id);
    }
    this.emitChange();
    return { ok: true, message: `${hero.name} learned ${skill.name}.` };
  }

  upgradeSkill(heroId: string, skillId: string): StoreResult {
    const hero = this.state.heroes.find((h) => h.id === heroId);
    if (!hero) return { ok: false, message: "Hero not found." };
    const skill = hero.skills.find((s) => s.id === skillId);
    if (!skill || !skill.owned)
      return { ok: false, message: "Skill not learned yet." };
    if (skill.level >= skill.maxLevel)
      return { ok: false, message: "Skill already at maximum level." };
    const cost = 40 * (skill.level + 1);
    if (this.inventory.gold < cost)
      return { ok: false, message: "Not enough gold to upgrade skill." };
    this.inventory.gold -= cost;
    skill.level += 1;
    this.emitChange();
    return {
      ok: true,
      message: `${skill.name} upgraded to rank ${skill.level}.`,
    };
  }

  setActiveSkills(heroId: string, skillIds: string[]): StoreResult {
    if (skillIds.length === 0 || skillIds.length > MAX_ACTIVE_SKILLS) {
      return {
        ok: false,
        message: `Active skills must be between 1 and ${MAX_ACTIVE_SKILLS}.`,
      };
    }
    const hero = this.state.heroes.find((h) => h.id === heroId);
    if (!hero) return { ok: false, message: "Hero not found." };
    for (const id of skillIds) {
      const skill = hero.skills.find((s) => s.id === id);
      if (!skill || !skill.owned)
        return { ok: false, message: "Active skills must be learned first." };
    }
    hero.activeSkillIds = [...skillIds];
    this.emitChange();
    return { ok: true, message: `${hero.name}'s loadout updated.` };
  }

  marketBuy(itemId: ItemId, quantity: number): StoreResult {
    const def = MARKET_ITEMS.find((i) => i.id === itemId);
    if (!def || typeof def.buyPrice !== "number")
      return { ok: false, message: "Item unavailable." };
    if (quantity <= 0) return { ok: false, message: "Invalid quantity." };
    const cost = def.buyPrice * quantity;
    if (this.inventory.gold < cost)
      return { ok: false, message: "Not enough gold." };
    this.inventory.gold -= cost;
    this.inventory.items[itemId] =
      (this.inventory.items[itemId] || 0) + quantity;
    this.emitChange();
    return { ok: true, message: `Purchased ${quantity} × ${def.name}.` };
  }

  marketSell(itemId: ItemId, quantity: number): StoreResult {
    const def = ITEM_DEFINITIONS[itemId];
    if (!def || typeof def.sellPrice !== "number")
      return { ok: false, message: "Item cannot be sold." };
    if (quantity <= 0) return { ok: false, message: "Invalid quantity." };
    const owned = this.inventory.items[itemId] || 0;
    if (owned < quantity)
      return { ok: false, message: "Not enough items to sell." };
    this.inventory.items[itemId] = owned - quantity;
    this.inventory.gold += def.sellPrice * quantity;
    this.emitChange();
    return { ok: true, message: `Sold ${quantity} × ${def.name}.` };
  }

  applyAbbey(
    heroIds: string[],
    opts: { stressRelief?: number; blessing?: boolean }
  ): StoreResult {
    if (!heroIds.length) return { ok: false, message: "No heroes selected." };
    const relief = opts.stressRelief ?? 25;
    const baseCost = opts.blessing ? 45 : 30;
    const totalCost = baseCost * heroIds.length;
    if (this.inventory.gold < totalCost)
      return { ok: false, message: "Not enough gold for the Abbey services." };
    heroIds.forEach((id) => {
      const hero = this.state.heroes.find((h) => h.id === id);
      if (!hero) return;
      hero.stress = clamp(hero.stress - relief, 0, 100);
      if (opts.blessing) {
        if (!hero.statuses.flags) hero.statuses.flags = {};
        hero.statuses.flags.blessingPending = true;
        hero.statuses.flags.blessed = false;
      }
    });
    this.inventory.gold -= totalCost;
    this.emitChange();
    const msg = opts.blessing
      ? `Blessing bestowed on ${heroIds.length} hero(es).`
      : `The Abbey calms ${heroIds.length} hero(es).`;
    return { ok: true, message: msg };
  }

  consumeBlessings(heroIds: string[]) {
    heroIds.forEach((id) => {
      const hero = this.state.heroes.find((h) => h.id === id);
      if (!hero) return;
      if (!hero.statuses.flags) hero.statuses.flags = {};
      if (hero.statuses.flags.blessingPending) {
        hero.statuses.flags.blessingPending = false;
        hero.statuses.flags.blessed = true;
      } else {
        hero.statuses.flags.blessed = false;
      }
    });
    this.emitChange();
  }

  createDungeon(data: Omit<CustomDungeon, "id">): StoreResult {
    if (this.state.customDungeons.length >= 3) {
      return { ok: false, message: "Dungeon limit reached (3)." };
    }
    const dungeon: CustomDungeon = { ...data, id: dungeonId() };
    this.state.customDungeons.push(dungeon);
    this.emitChange();
    return { ok: true, message: `"${dungeon.name}" added to your legend.` };
  }

  updateDungeon(id: string, partial: Partial<CustomDungeon>): StoreResult {
    const dungeon = this.state.customDungeons.find((d) => d.id === id);
    if (!dungeon) return { ok: false, message: "Dungeon not found." };
    Object.assign(dungeon, partial);
    this.emitChange();
    return { ok: true, message: `"${dungeon.name}" updated.` };
  }

  deleteDungeon(id: string): StoreResult {
    const index = this.state.customDungeons.findIndex((d) => d.id === id);
    if (index === -1) return { ok: false, message: "Dungeon not found." };
    const [removed] = this.state.customDungeons.splice(index, 1);
    this.emitChange();
    return { ok: true, message: `"${removed.name}" retired from duty.` };
  }

  getCommunityDungeons(): CommunityDungeon[] {
    return deepCopy(COMMUNITY_DUNGEONS);
  }
}

export const townStore = new TownStore();

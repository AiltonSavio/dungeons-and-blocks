export type TraitAlignment = "positive" | "negative";

export type TraitCatalogEntry = {
  id: number;
  key: string;
  name: string;
  alignment: TraitAlignment;
  summary: string;
};

export const TRAIT_NONE = 255;

const makeEntry = (
  id: number,
  alignment: TraitAlignment,
  name: string,
  summary: string
): TraitCatalogEntry => ({
  id,
  alignment,
  key: `${alignment}-${id}`,
  name,
  summary,
});

export const POSITIVE_TRAITS: TraitCatalogEntry[] = [
  makeEntry(
    0,
    "positive",
    "Iron Will",
    "Resilience training grants +4 resistance and raises stress cap by 30."
  ),
  makeEntry(
    1,
    "positive",
    "Battle Hardened",
    "Scars and drills boost +12 max HP and +4 attack."
  ),
  makeEntry(
    2,
    "positive",
    "Arcane Focus",
    "Meditative rituals sharpen spellcraft for +10 magic."
  ),
  makeEntry(
    3,
    "positive",
    "Shieldmaster",
    "Disciplined guard grants +10 defense and +4 resistance."
  ),
  makeEntry(4, "positive", "Fleetfoot", "Relentless training adds +12 speed."),
  makeEntry(
    5,
    "positive",
    "Lucky Star",
    "Fortune smiles often, adding +14 luck."
  ),
];

export const NEGATIVE_TRAITS: TraitCatalogEntry[] = [
  makeEntry(0, "negative", "Frail", "Lingering injuries reduce max HP by 12."),
  makeEntry(1, "negative", "Sluggish", "A tired gait drags speed down by 12."),
  makeEntry(2, "negative", "Dull Edge", "Neglected gear lowers attack by 8."),
  makeEntry(
    3,
    "negative",
    "Unfocused",
    "Erratic channeling weakens magic by 8."
  ),
  makeEntry(
    4,
    "negative",
    "Thin Skin",
    "Fragile defenses drop defense by 8 and resistance by 6."
  ),
  makeEntry(
    5,
    "negative",
    "Haunted",
    "Lingering voices sap 12 luck and shrink stress cap by 30."
  ),
];

const positiveMap = new Map(POSITIVE_TRAITS.map((entry) => [entry.id, entry]));
const negativeMap = new Map(NEGATIVE_TRAITS.map((entry) => [entry.id, entry]));

export function findTrait(
  alignment: TraitAlignment,
  id: number
): TraitCatalogEntry | undefined {
  if (id === TRAIT_NONE) return undefined;
  return alignment === "positive" ? positiveMap.get(id) : negativeMap.get(id);
}

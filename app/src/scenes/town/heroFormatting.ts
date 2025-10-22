import { ChainHero } from "../../state/heroChain";

export function formatHeroRowStats(hero: ChainHero) {
  return `ATK ${hero.attack} • DEF ${hero.defense} • MAG ${hero.magic}`;
}

export function formatHeroTimestamp(seconds: number) {
  if (!seconds) return "—";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

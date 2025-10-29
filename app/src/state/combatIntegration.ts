import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  ChainCombat,
  ChainHeroCombatant,
  ChainEnemyCombatant,
  ChainStatusInstance,
  HeroActionKind,
  StatusEffect,
  TargetSide,
  createBeginEncounterInstruction,
  createSubmitCombatActionInstruction,
  createConcludeCombatInstruction,
  deriveCombatPda,
  fetchCombatState,
} from "./adventureChain";

export interface CombatSigner {
  publicKey: PublicKey;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (
    tx: Transaction
  ) => Promise<string | { signature: string }>;
}

/**
 * Context object for combat operations
 */
export interface CombatContext {
  connection: Connection;
  owner: PublicKey;
  authority: CombatSigner;
  adventureKey: PublicKey;
}

/**
 * Action submission options
 */
export interface CombatActionOptions {
  heroIndex: number;
  action: HeroActionKind;
  targetIndex: number | null;
  targetSide: "hero" | "enemy";
  itemKey?: number;
}

/**
 * Check if the adventure has a pending encounter
 */
export async function checkPendingEncounter(
  ctx: CombatContext
): Promise<boolean> {
  try {
    const { fetchAdventureSession } = await import("./adventureChain");
    const adventure = await fetchAdventureSession(
      ctx.connection,
      ctx.adventureKey
    );
    return adventure ? adventure.pendingEncounterSeed !== 0n : false;
  } catch (err) {
    console.error(
      "[combatIntegration] Failed to check pending encounter:",
      err
    );
    return false;
  }
}

/**
 * Initialize combat by calling begin_encounter
 * Creates the Combat PDA on-chain
 */
export async function beginEncounter(
  ctx: CombatContext,
  sendTransaction: (tx: Transaction) => Promise<string>
): Promise<string> {
  const ix = await createBeginEncounterInstruction({
    connection: ctx.connection,
    owner: ctx.owner,
    authority: ctx.authority.publicKey,
    adventureKey: ctx.adventureKey,
  });

  const tx = new Transaction().add(ix);
  return sendTransaction(tx);
}

/**
 * Poll and fetch current combat state from chain
 * Returns null if no active combat
 */
export async function pollCombatState(
  ctx: CombatContext
): Promise<ChainCombat | null> {
  try {
    const [combatPda] = deriveCombatPda(ctx.adventureKey);
    return await fetchCombatState(ctx.connection, combatPda);
  } catch (err) {
    console.error("[combatIntegration] Failed to poll combat state:", err);
    return null;
  }
}

/**
 * Submit a hero action to the chain
 */
export async function submitCombatAction(
  ctx: CombatContext,
  options: CombatActionOptions,
  sendTransaction: (tx: Transaction) => Promise<string>
): Promise<string> {
  const targetSideEnum =
    options.targetSide === "enemy" ? TargetSide.Enemy : TargetSide.Hero;

  const ix = await createSubmitCombatActionInstruction({
    connection: ctx.connection,
    adventureKey: ctx.adventureKey,
    owner: ctx.owner,
    authority: ctx.authority.publicKey,
    heroIndex: options.heroIndex,
    action: options.action,
    targetIndex: options.targetIndex,
    targetSide: targetSideEnum,
    itemKey: options.itemKey,
  });

  const tx = new Transaction().add(ix);
  return sendTransaction(tx);
}

/**
 * Conclude combat and apply rewards (XP, loot, traits)
 * Closes the Combat PDA
 */
export async function concludeCombat(
  ctx: CombatContext,
  sendTransaction: (tx: Transaction) => Promise<string>
): Promise<string> {
  const ix = await createConcludeCombatInstruction({
    connection: ctx.connection,
    adventureKey: ctx.adventureKey,
    owner: ctx.owner,
    authority: ctx.authority.publicKey,
  });

  const tx = new Transaction().add(ix);
  return sendTransaction(tx);
}

/**
 * Check if it's currently a hero's turn
 */
export function isHeroTurn(combat: ChainCombat): boolean {
  return combat.turn.isHero;
}

/**
 * Get the current actor whose turn it is
 */
export function getCurrentActor(combat: ChainCombat): {
  kind: "hero" | "enemy";
  index: number;
} {
  return {
    kind: combat.turn.isHero ? "hero" : "enemy",
    index: combat.turn.actorIndex,
  };
}

/**
 * Check if combat has been resolved (victory or defeat)
 */
export function isCombatResolved(combat: ChainCombat): boolean {
  return !combat.resolution.pending;
}

/**
 * Check if combat ended in victory
 */
export function isVictory(combat: ChainCombat): boolean {
  return !combat.resolution.pending && combat.resolution.victory;
}

/**
 * Get display name for a status effect
 */
export function getStatusEffectName(effect: StatusEffect): string {
  switch (effect) {
    case StatusEffect.None:
      return "None";
    case StatusEffect.Poison:
      return "Poison";
    case StatusEffect.Bleed:
      return "Bleed";
    case StatusEffect.Burn:
      return "Burn";
    case StatusEffect.Chill:
      return "Chill";
    case StatusEffect.Guard:
      return "Guard";
    default:
      return "Unknown";
  }
}

/**
 * Get color for a status effect (for UI rendering)
 */
export function getStatusEffectColor(effect: StatusEffect): number {
  switch (effect) {
    case StatusEffect.Poison:
      return 0x8bc34a; // Green
    case StatusEffect.Bleed:
      return 0xe57373; // Red
    case StatusEffect.Burn:
      return 0xff9800; // Orange
    case StatusEffect.Chill:
      return 0x64b5f6; // Blue
    case StatusEffect.Guard:
      return 0x9575cd; // Purple
    case StatusEffect.None:
    default:
      return 0xffffff; // White
  }
}

/**
 * Get active status effects from a status array
 */
export function getActiveStatuses(
  statuses: ChainStatusInstance[]
): ChainStatusInstance[] {
  return statuses.filter(
    (s) => s.effect !== StatusEffect.None && s.duration > 0
  );
}

/**
 * Calculate action AP cost
 */
export const HERO_AP_MAX = 3;

export function getActionCost(action: HeroActionKind): number {
  switch (action) {
    case HeroActionKind.Attack:
      return 1;
    case HeroActionKind.Skill1:
      return 2;
    case HeroActionKind.Skill2:
      return 3;
    case HeroActionKind.Defend:
      return 0;
    case HeroActionKind.UseItem:
      return 1;
    default:
      return 1;
  }
}

export function hasStatusEffect(
  statuses: ChainStatusInstance[],
  effect: StatusEffect
): boolean {
  return statuses.some(
    (status) =>
      status.effect === effect && status.duration > 0 && status.stacks > 0
  );
}

export function getPendingApGain(hero: ChainHeroCombatant): number {
  if (hasStatusEffect(hero.statuses, StatusEffect.Chill)) {
    return 0;
  }
  return hero.ap >= HERO_AP_MAX ? 0 : 1;
}

export function getEffectiveAp(hero: ChainHeroCombatant): number {
  return Math.min(hero.ap + getPendingApGain(hero), HERO_AP_MAX);
}

/**
 * Check if a hero can afford an action
 */
export function canAffordAction(
  hero: ChainHeroCombatant,
  action: HeroActionKind
): boolean {
  return getEffectiveAp(hero) >= getActionCost(action);
}

/**
 * Get all alive heroes from combat state
 */
export function getAliveHeroes(combat: ChainCombat): ChainHeroCombatant[] {
  return combat.heroes.filter((h) => h.alive);
}

/**
 * Get all alive enemies from combat state
 */
export function getAliveEnemies(combat: ChainCombat): ChainEnemyCombatant[] {
  return combat.enemies.filter((e) => e.alive);
}

/**
 * Check if all enemies are defeated
 */
export function allEnemiesDefeated(combat: ChainCombat): boolean {
  return combat.enemies.every((e) => !e.alive);
}

/**
 * Check if all heroes are defeated
 */
export function allHeroesDefeated(combat: ChainCombat): boolean {
  return combat.heroes.every((h) => !h.alive);
}

/**
 * Format status effects for display
 */
export function formatStatusEffects(statuses: ChainStatusInstance[]): string {
  const active = getActiveStatuses(statuses);
  if (active.length === 0) return "None";

  return active
    .map((s) => {
      const name = getStatusEffectName(s.effect);
      const stacks = s.stacks > 1 ? ` x${s.stacks}` : "";
      return `${name}${stacks}`;
    })
    .join(", ");
}

/**
 * Get description of status effect mechanics
 */
export function getStatusEffectDescription(effect: StatusEffect): string {
  switch (effect) {
    case StatusEffect.Poison:
      return "Takes 2 x stacks magic damage per turn";
    case StatusEffect.Bleed:
      return "Takes 3 x stacks physical damage per turn";
    case StatusEffect.Burn:
      return "Takes 4 + stacks magic damage per turn, 25% chance to remove Guard";
    case StatusEffect.Chill:
      return "Speed reduced by 2 x stacks, -1 AP regen";
    case StatusEffect.Guard:
      return "40% damage reduction";
    case StatusEffect.None:
    default:
      return "";
  }
}

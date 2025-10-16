/**
 * HeroService will expose hero roster, minting, and sync operations.
 * Phase 1 scaffolding provides typed hooks for later implementation.
 */
export interface HeroRosterEntry {
  mint: string;
  classId: number;
  level: number;
  soulbound: boolean;
}

export interface HeroService {
  getRoster(): Promise<HeroRosterEntry[]>;
  claimStarter(classId: number, traitSeed: bigint): Promise<void>;
  mintPaid(classId: number, priceLamports: bigint): Promise<void>;
  burnHero(mint: string): Promise<void>;
}

export const createHeroService = (): HeroService => {
  throw new Error("HeroService not implemented yet");
};

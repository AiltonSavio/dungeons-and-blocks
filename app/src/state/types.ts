export interface HeroStats {
  vitality: number;
  strength: number;
  agility: number;
  intellect: number;
}

export interface MovementCheckpoint {
  root: string;
  slot: number;
}

export interface WalletSession {
  wallet: string;
  heroMints: string[];
  activeHero?: string;
  lastCommit?: MovementCheckpoint;
}

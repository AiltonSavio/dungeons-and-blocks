import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_SLOT_HASHES_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import heroIdl from "../../../target/idl/hero_core.json";

export const HERO_CORE_PROGRAM_ID = new PublicKey(heroIdl.address);

const PLAYER_PROFILE_SEED = Buffer.from("player");
const HERO_SEED = Buffer.from("hero");
const GOLD_ACCOUNT_SEED = Buffer.from("gold");
const GAME_VAULT_SEED = Buffer.from("vault");
const VRF_IDENTITY_SEED = Buffer.from("identity");

const FREE_MINT_LIMIT = 4;
const HERO_PRICE_GOLD = 100;
const DEFAULT_VRF_QUEUE = new PublicKey(
  "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
);
const VRF_PROGRAM_ID = new PublicKey(
  "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
);

const EXPERIENCE_THRESHOLDS = [0, 0, 100, 300, 600, 1000];

const DISCRIMINATOR = {
  initializePlayer: Buffer.from([79, 249, 88, 177, 220, 62, 56, 128]),
  mintHeroFree: Buffer.from([26, 28, 214, 62, 10, 87, 144, 66]),
  mintHeroPaid: Buffer.from([157, 18, 206, 107, 36, 236, 5, 91]),
  levelUpHero: Buffer.from([190, 123, 111, 190, 184, 74, 34, 137]),
};

export type ChainHeroSkill = {
  id: number;
  name: string;
};

export type ChainHero = {
  account: string;
  owner: string;
  id: number;
  heroType: number;
  level: number;
  experience: number;
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  magic: number;
  resistance: number;
  speed: number;
  luck: number;
  statusEffects: number;
  skills: ChainHeroSkill[];
  positiveQuirks: number[];
  negativeQuirks: number[];
  isSoulbound: boolean;
  isBurned: boolean;
  mintTimestamp: number;
  lastLevelUp: number;
  pendingRequest: number;
};

export type PlayerProfile = {
  address: PublicKey;
  owner: PublicKey;
  bump: number;
  heroCount: number;
  freeMintsClaimed: boolean;
  freeMintCount: number;
  nextHeroId: bigint;
  soulboundHeroIds: (bigint | null)[];
};

export const HERO_FREE_MINT_LIMIT = FREE_MINT_LIMIT;
export const HERO_PAID_COST = HERO_PRICE_GOLD;
export const HERO_MAX_LEVEL = EXPERIENCE_THRESHOLDS.length - 1;

const HERO_TYPE_LABELS: string[] = [
  "Archer",
  "Armored Axeman",
  "Knight",
  "Knight Templar",
  "Priest",
  "Soldier",
  "Swordsman",
  "Wizard",
];

const POSITIVE_QUIRK_LABELS: Record<number, string> = {
  0: "Sharpsighted",
  1: "Iron Will",
  2: "Blessed",
  3: "Vanguard",
  4: "Arcane Attuned",
};

const NEGATIVE_QUIRK_LABELS: Record<number, string> = {
  5: "Bloodied",
  6: "Frail",
  7: "Superstitious",
  8: "Haunted",
  9: "Jinxed",
};

export function getHeroTypeLabel(heroType: number) {
  return HERO_TYPE_LABELS[heroType] ?? `Type ${heroType}`;
}

export function getQuirkLabel(id: number) {
  if (id in POSITIVE_QUIRK_LABELS) return POSITIVE_QUIRK_LABELS[id];
  if (id in NEGATIVE_QUIRK_LABELS) return NEGATIVE_QUIRK_LABELS[id];
  return `Quirk ${id}`;
}

export function getExperienceRequirementForLevel(level: number): number | null {
  if (level < 0 || level >= EXPERIENCE_THRESHOLDS.length) {
    return null;
  }
  return EXPERIENCE_THRESHOLDS[level];
}

export function getNextLevelRequirement(
  hero: ChainHero
): { targetLevel: number; requiredExperience: number } | null {
  const targetLevel = hero.level + 1;
  const requirement = getExperienceRequirementForLevel(targetLevel);
  if (requirement === null) {
    return null;
  }
  return { targetLevel, requiredExperience: requirement };
}

export function canLevelUpHero(hero: ChainHero): boolean {
  const next = getNextLevelRequirement(hero);
  if (!next) return false;
  return hero.experience > next.requiredExperience;
}

export async function fetchHeroes(
  connection: Connection,
  owner: PublicKey
): Promise<ChainHero[]> {
  const accounts = await connection.getProgramAccounts(HERO_CORE_PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 8,
          bytes: owner.toBase58(),
        },
      },
    ],
  });

  const PROFILE_PDA = derivePlayerProfilePda(owner)[0];

  return accounts
    .filter(({ pubkey }) => !pubkey.equals(PROFILE_PDA)) // Exclude profile
    .map(({ pubkey, account }) => decodeHeroMint(pubkey, account.data))
    .sort((a, b) => a.id - b.id);
}

export async function fetchPlayerProfile(
  connection: Connection,
  owner: PublicKey
): Promise<PlayerProfile | null> {
  const [profilePda] = derivePlayerProfilePda(owner);
  const accountInfo = await connection.getAccountInfo(profilePda);
  if (!accountInfo) return null;
  try {
    return decodePlayerProfile(profilePda, accountInfo.data);
  } catch (error) {
    console.warn("Failed to decode player profile", error);
    return null;
  }
}

export function derivePlayerProfilePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PLAYER_PROFILE_SEED, owner.toBuffer()],
    HERO_CORE_PROGRAM_ID
  );
}

export function deriveHeroMintPda(
  owner: PublicKey,
  heroId: bigint
): [PublicKey, number] {
  const idBuffer = Buffer.alloc(8);
  idBuffer.writeBigUInt64LE(heroId);
  return PublicKey.findProgramAddressSync(
    [HERO_SEED, owner.toBuffer(), idBuffer],
    HERO_CORE_PROGRAM_ID
  );
}

export function deriveGoldAccountPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [GOLD_ACCOUNT_SEED, owner.toBuffer()],
    HERO_CORE_PROGRAM_ID
  );
}

export function deriveGameVaultPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [GAME_VAULT_SEED],
    HERO_CORE_PROGRAM_ID
  );
}

export function deriveVrfIdentityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VRF_IDENTITY_SEED],
    HERO_CORE_PROGRAM_ID
  );
}

export function getVrfOracleAddress() {
  const env = (
    import.meta as unknown as {
      env?: Record<string, string | undefined>;
    }
  ).env;
  const fromEnv = env?.VITE_VRF_QUEUE;
  const fromWindow =
    typeof window !== "undefined"
      ? (window as unknown as { __DNB_VRF_QUEUE__?: string }).__DNB_VRF_QUEUE__
      : undefined;
  return new PublicKey(fromEnv ?? fromWindow ?? DEFAULT_VRF_QUEUE);
}

export function createInitializePlayerInstruction(
  owner: PublicKey
): TransactionInstruction {
  const [profilePda] = derivePlayerProfilePda(owner);
  return new TransactionInstruction({
    programId: HERO_CORE_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: profilePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DISCRIMINATOR.initializePlayer,
  });
}

export function createMintHeroInstruction(options: {
  owner: PublicKey;
  profile: PlayerProfile;
  mintType: "free" | "paid";
}): { instruction: TransactionInstruction; heroMint: PublicKey } {
  const { owner, profile, mintType } = options;
  const heroId = profile.nextHeroId;
  const [heroMint] = deriveHeroMintPda(owner, heroId);
  const [profilePda] = derivePlayerProfilePda(owner);
  const oracleQueue = getVrfOracleAddress();

  const [programIdentity] = PublicKey.findProgramAddressSync(
    [Buffer.from("identity")],
    HERO_CORE_PROGRAM_ID
  );

  if (mintType === "free") {
    const keys = [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: profilePda, isSigner: false, isWritable: true },
      { pubkey: heroMint, isSigner: false, isWritable: true },
      { pubkey: oracleQueue, isSigner: false, isWritable: true },
      { pubkey: programIdentity, isSigner: false, isWritable: false },
      { pubkey: VRF_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const data = Buffer.concat([DISCRIMINATOR.mintHeroFree]);

    return {
      instruction: new TransactionInstruction({
        programId: HERO_CORE_PROGRAM_ID,
        keys,
        data,
      }),
      heroMint,
    };
  }

  // Paid mint path
  const [goldAccount] = deriveGoldAccountPda(owner);
  const [gameVault] = deriveGameVaultPda();

  const keys = [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: profilePda, isSigner: false, isWritable: true },
    { pubkey: heroMint, isSigner: false, isWritable: true },
    { pubkey: oracleQueue, isSigner: false, isWritable: true },
    { pubkey: goldAccount, isSigner: false, isWritable: true },
    { pubkey: gameVault, isSigner: false, isWritable: true },
    { pubkey: programIdentity, isSigner: false, isWritable: false },
    { pubkey: VRF_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const data = Buffer.concat([DISCRIMINATOR.mintHeroPaid]);

  return {
    instruction: new TransactionInstruction({
      programId: HERO_CORE_PROGRAM_ID,
      keys,
      data,
    }),
    heroMint,
  };
}

export function createLevelUpInstruction(options: {
  owner: PublicKey;
  heroId: bigint | number;
}): TransactionInstruction {
  const { owner, heroId } = options;
  const heroIdBigInt = typeof heroId === "bigint" ? heroId : BigInt(heroId);
  const [heroMint] = deriveHeroMintPda(owner, heroIdBigInt);
  const oracleQueue = getVrfOracleAddress();
  const [programIdentity] = PublicKey.findProgramAddressSync(
    [VRF_IDENTITY_SEED],
    HERO_CORE_PROGRAM_ID
  );

  const heroIdBuffer = Buffer.alloc(8);
  heroIdBuffer.writeBigUInt64LE(heroIdBigInt);

  const data = Buffer.concat([DISCRIMINATOR.levelUpHero, heroIdBuffer]);

  const keys = [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: heroMint, isSigner: false, isWritable: true },
    { pubkey: oracleQueue, isSigner: false, isWritable: true },
    { pubkey: programIdentity, isSigner: false, isWritable: false },
    { pubkey: VRF_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: HERO_CORE_PROGRAM_ID,
    keys,
    data,
  });
}

function decodeHeroMint(account: PublicKey, data: Buffer): ChainHero {
  let offset = 8; // account discriminator

  const owner = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  // bump
  offset += 1;

  const id = Number(data.readBigUInt64LE(offset));
  offset += 8;

  const heroType = data[offset++];
  const level = data[offset++];

  const experience = Number(data.readBigUInt64LE(offset));
  offset += 8;

  const maxHp = data[offset++];
  const currentHp = data[offset++];
  const attack = data[offset++];
  const defense = data[offset++];
  const magic = data[offset++];
  const resistance = data[offset++];
  const speed = data[offset++];
  const luck = data[offset++];

  const statusEffects = data[offset++];

  const skill1 = decodeSkill(data, offset);
  offset = skill1.nextOffset;

  const skill2 = decodeSkill(data, offset);
  offset = skill2.nextOffset;

  const positiveQuirks = decodeQuirkArray(data, offset, 3);
  offset = positiveQuirks.nextOffset;

  const negativeQuirks = decodeQuirkArray(data, offset, 3);
  offset = negativeQuirks.nextOffset;

  const isSoulbound = data[offset++] === 1;
  const isBurned = data[offset++] === 1;

  const mintTimestamp = Number(data.readBigInt64LE(offset));
  offset += 8;
  const lastLevelUp = Number(data.readBigInt64LE(offset));
  offset += 8;

  const pendingRequest = data[offset++];

  return {
    account: account.toBase58(),
    owner: owner.toBase58(),
    id,
    heroType,
    level,
    experience,
    maxHp,
    currentHp,
    attack,
    defense,
    magic,
    resistance,
    speed,
    luck,
    statusEffects,
    skills: [skill1.skill, skill2.skill],
    positiveQuirks: positiveQuirks.values,
    negativeQuirks: negativeQuirks.values,
    isSoulbound,
    isBurned,
    mintTimestamp,
    lastLevelUp,
    pendingRequest,
  };
}

function decodePlayerProfile(address: PublicKey, data: Buffer): PlayerProfile {
  let offset = 8; // discriminator

  const ensure = (bytes: number, context: string) => {
    if (offset + bytes > data.length) {
      throw new RangeError(
        `${context} exceeds account size (need ${bytes} bytes, offset ${offset}, len ${data.length})`
      );
    }
  };

  ensure(32, "owner");
  const owner = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  ensure(1, "bump");
  const bump = data[offset++];

  ensure(1, "hero_count");
  const heroCount = data[offset++];

  ensure(1, "free_mints_claimed");
  const freeMintsClaimed = data[offset++] === 1;

  ensure(1, "free_mint_count");
  const freeMintCount = data[offset++];

  ensure(8, "next_hero_id");
  const nextHeroId = data.readBigUInt64LE(offset);
  offset += 8;

  const soulboundHeroIds: (bigint | null)[] = [];
  for (let i = 0; i < FREE_MINT_LIMIT; i++) {
    ensure(1, `soulbound tag ${i}`);
    const tag = data[offset++];
    if (tag === 1) {
      if (offset + 8 <= data.length) {
        soulboundHeroIds.push(data.readBigUInt64LE(offset));
        offset += 8;
      } else {
        soulboundHeroIds.push(null);
      }
    } else {
      soulboundHeroIds.push(null);
    }
  }

  // reserved space (optional if legacy profile shorter)
  if (offset + 32 <= data.length) {
    offset += 32;
  }

  return {
    address,
    owner,
    bump,
    heroCount,
    freeMintsClaimed,
    freeMintCount,
    nextHeroId,
    soulboundHeroIds,
  };
}

function decodeSkill(buffer: Buffer, offset: number) {
  const id = buffer[offset++];
  const name = "skill";
  return { skill: { id, name }, nextOffset: offset };
}

function decodeQuirkArray(buffer: Buffer, startOffset: number, length: number) {
  let offset = startOffset;
  const values: number[] = [];
  for (let i = 0; i < length; i++) {
    const tag = buffer[offset++];
    if (tag === 1) {
      values.push(buffer[offset++]);
    }
  }
  return { values, nextOffset: offset };
}

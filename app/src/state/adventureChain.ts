import {
  BorshInstructionCoder,
  AnchorProvider,
  Program,
} from "@coral-xyz/anchor";
import type { IdlAccounts } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import adventureIdl from "../../../target/idl/adventure_engine.json";
import type { AdventureEngine } from "../../../target/types/adventure_engine";
import { TRAIT_NONE } from "./traitCatalog";
export { TRAIT_NONE } from "./traitCatalog";

export const ADVENTURE_ENGINE_PROGRAM_ID = new PublicKey(adventureIdl.address);
export const HERO_CORE_PROGRAM_ID = new PublicKey(
  "B8KfNvRUoNbF7FPeuDdZ7nfjPXz6kAex4Pye6GcpLD1E"
);
export const PLAYER_ECONOMY_PROGRAM_ID = new PublicKey(
  "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
);
// MagicBlock delegation endpoints retained for future reactivation.
// export const DELEGATION_PROGRAM_ID = new PublicKey(
//   "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
// );
// export const MAGIC_PROGRAM_ID = new PublicKey(
//   "Magic11111111111111111111111111111111111111"
// );
// export const MAGIC_CONTEXT_ID = new PublicKey(
//   "MagicContext1111111111111111111111111111111"
// );
const ADVENTURE_SEED = Buffer.from("adventure");
const HERO_LOCK_SEED = Buffer.from("hero-lock");
const BUFFER_SEED = Buffer.from("buffer");
const DELEGATION_RECORD_SEED = Buffer.from("delegation");
const DELEGATION_METADATA_SEED = Buffer.from("delegation-metadata");
const PLAYER_ECONOMY_SEED = Buffer.from("player_economy");

// Create instruction coder
const instructionCoder = new BorshInstructionCoder(adventureIdl as any);

type AdventureSessionAccount = IdlAccounts<AdventureEngine>["adventureSession"];

export type ChainAdventure = {
  publicKey: string;
  player: string;
  dungeonMint: string;
  bump: number;
  seed: number;
  width: number;
  height: number;
  isActive: boolean;
  heroesInside: boolean;
  heroCount: number;
  heroMints: string[];
  heroSnapshots: ChainHeroSnapshot[];
  partyPosition: { x: number; y: number };
  itemCount: number;
  items: ItemSlot[];
  delegate: string | null;
  grid: number[];
  rooms: { x: number; y: number; w: number; h: number }[];
  doors: { x: number; y: number }[];
  chests: { x: number; y: number }[];
  portals: { x: number; y: number }[];
  openedChests: number[];
  usedPortals: number[];
  lastExitPortal: number;
  lastExitPosition: { x: number; y: number };
  createdAt: number;
  lastStartedAt: number;
  lastResetAt: number;
  lastCrewTimestamp: number;
  lastCrewCount: number;
  lastCrew: string[];
  torch: number;
};

export type ItemSlot = {
  itemKey: number;
  quantity: number;
};

export type ChainHeroSnapshot = {
  heroId: number;
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
  stress: number;
  stressMax: number;
  positiveTraits: number[];
  negativeTraits: number[];
};

// Readonly wallet for fetching/readonly program calls
function createReadonlyWallet(publicKey: PublicKey) {
  const dummyKeypair = Keypair.generate();
  return {
    publicKey,
    payer: dummyKeypair,
    signTransaction: async <T>(tx: T): Promise<T> => tx,
    signAllTransactions: async <T>(txs: T[]): Promise<T[]> => txs,
  };
}

function getProvider(connection: Connection, walletKey?: PublicKey) {
  const wallet = createReadonlyWallet(walletKey ?? PublicKey.default);
  return new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
}

export function getAdventureProgram(
  connection: Connection,
  walletKey?: PublicKey
) {
  const provider = getProvider(connection, walletKey);
  return new Program<AdventureEngine>(
    adventureIdl as AdventureEngine,
    provider
  );
}

// ---------- PDA helpers ----------

export function deriveAdventurePda(
  player: PublicKey,
  dungeonMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ADVENTURE_SEED, player.toBuffer(), dungeonMint.toBuffer()],
    ADVENTURE_ENGINE_PROGRAM_ID
  );
}

export function deriveHeroLockPda(heroMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [HERO_LOCK_SEED, heroMint.toBuffer()],
    ADVENTURE_ENGINE_PROGRAM_ID
  );
}

export function deriveAdventureBufferPda(
  adventure: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BUFFER_SEED, adventure.toBuffer()],
    ADVENTURE_ENGINE_PROGRAM_ID
  );
}

// export function deriveDelegationRecordPda(
//   adventure: PublicKey
// ): [PublicKey, number] {
//   return PublicKey.findProgramAddressSync(
//     [DELEGATION_RECORD_SEED, adventure.toBuffer()],
//     DELEGATION_PROGRAM_ID
//   );
// }

// export function deriveDelegationMetadataPda(
//   adventure: PublicKey
// ): [PublicKey, number] {
//   return PublicKey.findProgramAddressSync(
//     [DELEGATION_METADATA_SEED, adventure.toBuffer()],
//     DELEGATION_PROGRAM_ID
//   );
// }

// ---------- Fetch & mapping ----------

export async function fetchAdventureSession(
  connection: Connection,
  adventurePda: PublicKey
): Promise<ChainAdventure | null> {
  const program = getAdventureProgram(connection);
  const account = await program.account.adventureSession.fetchNullable(
    adventurePda
  );
  if (!account) return null;
  return mapAdventureAccount(adventurePda, account);
}

// export async function isAdventureDelegated(
//   connection: Connection,
//   adventurePda: PublicKey
// ): Promise<boolean> {
//   try {
//     const accountInfo = await connection.getAccountInfo(adventurePda);
//     if (!accountInfo) return false;
//
//     // If delegated, the owner will be the delegation program, not the adventure program
//     return !accountInfo.owner.equals(ADVENTURE_ENGINE_PROGRAM_ID);
//   } catch (err) {
//     console.error("[adventureChain] Failed to check delegation status:", err);
//     return false;
//   }
// }

/** Fetch adventure session directly from the base layer (MagicBlock disabled). */
export async function fetchAdventureSessionSmart(
  baseConnection: Connection,
  _ephemeralConnection: Connection | null,
  adventurePda: PublicKey
): Promise<ChainAdventure | null> {
  try {
    // MagicBlock delegation disabled: always read from base layer.
    return fetchAdventureSession(baseConnection, adventurePda);
  } catch (err) {
    console.error("[adventureChain] Failed to fetch adventure:", err);
    return null;
  }
}

export function mapAdventureAccount(
  pubkey: PublicKey,
  account: AdventureSessionAccount
): ChainAdventure {
  const width = Number(account.width);
  const height = Number(account.height);

  const readTraitSlots = (
    slots: readonly number[] | Uint8Array | undefined
  ): number[] => {
    const values = Array.from(slots ?? []);
    while (values.length < 3) values.push(TRAIT_NONE);
    return values.map((value) => Number(value));
  };

  const heroSnapshots: ChainHeroSnapshot[] = account.heroSnapshots.map(
    (snapshot) => ({
      heroId: Number(snapshot.heroId),
      heroType: Number(snapshot.heroType),
      level: Number(snapshot.level),
      experience: Number(snapshot.experience),
      maxHp: Number(snapshot.maxHp),
      currentHp: Number(snapshot.currentHp),
      attack: Number(snapshot.attack),
      defense: Number(snapshot.defense),
      magic: Number(snapshot.magic),
      resistance: Number(snapshot.resistance),
      speed: Number(snapshot.speed),
      luck: Number(snapshot.luck),
      statusEffects: Number(snapshot.statusEffects),
      stress: Number(snapshot.stress),
      stressMax: Number(snapshot.stressMax),
      positiveTraits: readTraitSlots(snapshot.positiveTraits),
      negativeTraits: readTraitSlots(snapshot.negativeTraits),
    })
  );

  const rooms = account.rooms.map((room) => ({
    x: Number(room.x),
    y: Number(room.y),
    w: Number(room.w),
    h: Number(room.h),
  }));

  const doors = account.doors.map((door) => ({
    x: Number(door.x),
    y: Number(door.y),
  }));

  const chests = account.chests.map((chest) => ({
    x: Number(chest.x),
    y: Number(chest.y),
  }));

  const portals = account.portals.map((portal) => ({
    x: Number(portal.x),
    y: Number(portal.y),
  }));

  // Map items (NEW)
  const items: ItemSlot[] = account.items.map((item) => ({
    itemKey: Number(item.itemKey),
    quantity: Number(item.quantity),
  }));

  const openedChests = Array.from(account.openedChests).map(Number);
  const usedPortals = Array.from(account.usedPortals).map(Number);

  const lastExitPosition = {
    x: Number(account.lastExitPosition.x),
    y: Number(account.lastExitPosition.y),
  };

  const partyPosition = {
    x: Number(account.partyPosition.x),
    y: Number(account.partyPosition.y),
  };

  // Map lastCrew (NEW)
  const lastCrew = account.lastCrew.map((key) => key.toBase58());

  return {
    publicKey: pubkey.toBase58(),
    player: account.player.toBase58(),
    dungeonMint: account.dungeonMint.toBase58(),
    bump: Number(account.bump),
    seed: Number(account.seed),
    width,
    height,
    isActive: Boolean(account.isActive),
    heroesInside: Boolean(account.heroesInside),
    heroCount: Number(account.heroCount),
    heroMints: account.heroMints.map((key) => key.toBase58()),
    heroSnapshots,
    partyPosition,
    itemCount: Number(account.itemCount),
    items,
    delegate: account.delegate ? account.delegate.toBase58() : null,
    grid: Array.from(account.grid).map(Number),
    rooms,
    doors,
    chests,
    portals,
    openedChests,
    usedPortals,
    lastExitPortal: Number(account.lastExitPortal),
    lastExitPosition,
    createdAt: Number(account.createdAt),
    lastStartedAt: Number(account.lastStartedAt),
    lastResetAt: Number(account.lastResetAt),
    lastCrewTimestamp: Number(account.lastCrewTimestamp),
    lastCrewCount: Number(account.lastCrewCount),
    lastCrew,
    torch: Number(account.torch),
  };
}

// Helper functions for working with items
export const ItemSlotHelper = {
  EMPTY_KEY: 255,

  isEmpty(item: ItemSlot): boolean {
    return item.itemKey === this.EMPTY_KEY || item.quantity === 0;
  },

  empty(): ItemSlot {
    return {
      itemKey: this.EMPTY_KEY,
      quantity: 0,
    };
  },
};

// ---------- Instruction builders using BorshInstructionCoder ----------

export async function createStartAdventureInstruction(options: {
  connection: Connection;
  player: PublicKey;
  dungeonMint: PublicKey;
  heroMints: PublicKey[];
  items?: { item_key: number; quantity: number }[];
}): Promise<{
  instruction: TransactionInstruction;
  adventurePda: PublicKey;
  heroLockPdas: PublicKey[];
}> {
  const { player, dungeonMint, heroMints, items = [] } = options;

  // SORT THE HERO MINTS TO MATCH RUST CODE
  const sortedHeroMints = [...heroMints].sort((a, b) => {
    const aBytes = a.toBuffer();
    const bBytes = b.toBuffer();
    return aBytes.compare(bBytes);
  });

  const [adventurePda] = deriveAdventurePda(player, dungeonMint);
  const heroLockPdas = sortedHeroMints.map(
    (mint) => deriveHeroLockPda(mint)[0]
  );

  // Derive player economy PDA
  const [playerEconomyPda] = PublicKey.findProgramAddressSync(
    [PLAYER_ECONOMY_SEED, player.toBuffer()],
    PLAYER_ECONOMY_PROGRAM_ID
  );

  // Encode instruction using BorshInstructionCoder
  const data = instructionCoder.encode("start_adventure", {
    hero_mints: sortedHeroMints,
    items: items,
  });

  // Build the account keys
  const keys = [
    { pubkey: player, isSigner: true, isWritable: true },
    { pubkey: dungeonMint, isSigner: false, isWritable: false },
    { pubkey: adventurePda, isSigner: false, isWritable: true },
    { pubkey: playerEconomyPda, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: HERO_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: PLAYER_ECONOMY_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  // Add remaining accounts: [hero_mint, lock_pda] * N
  for (let i = 0; i < sortedHeroMints.length; i++) {
    const heroMint = sortedHeroMints[i];
    const lockPda = heroLockPdas[i];

    keys.push({
      pubkey: heroMint,
      isSigner: false,
      isWritable: true,
    });

    keys.push({
      pubkey: lockPda,
      isSigner: false,
      isWritable: true,
    });
  }

  const instruction = new TransactionInstruction({
    programId: ADVENTURE_ENGINE_PROGRAM_ID,
    keys,
    data,
  });

  return {
    instruction,
    adventurePda,
    heroLockPdas,
  };
}

export async function createSetDelegateInstruction(options: {
  connection: Connection;
  payer: PublicKey;
  adventurePda: PublicKey;
  delegate: PublicKey | null;
}): Promise<{ instruction: TransactionInstruction }> {
  const { payer, adventurePda, delegate } = options;

  const data = instructionCoder.encode("set_delegate", {
    delegate,
  });

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: adventurePda, isSigner: false, isWritable: true },
  ];

  const instruction = new TransactionInstruction({
    programId: ADVENTURE_ENGINE_PROGRAM_ID,
    keys,
    data,
  });

  return { instruction };
}

export async function createDelegateAdventureInstruction(options: {
  connection: Connection;
  payer: PublicKey;
  adventurePda: PublicKey;
  owner: PublicKey;
  dungeonMint: PublicKey;
  validator?: PublicKey;
}): Promise<{ instruction: TransactionInstruction }> {
  void options;
  throw new Error(
    "MagicBlock delegation is disabled while testing on main chain."
  );
}

export async function createProcessUndelegationInstruction(options: {
  connection: Connection;
  payer: PublicKey;
  adventurePda: PublicKey;
  owner: PublicKey;
  dungeonMint: PublicKey;
}): Promise<{
  instruction: TransactionInstruction;
  bufferPda: PublicKey;
}> {
  void options;
  throw new Error(
    "MagicBlock delegation is disabled while testing on main chain."
  );
}

// ---------- Moves ----------

export type AdventureDirection =
  | "north"
  | "northEast"
  | "east"
  | "southEast"
  | "south"
  | "southWest"
  | "west"
  | "northWest";

export function directionVariant(direction: AdventureDirection) {
  switch (direction) {
    case "north":
      return { north: {} } as const;
    case "northEast":
      return { northEast: {} } as const;
    case "east":
      return { east: {} } as const;
    case "southEast":
      return { southEast: {} } as const;
    case "south":
      return { south: {} } as const;
    case "southWest":
      return { southWest: {} } as const;
    case "west":
      return { west: {} } as const;
    case "northWest":
      return { northWest: {} } as const;
    default:
      return { north: {} } as const;
  }
}

export function directionFromDelta(
  dx: number,
  dy: number
): AdventureDirection | null {
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const cx = clamp(dx);
  const cy = clamp(dy);
  if (cx === 0 && cy === -1) return "north";
  if (cx === 1 && cy === -1) return "northEast";
  if (cx === 1 && cy === 0) return "east";
  if (cx === 1 && cy === 1) return "southEast";
  if (cx === 0 && cy === 1) return "south";
  if (cx === -1 && cy === 1) return "southWest";
  if (cx === -1 && cy === 0) return "west";
  if (cx === -1 && cy === -1) return "northWest";
  return null;
}

export async function createMoveHeroInstruction(options: {
  connection: Connection;
  owner: PublicKey;
  authority: PublicKey;
  adventurePda: PublicKey;
  direction: AdventureDirection;
}): Promise<TransactionInstruction> {
  const { connection, owner, authority, adventurePda, direction } = options;
  const program = getAdventureProgram(connection, owner);
  const instruction = await program.methods
    .moveHero(directionVariant(direction))
    .accountsPartial({
      owner,
      authority,
      adventure: adventurePda,
    })
    .instruction();

  return instruction;
}

export async function createExitAdventureInstruction(options: {
  connection: Connection;
  owner: PublicKey;
  authority: PublicKey;
  adventurePda: PublicKey;
  heroMints: PublicKey[];
  fromEphemeral?: boolean;
}): Promise<TransactionInstruction> {
  const { connection, owner, authority, adventurePda, heroMints } = options;
  const program = getAdventureProgram(connection, owner);

  const sortedHeroMints = [...heroMints].sort((a, b) => {
    const aBytes = a.toBuffer();
    const bBytes = b.toBuffer();
    return aBytes.compare(bBytes);
  });

  // Always pass hero accounts to unlock them via CPI to hero-core
  const remainingAccounts = sortedHeroMints.flatMap((heroMint) => {
    const [heroLockPda] = deriveHeroLockPda(heroMint);
    return [
      { pubkey: heroMint, isSigner: false, isWritable: true },
      { pubkey: heroLockPda, isSigner: false, isWritable: true },
    ];
  });

  const instruction = await program.methods
    .exitAdventure()
    .accountsPartial({
      owner,
      authority,
      adventure: adventurePda,
      heroProgram: HERO_CORE_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();

  return instruction;
}

export type HeroLockStatus = {
  heroMint: string;
  isActive: boolean;
  adventure?: string;
  lastUpdated: number;
};

/**
 * Fetch hero lock status for multiple heroes
 * Returns a map of hero mint address to lock status
 */
export async function fetchHeroLockStatuses(
  connection: Connection,
  heroMints: PublicKey[]
): Promise<Map<string, HeroLockStatus>> {
  const statusMap = new Map<string, HeroLockStatus>();

  if (heroMints.length === 0) {
    return statusMap;
  }

  const lockPdas = heroMints.map((mint) => deriveHeroLockPda(mint)[0]);

  try {
    const accountInfos = await connection.getMultipleAccountsInfo(lockPdas);

    heroMints.forEach((heroMint, index) => {
      const accountInfo = accountInfos[index];
      const heroMintStr = heroMint.toBase58();

      if (!accountInfo || !accountInfo.data || accountInfo.data.length < 8) {
        // No lock account exists, hero is not locked
        statusMap.set(heroMintStr, {
          heroMint: heroMintStr,
          isActive: false,
          lastUpdated: 0,
        });
        return;
      }

      try {
        // Decode HeroAdventureLock account
        // Layout: discriminator(8) + hero_mint(32) + owner(32) + adventure(32) + bump(1) + is_active(1) + last_updated(8) + reserved(7)
        const data = accountInfo.data;
        let offset = 8; // Skip discriminator

        // Skip hero_mint
        offset += 32;
        // Skip owner
        offset += 32;

        // Read adventure
        const adventure = new PublicKey(data.subarray(offset, offset + 32));
        offset += 32;

        // Skip bump
        offset += 1;

        // Read is_active
        const isActive = data[offset] === 1;
        offset += 1;

        // Read last_updated
        const lastUpdated = Number(data.readBigInt64LE(offset));

        statusMap.set(heroMintStr, {
          heroMint: heroMintStr,
          isActive,
          adventure: adventure.equals(PublicKey.default)
            ? undefined
            : adventure.toBase58(),
          lastUpdated,
        });
      } catch (err) {
        console.warn(`Failed to decode lock for hero ${heroMintStr}:`, err);
        statusMap.set(heroMintStr, {
          heroMint: heroMintStr,
          isActive: false,
          lastUpdated: 0,
        });
      }
    });
  } catch (err) {
    console.error("Failed to fetch hero lock statuses:", err);
    // Return empty status for all heroes on error
    heroMints.forEach((heroMint) => {
      statusMap.set(heroMint.toBase58(), {
        heroMint: heroMint.toBase58(),
        isActive: false,
        lastUpdated: 0,
      });
    });
  }

  return statusMap;
}

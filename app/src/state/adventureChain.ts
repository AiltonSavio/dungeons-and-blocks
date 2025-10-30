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
// @ts-ignore
const __DELEGATION_RECORD_SEED = Buffer.from("delegation");
// @ts-ignore
const __DELEGATION_METADATA_SEED = Buffer.from("delegation-metadata");
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
  pendingLootCount: number;
  pendingLootSource: number;
  pendingLoot: ItemSlot[];
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
  inCombat: boolean;
  combatAccount: string | null;
  pendingEncounterSeed: bigint;
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

  const pendingLoot: ItemSlot[] = account.pendingLoot.map((item) => ({
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
    pendingLootCount: Number(account.pendingLootCount),
    pendingLootSource: Number(account.pendingLootSource),
    pendingLoot,
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
    inCombat: Boolean(account.inCombat),
    combatAccount:
      account.combatAccount && !account.combatAccount.equals(PublicKey.default)
        ? account.combatAccount.toBase58()
        : null,
    pendingEncounterSeed: BigInt(
      (account.pendingEncounterSeed as any).toString()
    ),
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
  dungeonMint: PublicKey;
  dungeonOwner: PublicKey;
  fromEphemeral?: boolean;
}): Promise<TransactionInstruction> {
  const {
    connection,
    owner,
    authority,
    adventurePda,
    heroMints,
    dungeonMint,
    dungeonOwner,
  } = options;
  const program = getAdventureProgram(connection, owner);

  const sortedHeroMints = [...heroMints].sort((a, b) => {
    const aBytes = a.toBuffer();
    const bBytes = b.toBuffer();
    return aBytes.compare(bBytes);
  });

  const [playerEconomyPda] = PublicKey.findProgramAddressSync(
    [PLAYER_ECONOMY_SEED, owner.toBuffer()],
    PLAYER_ECONOMY_PROGRAM_ID
  );

  const [dungeonOwnerEconomyPda] = PublicKey.findProgramAddressSync(
    [PLAYER_ECONOMY_SEED, dungeonOwner.toBuffer()],
    PLAYER_ECONOMY_PROGRAM_ID
  );

  // Always pass hero accounts to unlock them via CPI to hero-core
  const remainingAccounts = sortedHeroMints.flatMap((heroMint) => {
    const [heroLockPda] = deriveHeroLockPda(heroMint);
    return [
      { pubkey: heroMint, isSigner: false, isWritable: true },
      { pubkey: heroLockPda, isSigner: false, isWritable: true },
    ];
  });

  remainingAccounts.push({
    pubkey: dungeonOwnerEconomyPda,
    isSigner: false,
    isWritable: true,
  });

  const instruction = await program.methods
    .exitAdventure()
    .accountsPartial({
      owner,
      authority,
      adventure: adventurePda,
      heroProgram: HERO_CORE_PROGRAM_ID,
      dungeon: dungeonMint,
      playerEconomy: playerEconomyPda,
      playerEconomyProgram: PLAYER_ECONOMY_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();

  return instruction;
}

// ---------- Loot & Inventory ----------

export async function createOpenChestInstruction(options: {
  connection: Connection;
  owner: PublicKey;
  authority: PublicKey;
  adventurePda: PublicKey;
  chestIndex: number;
}): Promise<TransactionInstruction> {
  const { connection, owner, authority, adventurePda, chestIndex } = options;
  const program = getAdventureProgram(connection, owner);

  const instruction = await program.methods
    .openChest(chestIndex)
    .accountsPartial({
      owner,
      authority,
      adventure: adventurePda,
    })
    .instruction();

  return instruction;
}

export async function createPickupItemInstruction(options: {
  connection: Connection;
  owner: PublicKey;
  authority: PublicKey;
  adventurePda: PublicKey;
  itemKey: number;
  quantity: number;
}): Promise<TransactionInstruction> {
  const { connection, owner, authority, adventurePda, itemKey, quantity } =
    options;
  const program = getAdventureProgram(connection, owner);

  const instruction = await program.methods
    .pickupItem(itemKey, quantity)
    .accountsPartial({
      owner,
      authority,
      adventure: adventurePda,
    })
    .instruction();

  return instruction;
}

export async function createDropItemInstruction(options: {
  connection: Connection;
  owner: PublicKey;
  authority: PublicKey;
  adventurePda: PublicKey;
  itemKey: number;
  quantity: number;
}): Promise<TransactionInstruction> {
  const { connection, owner, authority, adventurePda, itemKey, quantity } =
    options;
  const program = getAdventureProgram(connection, owner);

  const instruction = await program.methods
    .dropItem(itemKey, quantity)
    .accountsPartial({
      owner,
      authority,
      adventure: adventurePda,
    })
    .instruction();

  return instruction;
}

export async function createSwapItemInstruction(options: {
  connection: Connection;
  owner: PublicKey;
  authority: PublicKey;
  adventurePda: PublicKey;
  dropItemKey: number;
  dropQuantity: number;
  pickupItemKey: number;
  pickupQuantity: number;
}): Promise<TransactionInstruction> {
  const {
    connection,
    owner,
    authority,
    adventurePda,
    dropItemKey,
    dropQuantity,
    pickupItemKey,
    pickupQuantity,
  } = options;
  const program = getAdventureProgram(connection, owner);

  const instruction = await program.methods
    .swapItem(dropItemKey, dropQuantity, pickupItemKey, pickupQuantity)
    .accountsPartial({
      owner,
      authority,
      adventure: adventurePda,
    })
    .instruction();

  return instruction;
}

export async function createUseItemInstruction(options: {
  connection: Connection;
  owner: PublicKey;
  authority: PublicKey;
  adventurePda: PublicKey;
  itemKey: number;
  quantity: number;
}): Promise<TransactionInstruction> {
  const { connection, owner, authority, adventurePda, itemKey, quantity } =
    options;
  const program = getAdventureProgram(connection, owner);

  const instruction = await program.methods
    .useItem(itemKey, quantity)
    .accountsPartial({
      owner,
      authority,
      adventure: adventurePda,
    })
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

// ========== COMBAT SYSTEM ==========

const COMBAT_SEED = Buffer.from("combat");

export type ChainCombat = {
  publicKey: string;
  adventure: string;
  bump: number;
  active: boolean;
  round: number;
  turnCursor: number;
  turn: {
    isHero: boolean;
    actorIndex: number;
    slotIndex: number;
  };
  rngState: bigint;
  torch: number;
  heroCount: number;
  enemyCount: number;
  heroes: ChainHeroCombatant[];
  enemies: ChainEnemyCombatant[];
  initiative: ChainInitiativeSlot[];
  resolution: {
    pending: boolean;
    victory: boolean;
  };
  lastUpdated: number;
};

export type ChainHeroCombatant = {
  heroIndex: number;
  alive: boolean;
  ap: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  magic: number;
  resistance: number;
  speed: number;
  luck: number;
  stress: number;
  killStreak: number;
  guard: boolean;
  statuses: ChainStatusInstance[];
  pendingXp: number;
  pendingPositiveTraits: number;
  pendingNegativeTraits: number;
};

export type ChainEnemyCombatant = {
  kind: number;
  alive: boolean;
  ap: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  magic: number;
  resistance: number;
  speed: number;
  luck: number;
  statuses: ChainStatusInstance[];
  threat: number;
};

export type ChainStatusInstance = {
  effect: StatusEffect;
  duration: number;
  stacks: number;
};

export type ChainInitiativeSlot = {
  kind: number; // 0 = Hero, 1 = Enemy, 2 = None
  index: number;
  speed: number;
  active: boolean;
  order: number;
};

export enum CombatResolutionState {
  Active = 0,
  Victory = 1,
  Defeat = 2,
  Escape = 3,
}

export enum StatusEffect {
  None = 0,
  Poison = 1,
  Bleed = 2,
  Burn = 3,
  Chill = 4,
  Guard = 5,
}

export enum HeroActionKind {
  Attack = 0,
  Skill1 = 1,
  Skill2 = 2,
  Defend = 3,
  UseItem = 4,
}

export enum TargetSelector {
  Enemy0 = 0,
  Enemy1 = 1,
  Enemy2 = 2,
  Enemy3 = 3,
  Ally0 = 4,
  Ally1 = 5,
  Ally2 = 6,
  Ally3 = 7,
  None = 8,
}

export enum TargetSide {
  Hero = 0,
  Enemy = 1,
}

const ACTION_VARIANT: Record<
  HeroActionKind,
  "attack" | "skill1" | "skill2" | "defend" | "useItem"
> = {
  [HeroActionKind.Attack]: "attack",
  [HeroActionKind.Skill1]: "skill1",
  [HeroActionKind.Skill2]: "skill2",
  [HeroActionKind.Defend]: "defend",
  [HeroActionKind.UseItem]: "useItem",
};

/** Derive the combat PDA from adventure key */
export function deriveCombatPda(adventureKey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [COMBAT_SEED, adventureKey.toBuffer()],
    ADVENTURE_ENGINE_PROGRAM_ID
  );
}

/** Fetch combat state for an adventure */
export async function fetchCombatState(
  connection: Connection,
  combatPda: PublicKey
): Promise<ChainCombat | null> {
  try {
    const program = getAdventureProgram(connection);
    const acc: any = await program.account.adventureCombat.fetch(combatPda);

    // Helpers
    const num = (v: any) => (typeof v === "number" ? v : Number(v));
    const big = (v: any) => {
      try {
        if (typeof v === "bigint") return v;
        if (typeof v === "number") return BigInt(v);
        return BigInt(v?.toString?.() ?? String(v));
      } catch {
        return 0n;
      }
    };
    const to58 = (pk: any) => (pk?.toBase58 ? pk.toBase58() : String(pk));

    // Normalize initiative entries (array of fixed 8, but only first initiativeLen are relevant)
    const rawInit: any[] = Array.isArray(acc.initiative) ? acc.initiative : [];
    const initLen = Math.min(
      num(acc.initiativeLen ?? rawInit.length),
      rawInit.length
    );

    const parseKind = (slot: any): number => {
      const k = slot?.occupantKind ?? slot?.kind;
      if (typeof k === "number") {
        if (k === 1) return 0; // hero
        if (k === 2) return 1; // enemy
        return 2; // none/empty
      }
      if (k?.hero !== undefined) return 0;
      if (k?.enemy !== undefined) return 1;
      return 2;
    };

    const initiative: ChainInitiativeSlot[] = Array.from({
      length: initLen,
    }).map((_, idx) => {
      const slot = rawInit[idx] ?? {};
      return {
        kind: parseKind(slot),
        index: num(slot?.index ?? slot?.occupantIndex ?? 0),
        speed: num(slot?.initiativeValue ?? slot?.speed ?? 0),
        active: slot?.active !== false,
        order: num(slot?.order ?? idx),
      };
    });

    const cursorRaw = num(acc.turnCursor ?? 0);
    const clampCursor =
      initLen > 0 ? Math.max(0, Math.min(cursorRaw, initLen - 1)) : 0;

    const resolveActiveSlot = (): {
      slot: ChainInitiativeSlot;
      index: number;
    } | null => {
      if (initLen === 0) return null;
      for (let offset = 0; offset < initLen; offset++) {
        const pos = (clampCursor + offset) % initLen;
        const slot = initiative[pos];
        if (!slot) continue;
        if (slot.active && slot.kind !== 2) {
          return { slot, index: pos };
        }
      }
      return null;
    };

    const activeSlot = resolveActiveSlot();
    const turn = activeSlot
      ? {
          isHero: activeSlot.slot.kind === 0,
          actorIndex: activeSlot.slot.index,
          slotIndex: activeSlot.index,
        }
      : { isHero: true, actorIndex: 0, slotIndex: 0 };

    // Normalize resolution enum
    const res: any = acc.pendingResolution ?? acc.resolution;
    const resolution =
      res?.victory !== undefined
        ? { pending: false, victory: true }
        : res?.defeat !== undefined || res?.escape !== undefined
        ? { pending: false, victory: false }
        : { pending: true, victory: false };

    // Map heroes/enemies safely
    const heroes: ChainHeroCombatant[] = (acc.heroes ?? []).map((h: any) => ({
      heroIndex: num(h.heroIndex),
      alive: !!h.alive,
      ap: num(h.ap),
      hp: num(h.hp),
      maxHp: num(h.maxHp),
      attack: num(h.attack),
      defense: num(h.defense),
      magic: num(h.magic),
      resistance: num(h.resistance),
      speed: num(h.speed),
      luck: num(h.luck),
      stress: num(h.stress),
      killStreak: num(h.killStreak),
      guard: !!h.guard,
      statuses: (h.statuses ?? []).map((s: any) => ({
        effect: num(s.effect) as StatusEffect,
        duration: num(s.duration),
        stacks: num(s.stacks),
      })),
      pendingXp: num(h.pendingXp ?? 0),
      pendingPositiveTraits: num(h.pendingPositiveTraits ?? 0),
      pendingNegativeTraits: num(h.pendingNegativeTraits ?? 0),
    }));

    const enemies: ChainEnemyCombatant[] = (acc.enemies ?? []).map(
      (e: any) => ({
        kind: num(e.kind),
        alive: !!e.alive,
        ap: num(e.ap),
        hp: num(e.hp),
        maxHp: num(e.maxHp),
        attack: num(e.attack),
        defense: num(e.defense),
        magic: num(e.magic),
        resistance: num(e.resistance),
        speed: num(e.speed),
        luck: num(e.luck),
        statuses: (e.statuses ?? []).map((s: any) => ({
          effect: num(s.effect) as StatusEffect,
          duration: num(s.duration),
          stacks: num(s.stacks),
        })),
        threat: num(e.threat ?? 0),
      })
    );

    return {
      publicKey: combatPda.toBase58(),
      adventure: to58(acc.adventure),
      bump: num(acc.bump),
      active: !!acc.active,
      round: num(acc.round),
      turnCursor: clampCursor,
      turn,
      rngState: big(acc.rngState),
      torch: num(acc.torch),
      heroCount: num(acc.heroCount),
      enemyCount: num(acc.enemyCount),
      heroes,
      enemies,
      initiative,
      resolution,
      lastUpdated: acc.lastUpdated ? num(acc.lastUpdated) : 0,
    };
  } catch (err) {
    console.log("Error fetching combat state:", err);
    return null;
  }
}

/** Create instruction to begin encounter */
export async function createBeginEncounterInstruction(options: {
  connection: Connection;
  owner: PublicKey;
  authority: PublicKey;
  adventureKey: PublicKey;
}): Promise<TransactionInstruction> {
  const { connection, owner, authority, adventureKey } = options;
  const program = getAdventureProgram(connection, owner);
  const [combatPda] = deriveCombatPda(adventureKey);

  return await program.methods
    .beginEncounter()
    .accountsPartial({
      owner,
      authority,
      adventure: adventureKey,
      combat: combatPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

function targetPayload(
  side: TargetSide,
  idx: number | null
):
  | {
      ally: number;
    }
  | {
      enemy: number;
    }
  | {
      none: {};
    } {
  if (idx == null || Number.isNaN(idx)) {
    return { none: {} };
  }
  const i = Math.max(0, Math.min(3, idx));
  return side === TargetSide.Enemy ? { enemy: i } : { ally: i };
}

/** Create instruction to submit combat action */
export async function createSubmitCombatActionInstruction(options: {
  connection: Connection;
  adventureKey: PublicKey;
  owner: PublicKey;
  authority: PublicKey;
  heroIndex: number;
  action: HeroActionKind;
  targetIndex: number | null;
  targetSide: TargetSide;
  itemKey?: number;
}): Promise<TransactionInstruction> {
  const {
    connection,
    adventureKey,
    owner,
    authority,
    heroIndex,
    action,
    targetIndex,
    targetSide,
    itemKey,
  } = options;

  const program = getAdventureProgram(connection, owner);
  const [combatPda] = deriveCombatPda(adventureKey);

  // ---- Build enum payloads exactly as the IDL expects ----
  const actionKey = ACTION_VARIANT[action];
  if (!actionKey) throw new Error(`Unsupported action variant: ${action}`);

  const target = targetPayload(targetSide, targetIndex);

  console.log("Computed target payload:", target);

  const instructionArgs = {
    heroIndex,
    action: { [actionKey]: {} },
    target,
    itemKey: itemKey ?? null,
  };

  console.log("Submitting combat action:", instructionArgs);

  return await program.methods
    .submitCombatAction(instructionArgs as any)
    .accountsPartial({
      owner,
      authority,
      adventure: adventureKey,
      combat: combatPda,
    })
    .instruction();
}

/** Create instruction to conclude combat */
export async function createConcludeCombatInstruction(options: {
  connection: Connection;
  adventureKey: PublicKey;
  owner: PublicKey;
  authority: PublicKey;
}): Promise<TransactionInstruction> {
  const { connection, adventureKey, owner, authority } = options;
  const program = getAdventureProgram(connection, owner);
  const [combatPda] = deriveCombatPda(adventureKey);

  return await program.methods
    .concludeCombat()
    .accountsPartial({
      owner,
      authority,
      adventure: adventureKey,
      combat: combatPda,
    })
    .instruction();
}

/** Create instruction to decline an encounter */
export async function createDeclineEncounterInstruction(options: {
  connection: Connection;
  owner: PublicKey;
  authority: PublicKey;
  adventureKey: PublicKey;
}): Promise<TransactionInstruction> {
  const { connection, owner, authority, adventureKey } = options;
  const program = getAdventureProgram(connection, owner);

  return await program.methods
    .declineEncounter()
    .accountsPartial({
      owner,
      authority,
      adventure: adventureKey,
    })
    .instruction();
}

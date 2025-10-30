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
  SYSVAR_SLOT_HASHES_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";

import dungeonIdl from "../idl/dungeon_nft.json";
import type { DungeonNft } from "../types/dungeon_nft";

export const DUNGEON_NFT_PROGRAM_ID = new PublicKey(dungeonIdl.address);

const CONFIG_SEED = Buffer.from("config");
const DUNGEON_SEED = Buffer.from("dungeon");
const PROGRAM_IDENTITY_SEED = Buffer.from("identity");

const DEFAULT_VRF_QUEUE = new PublicKey(
  "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
);
const VRF_PROGRAM_ID = new PublicKey(
  "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
);

// Create instruction coder
const instructionCoder = new BorshInstructionCoder(dungeonIdl as any);

type DungeonMintAccount = IdlAccounts<DungeonNft>["dungeonMint"];

// Create a minimal wallet implementation for readonly operations
function createReadonlyWallet(publicKey: PublicKey) {
  // Generate a valid dummy keypair (it won't be used for actual signing)
  const dummyKeypair = Keypair.generate();

  return {
    publicKey,
    payer: dummyKeypair,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      tx: T
    ): Promise<T> => {
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      txs: T[]
    ): Promise<T[]> => {
      return txs;
    },
  };
}

function getProvider(connection: Connection, walletKey?: PublicKey) {
  const wallet = createReadonlyWallet(walletKey ?? PublicKey.default);
  return new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
}

function getProgram(connection: Connection, walletKey?: PublicKey) {
  const provider = getProvider(connection, walletKey);
  return new Program<DungeonNft>(dungeonIdl as DungeonNft, provider);
}

export type ChainDungeon = {
  publicKey: string;
  owner: string;
  mintId: number;
  status: "pending" | "ready";
  gridWidth: number;
  gridHeight: number;
  createdAt: number;
  seed: number;
  randomness: number[];
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  };
};

export type DungeonConfigState = {
  authority: string;
  maxSupply: number;
  nextMintId: number;
  completedMints: number;
  gridWidth: number;
  gridHeight: number;
  collectionName: string;
  collectionSymbol: string;
  baseUri: string;
};

export function deriveConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    DUNGEON_NFT_PROGRAM_ID
  );
}

export function deriveDungeonPda(
  config: PublicKey,
  mintId: number
): [PublicKey, number] {
  const idBuffer = Buffer.alloc(2);
  idBuffer.writeUInt16LE(mintId);
  return PublicKey.findProgramAddressSync(
    [DUNGEON_SEED, config.toBuffer(), idBuffer],
    DUNGEON_NFT_PROGRAM_ID
  );
}

export async function fetchDungeonConfig(
  connection: Connection
): Promise<DungeonConfigState | null> {
  const program = getProgram(connection);
  const [configPda] = deriveConfigPda();
  const account = await program.account.dungeonConfig.fetchNullable(configPda);
  if (!account) return null;
  return {
    authority: account.authority.toBase58(),
    maxSupply: Number(account.maxSupply),
    nextMintId: Number(account.nextMintId),
    completedMints: Number(account.completedMints),
    gridWidth: Number(account.gridWidth),
    gridHeight: Number(account.gridHeight),
    collectionName: account.collectionName,
    collectionSymbol: account.collectionSymbol,
    baseUri: account.baseUri,
  };
}

function mapDungeonAccount(
  pubkey: PublicKey,
  account: DungeonMintAccount
): ChainDungeon {
  const rawStatus = account.status as { ready?: unknown; pending?: unknown };
  const status: "pending" | "ready" = rawStatus.ready ? "ready" : "pending";
  const extras = account as unknown as {
    randomness?: number[];
  };
  const randomness = Array.isArray(extras.randomness)
    ? [...extras.randomness]
    : [];
  return {
    publicKey: pubkey.toBase58(),
    owner: account.owner.toBase58(),
    mintId: Number(account.mintId),
    status,
    gridWidth: Number(account.gridWidth),
    gridHeight: Number(account.gridHeight),
    createdAt: Number(account.createdAt),
    seed: Number(account.seed),
    randomness,
    metadata: {
      name: account.metadata.name,
      symbol: account.metadata.symbol,
      uri: account.metadata.uri,
    },
  };
}

export async function fetchOwnedDungeonAccounts(
  connection: Connection,
  owner?: PublicKey
): Promise<{
  owned: ChainDungeon[];
  others: ChainDungeon[];
}> {
  const program = getProgram(connection);
  const accounts = await program.account.dungeonMint.all();

  const mapped = accounts.map(({ publicKey, account }) =>
    mapDungeonAccount(publicKey, account)
  );
  if (!owner) {
    return {
      owned: [],
      others: mapped,
    };
  }
  const ownerStr = owner.toBase58();
  return {
    owned: mapped.filter((dungeon) => dungeon.owner === ownerStr),
    others: mapped.filter((dungeon) => dungeon.owner !== ownerStr),
  };
}

export async function fetchAllDungeons(
  connection: Connection
): Promise<ChainDungeon[]> {
  const program = getProgram(connection);
  const accounts = await program.account.dungeonMint.all();
  return accounts.map(({ publicKey, account }) =>
    mapDungeonAccount(publicKey, account)
  );
}

export async function fetchDungeonByAddress(
  connection: Connection,
  address: PublicKey
): Promise<ChainDungeon | null> {
  const program = getProgram(connection);
  const account = await program.account.dungeonMint.fetchNullable(address);
  if (!account) return null;
  return mapDungeonAccount(address, account);
}

export async function createMintDungeonInstruction(options: {
  connection: Connection;
  payer: PublicKey;
}): Promise<{ instruction: TransactionInstruction; dungeonPda: PublicKey }> {
  const { connection, payer } = options;
  const program = getProgram(connection, payer);
  const [configPda] = deriveConfigPda();
  const configAccount = await program.account.dungeonConfig.fetch(configPda);
  const nextMintId = Number(configAccount.nextMintId);
  const [dungeonPda] = deriveDungeonPda(configPda, nextMintId);
  const [programIdentity] = PublicKey.findProgramAddressSync(
    [PROGRAM_IDENTITY_SEED],
    DUNGEON_NFT_PROGRAM_ID
  );

  const data = instructionCoder.encode("mint_dungeon", {});

  const instruction = new TransactionInstruction({
    programId: DUNGEON_NFT_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: dungeonPda, isSigner: false, isWritable: true },
      { pubkey: DEFAULT_VRF_QUEUE, isSigner: false, isWritable: true },
      { pubkey: programIdentity, isSigner: false, isWritable: true },
      { pubkey: VRF_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return {
    instruction,
    dungeonPda,
  };
}

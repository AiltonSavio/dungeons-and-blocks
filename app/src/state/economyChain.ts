import { SystemProgram, TransactionInstruction, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";
import type { ItemId } from "./items";

export const PLAYER_ECONOMY_PROGRAM_ID = new PublicKey(
  "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
);

export const PLAYER_ECONOMY_SEED = Buffer.from("player_economy");

export const HOURLY_GRANT_AMOUNT = 200;
export const HOURLY_GRANT_COOLDOWN_SECONDS = 60 * 60;

const DISCRIMINATOR = {
  initialize: Buffer.from([229, 164, 233, 147, 180, 135, 222, 91]),
  buy: Buffer.from([80, 82, 193, 201, 216, 27, 70, 184]),
  sell: Buffer.from([44, 114, 171, 76, 76, 10, 150, 246]),
  grant: Buffer.from([209, 229, 124, 21, 172, 112, 115, 169]),
};

const ITEM_KEY_TO_INDEX: Record<ItemId, number> = {
  pouch_gold: 0,
  stress_tonic: 1,
  minor_torch: 2,
  healing_salve: 3,
  mystery_relic: 4,
  calming_incense: 5,
  phoenix_feather: 6,
};

export function derivePlayerEconomyPda(
  owner: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PLAYER_ECONOMY_SEED, owner.toBuffer()],
    PLAYER_ECONOMY_PROGRAM_ID
  );
}

export function createInitializeEconomyInstruction(owner: PublicKey) {
  const [playerEconomy] = derivePlayerEconomyPda(owner);
  return new TransactionInstruction({
    programId: PLAYER_ECONOMY_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: playerEconomy, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DISCRIMINATOR.initialize,
  });
}

export function createBuyItemInstruction(
  owner: PublicKey,
  item: ItemId,
  quantity: number
) {
  if (!(item in ITEM_KEY_TO_INDEX)) {
    throw new Error(`Unsupported item ${item}`);
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 65535) {
    throw new Error(`Invalid quantity ${quantity}`);
  }
  const [playerEconomy] = derivePlayerEconomyPda(owner);
  const payload = Buffer.alloc(11);
  DISCRIMINATOR.buy.copy(payload, 0);
  payload.writeUInt8(ITEM_KEY_TO_INDEX[item], 8);
  payload.writeUInt16LE(quantity, 9);
  return new TransactionInstruction({
    programId: PLAYER_ECONOMY_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: playerEconomy, isSigner: false, isWritable: true },
    ],
    data: payload,
  });
}

export function createSellItemInstruction(
  owner: PublicKey,
  item: ItemId,
  quantity: number
) {
  if (!(item in ITEM_KEY_TO_INDEX)) {
    throw new Error(`Unsupported item ${item}`);
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 65535) {
    throw new Error(`Invalid quantity ${quantity}`);
  }
  const [playerEconomy] = derivePlayerEconomyPda(owner);
  const payload = Buffer.alloc(11);
  DISCRIMINATOR.sell.copy(payload, 0);
  payload.writeUInt8(ITEM_KEY_TO_INDEX[item], 8);
  payload.writeUInt16LE(quantity, 9);
  return new TransactionInstruction({
    programId: PLAYER_ECONOMY_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: playerEconomy, isSigner: false, isWritable: true },
    ],
    data: payload,
  });
}

export function createGrantHourlyGoldInstruction(owner: PublicKey) {
  const [playerEconomy] = derivePlayerEconomyPda(owner);
  return new TransactionInstruction({
    programId: PLAYER_ECONOMY_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: playerEconomy, isSigner: false, isWritable: true },
    ],
    data: DISCRIMINATOR.grant,
  });
}

export interface PlayerEconomyAccount {
  owner: PublicKey;
  gold: bigint;
  lastGrantTs: bigint;
  items: number[]; // Array of 7 u16 values
  bump: number;
}

/**
 * Fetches the PlayerEconomy account from the blockchain.
 * Returns null if the account doesn't exist.
 */
export async function fetchPlayerEconomy(
  connection: any,
  owner: PublicKey
): Promise<PlayerEconomyAccount | null> {
  const [playerEconomyPda] = derivePlayerEconomyPda(owner);

  try {
    const accountInfo = await connection.getAccountInfo(playerEconomyPda);

    if (!accountInfo || !accountInfo.data) {
      return null;
    }

    const data = accountInfo.data;

    // Account structure:
    // 8 bytes: discriminator
    // 32 bytes: owner (Pubkey)
    // 8 bytes: gold (u64)
    // 8 bytes: last_grant_ts (i64)
    // 14 bytes: items array (7 x u16)
    // 1 byte: bump
    // 5 bytes: reserved

    if (data.length < 76) {
      console.warn("PlayerEconomy account data too short");
      return null;
    }

    let offset = 8; // Skip discriminator

    // Read owner (32 bytes)
    const ownerBytes = data.slice(offset, offset + 32);
    const accountOwner = new PublicKey(ownerBytes);
    offset += 32;

    // Read gold (8 bytes, u64 little-endian)
    const gold = data.readBigUInt64LE(offset);
    offset += 8;

    // Read last_grant_ts (8 bytes, i64 little-endian)
    const lastGrantTs = data.readBigInt64LE(offset);
    offset += 8;

    // Read items array (7 x u16 = 14 bytes)
    const items: number[] = [];
    for (let i = 0; i < 7; i++) {
      items.push(data.readUInt16LE(offset));
      offset += 2;
    }

    // Read bump (1 byte)
    const bump = data.readUInt8(offset);

    return {
      owner: accountOwner,
      gold,
      lastGrantTs,
      items,
      bump,
    };
  } catch (err) {
    console.error("Failed to fetch PlayerEconomy account:", err);
    return null;
  }
}

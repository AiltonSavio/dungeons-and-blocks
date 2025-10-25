#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
const anchor = require("@coral-xyz/anchor");
const {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");
const crypto = require("crypto");

function loadIdl(path) {
  try {
    return require(path);
  } catch {
    return null;
  }
}

const heroIdl =
  loadIdl("../target/idl/hero_core.json") ??
  loadIdl("../app/src/idl/hero_core.json");
const dungeonIdl =
  loadIdl("../target/idl/dungeon_nft.json") ??
  loadIdl("../app/src/idl/dungeon_nft.json");

if (!heroIdl || !dungeonIdl) {
  console.error("Unable to load IDLs. Run `anchor build` first.");
  process.exit(1);
}

const HERO_PROGRAM_ID = new PublicKey(
  heroIdl.metadata?.address ?? heroIdl.address
);
const DUNGEON_PROGRAM_ID = new PublicKey(
  dungeonIdl.metadata?.address ?? dungeonIdl.address
);

const PLAYER_PROFILE_SEED = Buffer.from("player");
const HERO_SEED = Buffer.from("hero");
const CONFIG_SEED = Buffer.from("config");
const DUNGEON_SEED = Buffer.from("dungeon");

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

function parseHeroSeed(input) {
  if (!input) return crypto.randomBytes(32);
  const trimmed = input.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  return crypto.createHash("sha256").update(Buffer.from(trimmed)).digest();
}

function parseDungeonSeed(input) {
  if (!input) return crypto.randomBytes(4).readUInt32LE(0);
  const trimmed = input.trim();
  const value = trimmed.startsWith("0x")
    ? Number.parseInt(trimmed, 16)
    : Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value < 0 || value > 0xffffffff) {
    throw new Error("Invalid dungeon seed. Provide a 32-bit unsigned integer.");
  }
  return value >>> 0;
}

function leBuffer(value, bytes) {
  const buf = Buffer.alloc(bytes);
  if (bytes === 8) buf.writeBigUInt64LE(BigInt(value), 0);
  else if (bytes === 4) buf.writeUInt32LE(Number(value) >>> 0, 0);
  else if (bytes === 2) buf.writeUInt16LE(Number(value) & 0xffff, 0);
  else throw new Error(`Unsupported little-endian width: ${bytes}`);
  return buf;
}

async function main() {
  const walletArg = getArg("--wallet");
  if (!walletArg) {
    console.error(
      "Usage: seeded-mint.js --wallet <TARGET_PUBKEY> [--hero-seed <hex|text>] [--dungeon-seed <u32|0x..>] [--soulbound]"
    );
    process.exit(1);
  }

  const targetOwner = new PublicKey(walletArg);
  const heroSeed = parseHeroSeed(getArg("--hero-seed"));
  const dungeonSeed = parseDungeonSeed(getArg("--dungeon-seed"));
  const markSoulbound = process.argv.includes("--soulbound");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Coder-only (avoids Program namespace/version issues)
  const heroAccountsCoder = new anchor.BorshAccountsCoder(heroIdl);
  const dungeonAccountsCoder = new anchor.BorshAccountsCoder(dungeonIdl);

  console.log("Authority:", provider.wallet.publicKey.toBase58());
  console.log("Target owner:", targetOwner.toBase58());

  // ---------- HERO MINT ----------
  const [playerProfilePda] = PublicKey.findProgramAddressSync(
    [PLAYER_PROFILE_SEED, targetOwner.toBuffer()],
    HERO_PROGRAM_ID
  );

  // fetchNullable manually: decode only if account exists
  let nextHeroId = 0;
  const profileInfo = await provider.connection.getAccountInfo(
    playerProfilePda
  );
  if (profileInfo?.data) {
    try {
      // Account name must match IDL (case-sensitive)
      const profile = heroAccountsCoder.decode(
        "PlayerProfile",
        profileInfo.data
      );
      nextHeroId = Number(profile.next_hero_id ?? profile.nextHeroId ?? 0);
    } catch {
      // If decode fails, treat as not existing
      nextHeroId = 0;
    }
  }

  const heroIdBytes = leBuffer(nextHeroId, 8);
  const [heroMintPda] = PublicKey.findProgramAddressSync(
    [HERO_SEED, targetOwner.toBuffer(), heroIdBytes],
    HERO_PROGRAM_ID
  );

  console.log("Minting hero with seed:", heroSeed.toString("hex"));

  const heroIxData = new anchor.BorshInstructionCoder(heroIdl).encode(
    "mint_hero_with_seed",
    {
      owner: targetOwner,
      seed: Array.from(heroSeed), // [u8;32]
      is_soulbound: markSoulbound,
    }
  );

  const heroIx = new TransactionInstruction({
    programId: HERO_PROGRAM_ID,
    keys: [
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true }, // authority
      { pubkey: targetOwner, isSigner: false, isWritable: false }, // owner
      { pubkey: playerProfilePda, isSigner: false, isWritable: true }, // player_profile
      { pubkey: heroMintPda, isSigner: false, isWritable: true }, // hero_mint
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    data: heroIxData,
  });

  const heroTx = new Transaction().add(heroIx);
  let heroSig;
  try {
    heroSig = await provider.sendAndConfirm(heroTx, [], {
      commitment: "confirmed",
    });
  } catch (e) {
    console.error("Hero mint failed.");
    if (e?.transactionLogs) console.error(e.transactionLogs);
    throw e;
  }

  console.log("  Hero mint tx:", heroSig);
  console.log("  Hero account:", heroMintPda.toBase58());

  // ---------- DUNGEON MINT ----------
  const [configPda] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    DUNGEON_PROGRAM_ID
  );

  const configInfo = await provider.connection.getAccountInfo(configPda);
  if (!configInfo?.data) {
    console.error(
      "Dungeon config not found. Run your config init (e.g. `anchor run init-dungeon-config`) before minting."
    );
    process.exit(1);
  }

  let config;
  try {
    config = dungeonAccountsCoder.decode("DungeonConfig", configInfo.data);
  } catch (e) {
    console.error("Failed to decode DungeonConfig from on-chain data.");
    throw e;
  }

  const nextMintId = Number(config.next_mint_id ?? config.nextMintId); // u16
  const mintIdBytes = leBuffer(nextMintId, 2);

  const [dungeonPda] = PublicKey.findProgramAddressSync(
    [DUNGEON_SEED, configPda.toBuffer(), mintIdBytes],
    DUNGEON_PROGRAM_ID
  );

  console.log("Minting dungeon with seed:", dungeonSeed);

  const dungeonIxData = new anchor.BorshInstructionCoder(dungeonIdl).encode(
    "mint_dungeon_with_seed",
    {
      owner: targetOwner,
      seed: dungeonSeed, // u32
    }
  );

  const dungeonIx = new TransactionInstruction({
    programId: DUNGEON_PROGRAM_ID,
    keys: [
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true }, // authority
      { pubkey: configPda, isSigner: false, isWritable: true }, // config
      { pubkey: dungeonPda, isSigner: false, isWritable: true }, // dungeon
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    data: dungeonIxData,
  });

  const dungeonTx = new Transaction().add(dungeonIx);
  let dungeonSig;
  try {
    dungeonSig = await provider.sendAndConfirm(dungeonTx, [], {
      commitment: "confirmed",
    });
  } catch (e) {
    console.error("Dungeon mint failed.");
    if (e?.transactionLogs) console.error(e.transactionLogs);
    throw e;
  }

  console.log("  Dungeon mint tx:", dungeonSig);
  console.log("  Dungeon account:", dungeonPda.toBase58());
  console.log("✅ Seeded mint complete.");
}

main().catch((err) => {
  if (err?.transactionLogs) {
    console.error("Transaction logs:");
    console.error(err.transactionLogs);
  }
  console.error(err);
  process.exit(1);
});

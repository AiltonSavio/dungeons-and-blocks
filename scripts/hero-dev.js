#!/usr/bin/env node
const anchor = require("@coral-xyz/anchor");
const { PublicKey } = require("@solana/web3.js");

let heroIdl;
try {
  heroIdl = require("../target/idl/hero_core.json");
} catch (e) {
  heroIdl = require("../app/src/idl/hero_core.json");
}

const HERO_PROGRAM_ID = new PublicKey(
  heroIdl.metadata?.address ?? heroIdl.address
);
const HERO_SEED = Buffer.from("hero");
const PLAYER_PROFILE_SEED = Buffer.from("player");

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (part.startsWith("--")) {
      const key = part.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i += 1;
      } else {
        result[key] = true;
      }
    } else if (!result._) {
      result._ = [];
      result._.push(part);
    } else {
      result._.push(part);
    }
  }
  return result;
}

function usage() {
  console.log(`Usage: anchor run hero-dev -- <action> --hero <id> [options]

Actions:
  list             (no arguments - lists all heroes)
  damage           --hero <id> --amount <u8>
  negative-trait   --hero <id> --trait <u8>
  status           --hero <id> --effect <u8>
  experience       --hero <id> --amount <u64>

Examples:
  anchor run hero-dev -- list
  anchor run hero-dev -- damage --hero 0 --amount 5
  anchor run hero-dev -- negative-trait --hero 0 --trait 3
  anchor run hero-dev -- status --hero 0 --effect 1
  anchor run hero-dev -- experience --hero 0 --amount 250
`);
}

function leBuffer(value, bytes) {
  const buf = Buffer.alloc(bytes);
  if (bytes === 8) buf.writeBigUInt64LE(BigInt(value), 0);
  else if (bytes === 4) buf.writeUInt32LE(Number(value) >>> 0, 0);
  else if (bytes === 2) buf.writeUInt16LE(Number(value) & 0xffff, 0);
  else throw new Error(`Unsupported little-endian width: ${bytes}`);
  return buf;
}

async function deriveHeroMint(owner, heroIdBigInt) {
  const heroIdBuffer = leBuffer(heroIdBigInt, 8);
  const [heroMint] = PublicKey.findProgramAddressSync(
    [HERO_SEED, owner.toBuffer(), heroIdBuffer],
    HERO_PROGRAM_ID
  );
  return heroMint;
}

async function listHeroes(provider, owner) {
  console.log("Checking heroes for:", owner.toBase58());

  const [playerProfilePda] = PublicKey.findProgramAddressSync(
    [PLAYER_PROFILE_SEED, owner.toBuffer()],
    HERO_PROGRAM_ID
  );

  console.log("Player Profile PDA:", playerProfilePda.toBase58());

  const accountsCoder = new anchor.BorshAccountsCoder(heroIdl);
  const profileInfo = await provider.connection.getAccountInfo(
    playerProfilePda
  );

  if (!profileInfo?.data) {
    console.log("\n❌ No player profile found. You need to initialize first.");
    console.log("Run: anchor run init-player (if you have that script)");
    console.log("Or mint your first hero to auto-initialize.");
    return;
  }

  let profile;
  try {
    profile = accountsCoder.decode("PlayerProfile", profileInfo.data);
  } catch (e) {
    try {
      profile = accountsCoder.decode("player_profile", profileInfo.data);
    } catch (e2) {
      console.error("Failed to decode player profile:", e2);
      return;
    }
  }

  const nextHeroId = Number(profile.next_hero_id ?? profile.nextHeroId ?? 0);
  console.log(`\n✅ Player profile found. Next hero ID: ${nextHeroId}`);

  if (nextHeroId === 0) {
    console.log("\n❌ No heroes minted yet.");
    console.log(
      "Mint a hero first using: anchor run seeded-mint --provider.cluster localnet -- --wallet",
      owner.toBase58()
    );
    return;
  }

  console.log(`\nFound ${nextHeroId} hero(es). Checking each:\n`);

  for (let i = 0; i < nextHeroId; i++) {
    const heroIdBuffer = leBuffer(i, 8);
    const [heroMintPda] = PublicKey.findProgramAddressSync(
      [HERO_SEED, owner.toBuffer(), heroIdBuffer],
      HERO_PROGRAM_ID
    );

    const heroInfo = await provider.connection.getAccountInfo(heroMintPda);

    if (!heroInfo?.data) {
      console.log(`Hero ${i}: ❌ Not found (${heroMintPda.toBase58()})`);
      continue;
    }

    let hero;
    try {
      hero = accountsCoder.decode("HeroMint", heroInfo.data);
    } catch (e) {
      try {
        hero = accountsCoder.decode("hero_mint", heroInfo.data);
      } catch (e2) {
        console.log(`Hero ${i}: ⚠️  Found but failed to decode`);
        continue;
      }
    }

    console.log(`Hero ${i}: ✅ ${heroMintPda.toBase58()}`);
    console.log(
      `  HP: ${hero.current_hp ?? hero.currentHp}/${hero.max_hp ?? hero.maxHp}`
    );
    console.log(`  Level: ${hero.level}`);
    console.log(`  XP: ${hero.experience}`);
    console.log(`  Burned: ${hero.is_burned ?? hero.isBurned}`);
    console.log();
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    usage();
    process.exit(1);
  }

  const action = argv[0];
  const options = parseArgs(argv.slice(1));

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const owner = provider.wallet.publicKey;

  // Handle "list" action
  if (action === "list") {
    await listHeroes(provider, owner);
    return;
  }

  // For other actions, require --hero argument
  const heroIdRaw = options.hero ?? options.heroId;
  if (!heroIdRaw) {
    console.error("Missing --hero <id> argument.");
    usage();
    process.exit(1);
  }

  const heroIdBigInt = BigInt(heroIdRaw);
  const heroIdBn = new anchor.BN(heroIdBigInt.toString());
  const heroMint = await deriveHeroMint(owner, heroIdBigInt);

  const coder = new anchor.BorshInstructionCoder(heroIdl);
  const { Transaction, TransactionInstruction } = require("@solana/web3.js");

  let instructionName;
  let instructionData;
  let actionDescription;

  switch (action) {
    case "damage": {
      const amountRaw = options.amount ?? options.value;
      if (amountRaw === undefined) {
        throw new Error("Missing --amount <u8> for damage action.");
      }
      const amount = Number(amountRaw);
      if (!Number.isFinite(amount) || amount < 0 || amount > 255) {
        throw new Error("Damage amount must be between 0 and 255.");
      }

      instructionName = "damage_hero";
      instructionData = {
        hero_id: heroIdBn,
        amount: amount,
      };
      actionDescription = `Applied ${amount} damage to hero ${heroIdBigInt}`;
      break;
    }
    case "negative-trait": {
      const traitRaw = options.trait ?? options.index;
      if (traitRaw === undefined) {
        throw new Error("Missing --trait <u8> for negative-trait action.");
      }
      const traitId = Number(traitRaw);
      if (!Number.isFinite(traitId) || traitId < 0 || traitId > 255) {
        throw new Error("Trait id must be between 0 and 255.");
      }

      instructionName = "grant_negative_trait";
      instructionData = {
        hero_id: heroIdBn,
        trait_id: traitId,
      };
      actionDescription = `Granted negative trait ${traitId} to hero ${heroIdBigInt}`;
      break;
    }
    case "status": {
      const effectRaw = options.effect ?? options.index;
      if (effectRaw === undefined) {
        throw new Error("Missing --effect <u8> for status action.");
      }
      const effectType = Number(effectRaw);
      if (!Number.isFinite(effectType) || effectType < 0 || effectType > 255) {
        throw new Error("Status effect must be between 0 and 255.");
      }

      instructionName = "grant_status_effect";
      instructionData = {
        hero_id: heroIdBn,
        effect_type: effectType,
      };
      actionDescription = `Applied status effect ${effectType} to hero ${heroIdBigInt}`;
      break;
    }
    case "experience": {
      const amountRaw = options.amount ?? options.value;
      if (amountRaw === undefined) {
        throw new Error("Missing --amount <u64> for experience action.");
      }
      const amountBigInt = BigInt(amountRaw);
      if (amountBigInt < 0n) {
        throw new Error("Experience amount must be non-negative.");
      }
      const amountBn = new anchor.BN(amountBigInt.toString());

      instructionName = "grant_experience";
      instructionData = {
        hero_id: heroIdBn,
        amount: amountBn,
      };
      actionDescription = `Granted ${amountBigInt} XP to hero ${heroIdBigInt}`;
      break;
    }
    default:
      console.error(`Unknown action "${action}".\n`);
      usage();
      process.exit(1);
  }

  // Encode instruction using BorshInstructionCoder
  const data = coder.encode(instructionName, instructionData);

  // Build the instruction
  const ix = new TransactionInstruction({
    programId: HERO_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true }, // owner
      { pubkey: heroMint, isSigner: false, isWritable: true }, // hero_mint
    ],
    data,
  });

  // Send transaction
  const tx = new Transaction().add(ix);
  let signature;
  try {
    signature = await provider.sendAndConfirm(tx, [], {
      commitment: "confirmed",
    });
  } catch (e) {
    console.error(`${action} action failed.`);
    if (e?.transactionLogs) console.error(e.transactionLogs);
    throw e;
  }

  console.log(`✅ ${actionDescription}`);
  console.log(`Tx: ${signature}`);
}

main().catch((err) => {
  console.error("Command failed:", err);
  process.exit(1);
});

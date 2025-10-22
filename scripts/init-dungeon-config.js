#!/usr/bin/env node
const anchor = require("@coral-xyz/anchor");
const {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");
let idl;
try {
  idl = require("../target/idl/dungeon_nft.json");
} catch (e) {
  idl = require("../app/src/idl/dungeon_nft.json");
}

const PROGRAM_ID = new PublicKey(idl.metadata?.address ?? idl.address);
const CONFIG_SEED = Buffer.from("config");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Compute config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    PROGRAM_ID
  );

  // Early exit if already initialized
  const existing = await provider.connection.getAccountInfo(configPda);
  if (existing) {
    console.log("Dungeon config already initialized at:", configPda.toBase58());
    return;
  }

  // ---- params ----
  const collection_name = "Dungeons";
  const symbol = "DNG";
  const base_uri =
    "https://cdna.artstation.com/p/assets/images/images/004/372/226/large/simon-barle-dungeon-01.jpg?1483072142";
  const grid_width = 80;
  const grid_height = 56;

  console.log("Initializing dungeon config...");
  console.log(`  Authority: ${provider.wallet.publicKey.toBase58()}`);
  console.log(`  Config PDA: ${configPda.toBase58()}`);
  console.log(
    `  Settings: ${collection_name} (${symbol}) @ ${base_uri} [${grid_width}x${grid_height}]`
  );

  // ---- Build instruction data using Anchor's BorshInstructionCoder directly ----
  const coder = new anchor.BorshInstructionCoder(idl);
  const data = coder.encode("initialize_config", {
    collection_name,
    symbol,
    base_uri,
    grid_width,
    grid_height,
  });

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true }, // authority
      { pubkey: configPda, isSigner: false, isWritable: true }, // config
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const sig = await provider.sendAndConfirm(tx, [], {
    commitment: "confirmed",
  });

  console.log("✅ Dungeon config initialized.");
  console.log("Tx:", sig);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

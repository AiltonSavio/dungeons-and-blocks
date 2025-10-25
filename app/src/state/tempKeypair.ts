import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

type SolanaProvider = {
  publicKey?: { toBase58(): string; toString(): string } | null;
  signAndSendTransaction?: (
    tx: Transaction
  ) => Promise<{ signature: string } | string>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
};

/**
 * Derive a deterministic temporary keypair from the player's public key
 */
export function deriveTempKeypair(playerPublicKey: PublicKey): Keypair {
  return Keypair.fromSeed(playerPublicKey.toBytes());
}

/**
 * Check if a temp keypair has sufficient balance
 */
export async function isTempKeypairFunded(
  connection: Connection,
  tempKeypair: Keypair,
  minBalance: number = 0.01 * LAMPORTS_PER_SOL
): Promise<boolean> {
  try {
    const balance = await connection.getBalance(tempKeypair.publicKey);
    return balance >= minBalance;
  } catch (err) {
    console.error("[TempKeypair] Failed to check balance:", err);
    return false;
  }
}

/**
 * Fund the temp keypair with SOL from the player's wallet
 * Returns true if successful, false otherwise
 */
export async function fundTempKeypair(
  connection: Connection,
  provider: SolanaProvider,
  playerPublicKey: PublicKey,
  tempKeypair: Keypair,
  amount: number = 0.1 * LAMPORTS_PER_SOL
): Promise<boolean> {
  try {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: playerPublicKey,
        toPubkey: tempKeypair.publicKey,
        lamports: amount,
      })
    );

    const {
      value: { blockhash, lastValidBlockHeight },
    } = await connection.getLatestBlockhashAndContext();

    transaction.feePayer = playerPublicKey;
    transaction.recentBlockhash = blockhash;

    let signature: string | null = null;

    if (
      provider.signAndSendTransaction &&
      provider.publicKey &&
      provider.publicKey.toBase58() === playerPublicKey.toBase58()
    ) {
      const result = await provider.signAndSendTransaction(transaction);
      signature =
        typeof result === "string" ? result : result.signature ?? null;
    } else if (provider.signTransaction) {
      const signed = await provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
    }

    if (!signature) return false;

    await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      "confirmed"
    );

    console.log(
      "[TempKeypair] Funded successfully:",
      tempKeypair.publicKey.toBase58()
    );
    return true;
  } catch (err) {
    console.error("[TempKeypair] Failed to fund:", err);
    return false;
  }
}

/**
 * Ensure temp keypair is funded, funding it if necessary
 * Returns true if funded (or already was), false if funding failed
 */
export async function ensureTempKeypairFunded(
  connection: Connection,
  provider: SolanaProvider,
  playerPublicKey: PublicKey,
  tempKeypair: Keypair
): Promise<boolean> {
  const isFunded = await isTempKeypairFunded(connection, tempKeypair);
  if (isFunded) {
    const balance = await connection.getBalance(tempKeypair.publicKey);
    console.log(
      "[TempKeypair] Already funded:",
      balance / LAMPORTS_PER_SOL,
      "SOL"
    );
    return true;
  }

  console.log("[TempKeypair] Funding with 0.1 SOL...");
  return fundTempKeypair(connection, provider, playerPublicKey, tempKeypair);
}

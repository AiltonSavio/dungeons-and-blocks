/**
 * MovementService handles ER delegation lifecycle and local prediction hooks.
 * Concrete implementation arrives in later phases.
 */
export interface MovementCommitMetrics {
  batchSeq: number;
  latencyMs: number;
  valid: boolean;
}

export interface MovementService {
  startSession(heroMint: string): Promise<void>;
  stopSession(heroMint: string): Promise<void>;
  pushDelta(delta: unknown): void;
  onCommit(listener: (metrics: MovementCommitMetrics) => void): () => void;
}

export const createMovementService = (): MovementService => {
  throw new Error("MovementService not implemented yet");
};

/**
 * Optimistic Locking Utilities
 *
 * This module implements optimistic concurrency control for database updates.
 * In a tournament environment, multiple score keepers or automated systems
 * may attempt to update the same match record simultaneously. Optimistic
 * locking prevents lost updates by checking a version field before writing.
 *
 * How it works:
 * 1. Each updatable record has an integer `version` field (starts at 0).
 * 2. When updating, the caller provides the `expectedVersion` they read.
 * 3. The update only succeeds if the current DB version matches the expected one.
 * 4. On success, the version is atomically incremented.
 * 5. On version mismatch, an OptimisticLockError is thrown.
 *
 * Retry strategy:
 * - Uses exponential backoff with jitter to retry on version conflicts.
 * - Default: up to 3 retries, starting at 100ms delay, capped at 1000ms.
 * - Jitter prevents thundering herd when multiple clients conflict simultaneously.
 *
 * This pattern is used for BM, MR, GP match updates and TT entry updates,
 * each accessed through mode-specific exported functions.
 */

import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Round data for a Battle Mode match.
 * Each round records the arena and which player (1 or 2) won that round.
 */
export interface BMRound {
  arena: string;
  winner: 1 | 2;
}

/**
 * Round data for a Match Race match.
 * Each round records the course and which player (1 or 2) won that round.
 */
export interface MRRound {
  course: string;
  winner: 1 | 2;
}

/**
 * Race data for a Grand Prix match.
 * Records course, finishing positions, and driver points for both players.
 * Driver points follow the SMK standard: 9, 6, 3, 1 for 1st-4th.
 */
export interface GPRace {
  course: string;
  position1: number;
  position2: number;
  points1: number;
  points2: number;
}

/**
 * Data payload for updating a Time Trial entry.
 * Fields are optional because partial updates are supported (e.g.,
 * updating only the times without changing elimination status).
 */
export interface TTEntryData {
  times?: Record<string, string>;
  totalTime?: number;
  rank?: number;
  eliminated?: boolean;
  lives?: number;
}

/**
 * Type for update data that can be spread into the Prisma update operation.
 * The `version` field uses Prisma's atomic increment syntax.
 * Note: T is intentionally unused in the body but constrains usage at call sites.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type UpdateData<T> = Partial<T> & {
  version?: { increment: number };
};

/**
 * Custom error class for optimistic lock failures.
 * Carries the `currentVersion` so callers can decide whether to
 * re-read and retry or surface the conflict to the user.
 */
export class OptimisticLockError extends Error {
  constructor(message: string, public readonly currentVersion: number) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}

/**
 * Configuration for retry behavior on optimistic lock conflicts.
 *
 * @property maxRetries  - Maximum number of retry attempts after the initial try
 * @property baseDelay   - Starting delay in ms; doubled on each subsequent retry
 * @property maxDelay    - Upper bound on delay to prevent excessively long waits
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

/**
 * Default retry configuration.
 * 3 retries with exponential backoff starting at 100ms, capped at 1 second.
 * These values balance responsiveness with conflict resolution in a
 * typical tournament scenario where conflicts are infrequent but possible.
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 100, // 100ms initial delay
  maxDelay: 1000, // 1 second maximum delay cap
};

/**
 * Calculate the delay for a given retry attempt using exponential backoff with jitter.
 *
 * The base delay doubles with each attempt (100 -> 200 -> 400 -> ...),
 * but is capped at maxDelay. A random jitter of up to baseDelay milliseconds
 * is added to spread out concurrent retries from different clients,
 * preventing synchronized retry storms.
 *
 * @param attempt - Zero-based retry attempt number
 * @param config  - Retry configuration parameters
 * @returns Delay in milliseconds before the next retry
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * 2^attempt, capped at maxDelay
  const delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
  // Add random jitter to decorrelate competing clients' retry timing
  return delay + Math.random() * config.baseDelay;
}

/**
 * Execute a database update within a transaction, retrying on optimistic lock failures.
 *
 * Wraps the provided `updateFn` in a Prisma transaction. If the transaction
 * fails due to an optimistic lock error (detected by `isOptimisticLockError`),
 * the operation is retried after an exponential backoff delay. Non-lock errors
 * are immediately re-thrown without retry.
 *
 * @param prisma   - Prisma client instance
 * @param updateFn - Async function to execute within the transaction
 * @param config   - Optional partial retry configuration overrides
 * @returns The result of the successful transaction
 * @throws The last error if all retries are exhausted, or any non-lock error
 */
export async function updateWithRetry<T>(
  prisma: PrismaClient,
  updateFn: (tx: Prisma.TransactionClient) => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      // Execute the update function within a Prisma interactive transaction
      // to ensure atomicity of the read-check-write cycle
      return await prisma.$transaction(updateFn);
    } catch (error) {
      lastError = error as Error;

      // Only retry on optimistic lock errors (version mismatch).
      // Any other error (network, constraint violation, etc.) is re-thrown immediately
      // to avoid masking unrelated issues.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !isOptimisticLockError(error)) {
        throw error;
      }

      // If this was the last allowed attempt, re-throw to signal exhaustion
      if (attempt === finalConfig.maxRetries) {
        throw error;
      }

      // Wait with exponential backoff + jitter before retrying
      const delay = calculateDelay(attempt, finalConfig);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // TypeScript requires this, though the loop always either returns or throws
  throw lastError!;
}

/**
 * Detect whether a Prisma error represents an optimistic lock failure.
 *
 * Checks for Prisma error code P2025 ("Record to update not found"),
 * which occurs when a WHERE clause including `version: expectedVersion`
 * does not match any row (because another client already incremented it).
 * Also checks the error message for version-related text as a fallback,
 * since the exact error format may vary between Prisma versions.
 *
 * @param error - A known Prisma request error
 * @returns True if the error indicates an optimistic lock conflict
 */
function isOptimisticLockError(error: Prisma.PrismaClientKnownRequestError): boolean {
  return error.message.includes('Record to update not found') ||
         error.message.includes('version') ||
         error.code === 'P2025';
}

/**
 * Prisma model keys for the four updatable match/entry types.
 * Used by the generic `createUpdateFunction` to dynamically access
 * the correct Prisma model within a transaction.
 */
type PrismaModelKeys =
  | 'bMMatch'
  | 'mRMatch'
  | 'gPMatch'
  | 'tTEntry';

/**
 * Factory function that creates a model-specific optimistic lock update function.
 *
 * The generated function:
 * 1. Looks up the record by ID within a transaction
 * 2. Checks that the current version matches expectedVersion
 * 3. If matched, applies the update data and increments the version
 * 4. If mismatched, throws OptimisticLockError with the actual current version
 *
 * Note: Dynamic model access via `(tx as any)[modelName]` is necessary here
 * because Prisma's TransactionClient type does not support generic/dynamic
 * model access. This is a known Prisma limitation. The usage is safe because
 * `modelName` is constrained to PrismaModelKeys at compile time, ensuring
 * only valid model names are used.
 *
 * @param modelName           - Prisma model key (e.g., 'bMMatch')
 * @param defaultNotFoundError - Error message when the record doesn't exist
 * @returns An async function that performs a versioned update with retry
 */
function createUpdateFunction<TModel extends PrismaModelKeys, TData>(
  modelName: TModel,
  defaultNotFoundError: string
) {
  return async function updateWithVersion(
    prisma: PrismaClient,
    id: string,
    expectedVersion: number,
    data: TData
  ): Promise<{ version: number }> {
    return updateWithRetry(prisma, async (tx) => {
      // Dynamic model access - required for the generic pattern
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = (tx as any)[modelName];

      // Step 1: Read the current record to check existence and version
      const current = await model.findUnique({
        where: { id }
      });

      if (!current) {
        // Record not found - surface a clear error with version -1
        // to indicate the record never existed (vs version mismatch)
        throw new OptimisticLockError(defaultNotFoundError, -1);
      }

      // Step 2: Compare versions to detect concurrent modifications
      if (current.version !== expectedVersion) {
        throw new OptimisticLockError(
          `Version mismatch: expected ${expectedVersion}, got ${current.version}`,
          current.version
        );
      }

      // Step 3: Perform the update with version guard in the WHERE clause.
      // The version field in the WHERE acts as a secondary check at the DB level,
      // protecting against race conditions between the findUnique and update calls.
      const updated = await model.update({
        where: {
          id,
          version: expectedVersion
        },
        data: {
          ...data,
          version: { increment: 1 }
        }
      });

      return { version: updated.version };
    });
  };
}

// --- Mode-Specific Update Functions ---
// Each function wraps the generic createUpdateFunction with the appropriate
// Prisma model and field mapping for its competition mode.

/**
 * Internal Battle Mode match score updater, bound to the 'bMMatch' model.
 */
const _updateBMMatchScore = createUpdateFunction(
  'bMMatch',
  'Match not found'
);

/**
 * Update a Battle Mode match score with optimistic locking.
 *
 * BM matches track score1/score2 (rounds won by each player),
 * a completion flag, and optionally the per-round detail data.
 *
 * @param prisma          - Prisma client
 * @param matchId         - ID of the BM match to update
 * @param expectedVersion - Version the caller last read (for conflict detection)
 * @param score1          - Updated score for player 1
 * @param score2          - Updated score for player 2
 * @param completed       - Whether the match is finished (default false)
 * @param rounds          - Optional array of per-round results
 * @returns Object containing the new version number after update
 */
export async function updateBMMatchScore(
  prisma: PrismaClient,
  matchId: string,
  expectedVersion: number,
  score1: number,
  score2: number,
  completed: boolean = false,
  rounds?: BMRound[]
): Promise<{ version: number }> {
  return _updateBMMatchScore(prisma, matchId, expectedVersion, {
    score1,
    score2,
    completed,
    rounds
  });
}

/**
 * Internal Match Race score updater, bound to the 'mRMatch' model.
 */
const _updateMRMatchScore = createUpdateFunction(
  'mRMatch',
  'Match not found'
);

/**
 * Update a Match Race match score with optimistic locking.
 *
 * MR matches track score1/score2 (rounds won), completion flag,
 * and optionally per-round data including the randomly selected course.
 *
 * @param prisma          - Prisma client
 * @param matchId         - ID of the MR match to update
 * @param expectedVersion - Version the caller last read
 * @param score1          - Updated score for player 1
 * @param score2          - Updated score for player 2
 * @param completed       - Whether the match is finished (default false)
 * @param rounds          - Optional array of per-round results
 * @returns Object containing the new version number after update
 */
export async function updateMRMatchScore(
  prisma: PrismaClient,
  matchId: string,
  expectedVersion: number,
  score1: number,
  score2: number,
  completed: boolean = false,
  rounds?: MRRound[]
): Promise<{ version: number }> {
  return _updateMRMatchScore(prisma, matchId, expectedVersion, {
    score1,
    score2,
    completed,
    rounds
  });
}

/**
 * Internal Grand Prix score updater, bound to the 'gPMatch' model.
 */
const _updateGPMatchScore = createUpdateFunction(
  'gPMatch',
  'Match not found'
);

/**
 * Update a Grand Prix match score with optimistic locking.
 *
 * GP matches track cumulative driver points (points1/points2) using the
 * SMK standard scoring (9, 6, 3, 1 for 1st-4th), completion flag,
 * and optionally per-race detail data.
 *
 * @param prisma          - Prisma client
 * @param matchId         - ID of the GP match to update
 * @param expectedVersion - Version the caller last read
 * @param points1         - Updated total driver points for player 1
 * @param points2         - Updated total driver points for player 2
 * @param completed       - Whether the match is finished (default false)
 * @param races           - Optional array of per-race results
 * @returns Object containing the new version number after update
 */
export async function updateGPMatchScore(
  prisma: PrismaClient,
  matchId: string,
  expectedVersion: number,
  points1: number,
  points2: number,
  completed: boolean = false,
  races?: GPRace[]
): Promise<{ version: number }> {
  return _updateGPMatchScore(prisma, matchId, expectedVersion, {
    points1,
    points2,
    completed,
    races
  });
}

/**
 * Internal Time Trial entry updater, bound to the 'tTEntry' model.
 */
const _updateTTEntry = createUpdateFunction(
  'tTEntry',
  'Entry not found'
);

/**
 * Update a Time Trial entry with optimistic locking.
 *
 * TT entries hold per-course times, total time, rank, elimination status,
 * and remaining lives. Updates are partial -- only the fields present
 * in `data` are modified.
 *
 * @param prisma          - Prisma client
 * @param entryId         - ID of the TT entry to update
 * @param expectedVersion - Version the caller last read
 * @param data            - Partial update data (times, totalTime, rank, eliminated, lives)
 * @returns Object containing the new version number after update
 */
export async function updateTTEntry(
  prisma: PrismaClient,
  entryId: string,
  expectedVersion: number,
  data: TTEntryData
): Promise<{ version: number }> {
  return _updateTTEntry(prisma, entryId, expectedVersion, data);
}

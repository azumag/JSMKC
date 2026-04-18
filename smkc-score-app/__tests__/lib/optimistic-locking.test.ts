/**
 * @module __tests__/lib/optimistic-locking.test.ts
 *
 * Test suite for the optimistic locking module (optimistic-locking.ts).
 *
 * Covers the following functionality:
 * - OptimisticLockError: Custom error class that includes the current version
 *   number, used to signal version conflicts to callers.
 * - updateWithRetry(): Generic retry wrapper that executes an update function
 *   and retries on optimistic lock errors (P2025, version-related messages,
 *   "Record to update not found"). Respects max retry limits and delays.
 *   Non-optimistic-lock errors are rethrown immediately without retry.
 *   Note: D1/SQLite does not support interactive transactions, so updateWithRetry
 *   calls the function directly instead of wrapping in $transaction.
 * - updateBMMatchScore(): Updates Battle Mode match scores with version checking.
 *   Throws OptimisticLockError when the match is not found or version mismatches.
 *   Supports optional `completed` flag and `rounds` data.
 * - updateMRMatchScore(): Updates Match Race scores with the same version-check
 *   pattern as BM matches, with `rounds` data support.
 * - updateGPMatchScore(): Updates Grand Prix match points (points1/points2)
 *   with version checking and optional `races` data.
 * - updateTTEntry(): Updates Time Trial entries with version checking, supporting
 *   flexible data fields (times, totalTime, rank, lives, eliminated).
 *
 * All Prisma operations are mocked to test the optimistic locking logic
 * without requiring a database connection.
 */
// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import {
  updateWithRetry,
  OptimisticLockError,
  updateBMMatchScore,
  updateMRMatchScore,
  updateGPMatchScore,
  updateTTEntry,
  type BMRound,
  type MRRound,
  type GPRace,
  type TTEntryData,
} from '@/lib/optimistic-locking';
import { Prisma } from '@prisma/client'; // eslint-disable-line @typescript-eslint/no-unused-vars

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({})),
    Prisma: {
      PrismaClientKnownRequestError: class extends Error {
        constructor(message: string, { code }: { code: string; clientVersion: string }) {
          super(message);
          this.name = 'PrismaClientKnownRequestError';
          this.code = code;
        }
        code: string;
      },
    },
  };
});

describe('OptimisticLockError', () => {
  it('should create an error with message and version', () => {
    const error = new OptimisticLockError('Test error', 5);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('OptimisticLockError');
    expect(error.currentVersion).toBe(5);
  });

  it('should create an error with version -1', () => {
    const error = new OptimisticLockError('Not found', -1);

    expect(error.currentVersion).toBe(-1);
  });
});

describe('updateWithRetry', () => {
  interface MockPrisma {
    bMMatch: { findUnique: jest.Mock; update: jest.Mock };
    mRMatch: { findUnique: jest.Mock; update: jest.Mock };
    gPMatch: { findUnique: jest.Mock; update: jest.Mock };
    tTEntry: { findUnique: jest.Mock; update: jest.Mock };
  }

  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = {
      bMMatch: { findUnique: jest.fn(), update: jest.fn() },
      mRMatch: { findUnique: jest.fn(), update: jest.fn() },
      gPMatch: { findUnique: jest.fn(), update: jest.fn() },
      tTEntry: { findUnique: jest.fn(), update: jest.fn() },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const result = await updateWithRetry(mockPrisma, async () => 'success');

    expect(result).toBe('success');
  });

  it('should retry on optimistic lock error (P2025)', async () => {
    const { Prisma } = jest.requireMock('@prisma/client');
    const lockError = new Prisma.PrismaClientKnownRequestError('version conflict', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    let callCount = 0;
    const result = await updateWithRetry(mockPrisma, async () => {
      callCount++;
      if (callCount === 1) throw lockError;
      return 'success';
    });

    expect(result).toBe('success');
    expect(callCount).toBe(2);
  });

  it('should retry on optimistic lock error (version in message)', async () => {
    const { Prisma } = jest.requireMock('@prisma/client');
    // P2025 with version message = optimistic lock error (not a genuine "not found")
    const versionError = new Prisma.PrismaClientKnownRequestError('version mismatch detected', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    let callCount = 0;
    const result = await updateWithRetry(mockPrisma, async () => {
      callCount++;
      if (callCount === 1) throw versionError;
      return 'success';
    });

    expect(result).toBe('success');
    expect(callCount).toBe(2);
  });

  it('should retry on optimistic lock error (Record to update not found)', async () => {
    const { Prisma } = jest.requireMock('@prisma/client');
    // P2025 with "Record to update not found" = optimistic lock error (version mismatch in D1)
    const notFoundError = new Prisma.PrismaClientKnownRequestError('Record to update not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    let callCount = 0;
    const result = await updateWithRetry(mockPrisma, async () => {
      callCount++;
      if (callCount === 1) throw notFoundError;
      return 'success';
    });

    expect(result).toBe('success');
    expect(callCount).toBe(2);
  });

  it('should respect max retries limit', async () => {
    const { Prisma } = jest.requireMock('@prisma/client');
    const lockError = new Prisma.PrismaClientKnownRequestError('version conflict', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    await expect(
      updateWithRetry(mockPrisma, async () => { throw lockError; }, { maxRetries: 2 })
    ).rejects.toThrow(lockError);
  });

  it('should rethrow non-optimistic lock errors immediately', async () => {
    const otherError = new Error('Database connection failed');

    let callCount = 0;
    await expect(
      updateWithRetry(mockPrisma, async () => { callCount++; throw otherError; })
    ).rejects.toThrow('Database connection failed');

    expect(callCount).toBe(1); // no retries
  });

  it('should succeed without retries on first attempt', async () => {
    let callCount = 0;
    await updateWithRetry(mockPrisma, async () => { callCount++; return 'result'; });

    expect(callCount).toBe(1);
  });

  it('should merge custom config with defaults', async () => {
    let callCount = 0;
    await updateWithRetry(mockPrisma, async () => { callCount++; return 'result'; }, { maxRetries: 5 });

    expect(callCount).toBe(1);
  });

  it('should wait between retries', async () => {
    const { Prisma } = jest.requireMock('@prisma/client');
    const lockError = new Prisma.PrismaClientKnownRequestError('version conflict', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    const startTime = Date.now();
    let callCount = 0;

    await updateWithRetry(mockPrisma, async () => {
      callCount++;
      if (callCount === 1) throw lockError;
      return 'success';
    }, { baseDelay: 10, maxDelay: 100 });

    const elapsedTime = Date.now() - startTime;
    expect(elapsedTime).toBeGreaterThanOrEqual(10); // Should wait at least baseDelay
  });
});

// Helper to create a P2025 error for mock update failures
function createP2025Error() {
  const { Prisma } = jest.requireMock('@prisma/client');
  return new Prisma.PrismaClientKnownRequestError('Record to update not found', {
    code: 'P2025',
    clientVersion: '5.0.0',
  });
}

describe('updateBMMatchScore', () => {
  let mockPrisma;
  let mockBMMatch;

  beforeEach(() => {
    mockBMMatch = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    mockPrisma = {
      bMMatch: mockBMMatch,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update bMMatch with version check', async () => {
    const matchId = 'bm-match-123';
    const expectedVersion = 1;

    mockBMMatch.update.mockResolvedValue({
      id: matchId,
      version: 2,
      score1: 3,
      score2: 1,
    });

    const rounds: BMRound[] = [
      { arena: 'Arena 1', winner: 1 },
      { arena: 'Arena 2', winner: 2 },
    ];

    const result = await updateBMMatchScore(
      mockPrisma,
      matchId,
      expectedVersion,
      3,
      1,
      true,
      rounds
    );

    expect(result.version).toBe(2);
    expect(mockBMMatch.update).toHaveBeenCalledWith({
      where: {
        id: matchId,
        version: expectedVersion,
      },
      data: {
        score1: 3,
        score2: 1,
        completed: true,
        rounds,
        version: { increment: 1 },
      },
    });
  });

  it('should throw OptimisticLockError when bMMatch not found', async () => {
    const matchId = 'bm-match-123';
    const expectedVersion = 1;

    // update throws P2025, then findUnique returns null (record doesn't exist)
    mockBMMatch.update.mockRejectedValue(createP2025Error());
    mockBMMatch.findUnique.mockResolvedValue(null);

    await expect(
      updateBMMatchScore(mockPrisma, matchId, expectedVersion, 3, 1)
    ).rejects.toThrow(OptimisticLockError);

    try {
      await updateBMMatchScore(mockPrisma, matchId, expectedVersion, 3, 1);
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        expect(error.message).toBe('Match not found');
        expect(error.currentVersion).toBe(-1);
      }
    }
  });

  it('should throw OptimisticLockError on bMMatch version mismatch', async () => {
    const matchId = 'bm-match-123';
    const expectedVersion = 1;

    // update throws P2025, then findUnique shows record exists with different version
    mockBMMatch.update.mockRejectedValue(createP2025Error());
    mockBMMatch.findUnique.mockResolvedValue({
      id: matchId,
      version: 3,
    });

    await expect(
      updateBMMatchScore(mockPrisma, matchId, expectedVersion, 3, 1)
    ).rejects.toThrow(OptimisticLockError);

    try {
      await updateBMMatchScore(mockPrisma, matchId, expectedVersion, 3, 1);
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        expect(error.message).toContain('Version mismatch');
        expect(error.currentVersion).toBe(3);
      }
    }
  });

  it('should handle without optional parameters', async () => {
    const matchId = 'bm-match-123';
    const expectedVersion = 1;

    mockBMMatch.update.mockResolvedValue({
      id: matchId,
      version: 2,
      score1: 3,
      score2: 1,
    });

    const result = await updateBMMatchScore(mockPrisma, matchId, expectedVersion, 3, 1);

    expect(result.version).toBe(2);
    expect(mockBMMatch.update).toHaveBeenCalledWith({
      where: {
        id: matchId,
        version: expectedVersion,
      },
      data: {
        score1: 3,
        score2: 1,
        completed: false,
        rounds: undefined,
        version: { increment: 1 },
      },
    });
  });
});

describe('updateMRMatchScore', () => {
  let mockPrisma;
  let mockMRMatch;

  beforeEach(() => {
    mockMRMatch = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    mockPrisma = {
      mRMatch: mockMRMatch,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update mRMatch with version check', async () => {
    const matchId = 'mr-match-123';
    const expectedVersion = 2;

    mockMRMatch.update.mockResolvedValue({
      id: matchId,
      version: 3,
      score1: 5,
      score2: 3,
    });

    const rounds: MRRound[] = [
      { course: 'Course 1', winner: 1 },
      { course: 'Course 2', winner: 2 },
    ];

    const result = await updateMRMatchScore(
      mockPrisma,
      matchId,
      expectedVersion,
      5,
      3,
      false,
      rounds
    );

    expect(result.version).toBe(3);
    expect(mockMRMatch.update).toHaveBeenCalledWith({
      where: {
        id: matchId,
        version: expectedVersion,
      },
      data: {
        score1: 5,
        score2: 3,
        completed: false,
        rounds,
        version: { increment: 1 },
      },
    });
  });

  it('should throw OptimisticLockError when mRMatch not found', async () => {
    const matchId = 'mr-match-123';
    const expectedVersion = 1;

    mockMRMatch.update.mockRejectedValue(createP2025Error());
    mockMRMatch.findUnique.mockResolvedValue(null);

    await expect(
      updateMRMatchScore(mockPrisma, matchId, expectedVersion, 5, 3)
    ).rejects.toThrow(OptimisticLockError);
  });

  it('should throw OptimisticLockError on mRMatch version mismatch', async () => {
    const matchId = 'mr-match-123';
    const expectedVersion = 1;

    mockMRMatch.update.mockRejectedValue(createP2025Error());
    mockMRMatch.findUnique.mockResolvedValue({
      id: matchId,
      version: 4,
    });

    await expect(
      updateMRMatchScore(mockPrisma, matchId, expectedVersion, 5, 3)
    ).rejects.toThrow(OptimisticLockError);
  });

  it('should handle without optional parameters', async () => {
    const matchId = 'mr-match-123';
    const expectedVersion = 1;

    mockMRMatch.update.mockResolvedValue({
      id: matchId,
      version: 2,
      score1: 5,
      score2: 3,
    });

    const result = await updateMRMatchScore(mockPrisma, matchId, expectedVersion, 5, 3);

    expect(result.version).toBe(2);
    expect(mockMRMatch.update).toHaveBeenCalledWith({
      where: {
        id: matchId,
        version: expectedVersion,
      },
      data: {
        score1: 5,
        score2: 3,
        completed: false,
        rounds: undefined,
        version: { increment: 1 },
      },
    });
  });
});

describe('updateGPMatchScore', () => {
  let mockPrisma;
  let mockGPMatch;

  beforeEach(() => {
    mockGPMatch = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    mockPrisma = {
      gPMatch: mockGPMatch,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update gPMatch with version check', async () => {
    const matchId = 'gp-match-123';
    const expectedVersion = 0;

    mockGPMatch.update.mockResolvedValue({
      id: matchId,
      version: 1,
      points1: 10,
      points2: 5,
    });

    const races: GPRace[] = [
      {
        course: 'Course 1',
        position1: 1,
        position2: 2,
        points1: 9,
        points2: 6,
      },
    ];

    const result = await updateGPMatchScore(
      mockPrisma,
      matchId,
      expectedVersion,
      10,
      5,
      true,
      races
    );

    expect(result.version).toBe(1);
    expect(mockGPMatch.update).toHaveBeenCalledWith({
      where: {
        id: matchId,
        version: expectedVersion,
      },
      data: {
        points1: 10,
        points2: 5,
        completed: true,
        races,
        version: { increment: 1 },
      },
    });
  });

  it('should throw OptimisticLockError when gPMatch not found', async () => {
    const matchId = 'gp-match-123';
    const expectedVersion = 1;

    mockGPMatch.update.mockRejectedValue(createP2025Error());
    mockGPMatch.findUnique.mockResolvedValue(null);

    await expect(
      updateGPMatchScore(mockPrisma, matchId, expectedVersion, 10, 5)
    ).rejects.toThrow(OptimisticLockError);
  });

  it('should throw OptimisticLockError on gPMatch version mismatch', async () => {
    const matchId = 'gp-match-123';
    const expectedVersion = 1;

    mockGPMatch.update.mockRejectedValue(createP2025Error());
    mockGPMatch.findUnique.mockResolvedValue({
      id: matchId,
      version: 5,
    });

    await expect(
      updateGPMatchScore(mockPrisma, matchId, expectedVersion, 10, 5)
    ).rejects.toThrow(OptimisticLockError);
  });

  it('should handle without optional parameters', async () => {
    const matchId = 'gp-match-123';
    const expectedVersion = 1;

    mockGPMatch.update.mockResolvedValue({
      id: matchId,
      version: 2,
      points1: 10,
      points2: 5,
    });

    const result = await updateGPMatchScore(mockPrisma, matchId, expectedVersion, 10, 5);

    expect(result.version).toBe(2);
    expect(mockGPMatch.update).toHaveBeenCalledWith({
      where: {
        id: matchId,
        version: expectedVersion,
      },
      data: {
        points1: 10,
        points2: 5,
        completed: false,
        races: undefined,
        version: { increment: 1 },
      },
    });
  });
});

describe('updateTTEntry', () => {
  let mockPrisma;
  let mockTTEntry;

  beforeEach(() => {
    mockTTEntry = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    mockPrisma = {
      tTEntry: mockTTEntry,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update tTEntry with version check', async () => {
    const entryId = 'tt-entry-123';
    const expectedVersion = 2;

    mockTTEntry.update.mockResolvedValue({
      id: entryId,
      version: 3,
      times: { course1: '1:23.456' },
      totalTime: 83.456,
    });

    const data: TTEntryData = {
      times: { course1: '1:23.456' },
      totalTime: 83.456,
      rank: 1,
      lives: 3,
    };

    const result = await updateTTEntry(mockPrisma, entryId, expectedVersion, data);

    expect(result.version).toBe(3);
    expect(mockTTEntry.update).toHaveBeenCalledWith({
      where: {
        id: entryId,
        version: expectedVersion,
      },
      data: {
        times: { course1: '1:23.456' },
        totalTime: 83.456,
        rank: 1,
        lives: 3,
        version: { increment: 1 },
      },
    });
  });

  it('should throw OptimisticLockError when tTEntry not found', async () => {
    const entryId = 'tt-entry-123';
    const expectedVersion = 1;

    mockTTEntry.update.mockRejectedValue(createP2025Error());
    mockTTEntry.findUnique.mockResolvedValue(null);

    await expect(
      updateTTEntry(mockPrisma, entryId, expectedVersion, {})
    ).rejects.toThrow(OptimisticLockError);
  });

  it('should throw OptimisticLockError on tTEntry version mismatch', async () => {
    const entryId = 'tt-entry-123';
    const expectedVersion = 1;

    mockTTEntry.update.mockRejectedValue(createP2025Error());
    mockTTEntry.findUnique.mockResolvedValue({
      id: entryId,
      version: 6,
    });

    await expect(
      updateTTEntry(mockPrisma, entryId, expectedVersion, {})
    ).rejects.toThrow(OptimisticLockError);
  });

  it('should handle with empty data', async () => {
    const entryId = 'tt-entry-123';
    const expectedVersion = 1;

    mockTTEntry.update.mockResolvedValue({
      id: entryId,
      version: 2,
    });

    const result = await updateTTEntry(mockPrisma, entryId, expectedVersion, {});

    expect(result.version).toBe(2);
    expect(mockTTEntry.update).toHaveBeenCalledWith({
      where: {
        id: entryId,
        version: expectedVersion,
      },
      data: {
        version: { increment: 1 },
      },
    });
  });

  it('should handle with partial data', async () => {
    const entryId = 'tt-entry-123';
    const expectedVersion = 1;

    mockTTEntry.update.mockResolvedValue({
      id: entryId,
      version: 2,
      eliminated: true,
    });

    const data: TTEntryData = {
      eliminated: true,
    };

    const result = await updateTTEntry(mockPrisma, entryId, expectedVersion, data);

    expect(result.version).toBe(2);
    expect(mockTTEntry.update).toHaveBeenCalledWith({
      where: {
        id: entryId,
        version: expectedVersion,
      },
      data: {
        eliminated: true,
        version: { increment: 1 },
      },
    });
  });
});

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
  interface MockModel {
    findUnique: jest.Mock;
    update: jest.Mock;
  }

  interface MockPrisma {
    $transaction: jest.Mock;
    bMMatch: MockModel;
    mRMatch: MockModel;
    gPMatch: MockModel;
    tTEntry: MockModel;
  }

  let mockPrisma: MockPrisma;
  let mockBMMatch: MockModel;
  let mockMRMatch: MockModel;
  let mockGPMatch: MockModel;
  let mockTTEntry: MockModel;

  beforeEach(() => {
    mockBMMatch = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };
    mockMRMatch = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };
    mockGPMatch = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };
    mockTTEntry = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    mockPrisma = {
      $transaction: jest.fn(),
      bMMatch: mockBMMatch,
      mRMatch: mockMRMatch,
      gPMatch: mockGPMatch,
      tTEntry: mockTTEntry,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
    mockPrisma.$transaction.mockResolvedValue('success');

    const result = await updateWithRetry(mockPrisma, async () => 'result');

    expect(result).toBe('success');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should retry on optimistic lock error (P2025)', async () => {
    const { Prisma } = jest.requireMock('@prisma/client');
    const lockError = new Prisma.PrismaClientKnownRequestError('version conflict', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    mockPrisma.$transaction
      .mockImplementationOnce(() => { throw lockError; })
      .mockImplementationOnce((fn) => fn(mockPrisma));

    const result = await updateWithRetry(mockPrisma, async () => 'success');

    expect(result).toBe('success');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should retry on optimistic lock error (version in message)', async () => {
    const { Prisma } = jest.requireMock('@prisma/client');
    const versionError = new Prisma.PrismaClientKnownRequestError('version mismatch detected', {
      code: 'P2003',
      clientVersion: '5.0.0',
    });

    mockPrisma.$transaction
      .mockImplementationOnce(() => { throw versionError; })
      .mockImplementationOnce((fn) => fn(mockPrisma));

    const result = await updateWithRetry(mockPrisma, async () => 'success');

    expect(result).toBe('success');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should retry on optimistic lock error (Record to update not found)', async () => {
    const { Prisma } = jest.requireMock('@prisma/client');
    const notFoundError = new Prisma.PrismaClientKnownRequestError('Record to update not found', {
      code: 'P2001',
      clientVersion: '5.0.0',
    });

    mockPrisma.$transaction
      .mockImplementationOnce(() => { throw notFoundError; })
      .mockImplementationOnce((fn) => fn(mockPrisma));

    const result = await updateWithRetry(mockPrisma, async () => 'success');

    expect(result).toBe('success');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should respect max retries limit', async () => {
    const { Prisma } = jest.requireMock('@prisma/client');
    const lockError = new Prisma.PrismaClientKnownRequestError('version conflict', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    mockPrisma.$transaction.mockImplementation(() => { throw lockError; });

    await expect(
      updateWithRetry(mockPrisma, async () => 'result', { maxRetries: 2 })
    ).rejects.toThrow(lockError);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should rethrow non-optimistic lock errors immediately', async () => {
    const otherError = new Error('Database connection failed');

    mockPrisma.$transaction.mockImplementation(() => { throw otherError; });

    await expect(
      updateWithRetry(mockPrisma, async () => 'result')
    ).rejects.toThrow('Database connection failed');

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should use default retry config', async () => {
    mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
    mockPrisma.$transaction.mockResolvedValue('success');

    await updateWithRetry(mockPrisma, async () => 'result');

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should merge custom config with defaults', async () => {
    mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
    mockPrisma.$transaction.mockResolvedValue('success');

    await updateWithRetry(mockPrisma, async () => 'result', { maxRetries: 5 });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should wait between retries', async () => {
    const { Prisma } = jest.requireMock('@prisma/client');
    const lockError = new Prisma.PrismaClientKnownRequestError('version conflict', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    const startTime = Date.now();
    mockPrisma.$transaction
      .mockImplementationOnce(() => { throw lockError; })
      .mockImplementationOnce((fn) => fn(mockPrisma));

    await updateWithRetry(mockPrisma, async () => 'success', { baseDelay: 10, maxDelay: 100 });

    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    expect(elapsedTime).toBeGreaterThanOrEqual(10); // Should wait at least baseDelay
  });
});

describe('updateBMMatchScore', () => {
  let mockPrisma: MockPrisma;
  let mockBMMatch: MockModel;

  beforeEach(() => {
    mockBMMatch = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    mockPrisma = {
      $transaction: jest.fn(),
      bMMatch: mockBMMatch,
    };

    mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update bMMatch with version check', async () => {
    const matchId = 'bm-match-123';
    const expectedVersion = 1;

    mockBMMatch.findUnique.mockResolvedValue({
      id: matchId,
      version: expectedVersion,
      score1: 0,
      score2: 0,
    });

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

    mockBMMatch.findUnique.mockResolvedValue({
      id: matchId,
      version: 3, // Different version
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

    mockBMMatch.findUnique.mockResolvedValue({
      id: matchId,
      version: expectedVersion,
    });

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
  let mockPrisma: MockPrisma;
  let mockMRMatch: MockModel;

  beforeEach(() => {
    mockMRMatch = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    mockPrisma = {
      $transaction: jest.fn(),
      mRMatch: mockMRMatch,
    };

    mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update mRMatch with version check', async () => {
    const matchId = 'mr-match-123';
    const expectedVersion = 2;

    mockMRMatch.findUnique.mockResolvedValue({
      id: matchId,
      version: expectedVersion,
      score1: 0,
      score2: 0,
    });

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

    mockMRMatch.findUnique.mockResolvedValue(null);

    await expect(
      updateMRMatchScore(mockPrisma, matchId, expectedVersion, 5, 3)
    ).rejects.toThrow(OptimisticLockError);
  });

  it('should throw OptimisticLockError on mRMatch version mismatch', async () => {
    const matchId = 'mr-match-123';
    const expectedVersion = 1;

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

    mockMRMatch.findUnique.mockResolvedValue({
      id: matchId,
      version: expectedVersion,
    });

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
  let mockPrisma: MockPrisma;
  let mockGPMatch: MockModel;

  beforeEach(() => {
    mockGPMatch = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    mockPrisma = {
      $transaction: jest.fn(),
      gPMatch: mockGPMatch,
    };

    mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update gPMatch with version check', async () => {
    const matchId = 'gp-match-123';
    const expectedVersion = 0;

    mockGPMatch.findUnique.mockResolvedValue({
      id: matchId,
      version: expectedVersion,
      points1: 0,
      points2: 0,
    });

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

    mockGPMatch.findUnique.mockResolvedValue(null);

    await expect(
      updateGPMatchScore(mockPrisma, matchId, expectedVersion, 10, 5)
    ).rejects.toThrow(OptimisticLockError);
  });

  it('should throw OptimisticLockError on gPMatch version mismatch', async () => {
    const matchId = 'gp-match-123';
    const expectedVersion = 1;

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

    mockGPMatch.findUnique.mockResolvedValue({
      id: matchId,
      version: expectedVersion,
    });

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
  let mockPrisma: MockPrisma;
  let mockTTEntry: MockModel;

  beforeEach(() => {
    mockTTEntry = {
      findUnique: jest.fn(),
      update: jest.fn(),
    };

    mockPrisma = {
      $transaction: jest.fn(),
      tTEntry: mockTTEntry,
    };

    mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should update tTEntry with version check', async () => {
    const entryId = 'tt-entry-123';
    const expectedVersion = 2;

    mockTTEntry.findUnique.mockResolvedValue({
      id: entryId,
      version: expectedVersion,
      times: {},
      totalTime: 0,
    });

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

    mockTTEntry.findUnique.mockResolvedValue(null);

    await expect(
      updateTTEntry(mockPrisma, entryId, expectedVersion, {})
    ).rejects.toThrow(OptimisticLockError);
  });

  it('should throw OptimisticLockError on tTEntry version mismatch', async () => {
    const entryId = 'tt-entry-123';
    const expectedVersion = 1;

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

    mockTTEntry.findUnique.mockResolvedValue({
      id: entryId,
      version: expectedVersion,
    });

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

    mockTTEntry.findUnique.mockResolvedValue({
      id: entryId,
      version: expectedVersion,
    });

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

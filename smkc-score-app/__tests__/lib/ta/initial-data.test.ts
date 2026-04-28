/**
 * Unit tests for fetchTaInitialData (src/lib/ta/initial-data.ts).
 *
 * Covers:
 * - Returns null when resolveTournament returns null (issue #786).
 * - Returns null when an error is thrown (catch-all fallback).
 * - Returns correct TaInitialData when tournament exists.
 * - Sets qualificationRegistrationLocked=true when a knockout entry exists.
 */

import { fetchTaInitialData } from '@/lib/ta/initial-data';

jest.mock('@/lib/prisma');
jest.mock('@/lib/tournament-identifier');

import prisma from '@/lib/prisma';
import { resolveTournament } from '@/lib/tournament-identifier';

// jest.mocked provides proper TypeScript types for the auto-mocked module.
const mockPrisma = jest.mocked(prisma);
const mockResolveTournament = jest.mocked(resolveTournament);

describe('fetchTaInitialData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when resolveTournament returns null', async () => {
    mockResolveTournament.mockResolvedValue(null);

    const result = await fetchTaInitialData('nonexistent-id');

    expect(result).toBeNull();
    // Prisma queries should NOT be called when tournament is not found.
    expect(mockPrisma.tTEntry.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.player.findMany).not.toHaveBeenCalled();
  });

  it('returns null when an unexpected error is thrown', async () => {
    mockResolveTournament.mockRejectedValue(new Error('DB error'));

    const result = await fetchTaInitialData('some-id');

    expect(result).toBeNull();
  });

  it('returns TaInitialData with qualificationRegistrationLocked=false when no knockout entries exist', async () => {
    mockResolveTournament.mockResolvedValue({ id: 'tid-1', frozenStages: [] });

    const mockEntries = [{ id: 'e1', stage: 'qualification' }];
    const mockPlayers = [{ id: 'p1', name: 'Alice', nickname: 'alice', country: null, noCamera: false }];

    // findMany is called once for qualification entries.
    // hasKnockoutStageStarted uses findFirst (not findMany), so no second findMany call needed.
    // jest.mocked() on individual methods is required because jest.mocked(prisma) shallow-mocks
    // only the top-level delegate references, not the methods within each delegate.
    jest.mocked(prisma.tTEntry.findMany).mockResolvedValueOnce(mockEntries as never);
    jest.mocked(prisma.tTEntry.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.player.findMany).mockResolvedValue(mockPlayers as never);

    const result = await fetchTaInitialData('tid-1');

    expect(result).not.toBeNull();
    expect(result!.entries).toEqual(mockEntries);
    expect(result!.allPlayers).toEqual(mockPlayers);
    expect(result!.qualificationRegistrationLocked).toBe(false);
    expect(result!.frozenStages).toEqual([]);
  });

  it('returns qualificationRegistrationLocked=true when a phase1 entry exists', async () => {
    mockResolveTournament.mockResolvedValue({ id: 'tid-2', frozenStages: ['phase1'] });

    jest.mocked(prisma.tTEntry.findMany).mockResolvedValue([] as never);
    jest.mocked(prisma.tTEntry.findFirst).mockResolvedValue({ id: 'phase-entry' } as never);
    jest.mocked(prisma.player.findMany).mockResolvedValue([] as never);

    const result = await fetchTaInitialData('tid-2');

    expect(result).not.toBeNull();
    expect(result!.qualificationRegistrationLocked).toBe(true);
    expect(result!.frozenStages).toEqual(['phase1']);
  });
});

// @ts-nocheck

jest.mock('next/server', () => ({
  NextRequest: class NextRequest {},
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    tournament: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/db-read-retry', () => ({
  retryDbRead: jest.fn((operation) => operation()),
}));

jest.mock('@/lib/tournament-identifier', () => ({
  resolveTournamentId: jest.fn(async (id) => id),
}));

jest.mock('@/lib/tournament-archive', () => ({
  readTournamentArchive: jest.fn(),
}));

jest.mock('@/lib/ta/course-selection', () => ({
  getAvailableCourses: jest.fn(() => []),
  getPlayedCoursesWithSuddenDeath: jest.fn(),
}));

jest.mock('@/lib/ta/phase-rules-dto', () => ({
  buildPhase3RulesDto: jest.fn(() => ({
    phase3Rules: {
      initialLives: 3,
      lifeResetThresholds: [],
      survivorsNeeded: 1,
      handicapEnabled: false,
      retryAppliesHandicap: false,
    },
  })),
}));

jest.mock('@/lib/ta/phase3-life-replay', () => ({
  attachLivesAfterToRounds: jest.fn((rounds) => rounds),
  replayPhase3Lives: jest.fn(),
}));

jest.mock('@/lib/ta/round-result', () => ({
  normalizeTaRoundResults: jest.fn((value) => (Array.isArray(value) ? value : [])),
}));

jest.mock('@/lib/ta/finals-phase-manager', () => ({
  getPhaseStatus: jest.fn(),
  promoteToPhase1: jest.fn(),
  promoteToPhase2: jest.fn(),
  promoteToPhase3: jest.fn(),
  startPhaseRound: jest.fn(),
  submitRoundResults: jest.fn(),
  submitSuddenDeathResults: jest.fn(),
  changeSuddenDeathCourse: jest.fn(),
  cancelPhaseRound: jest.fn(),
  undoLastPhaseRound: jest.fn(),
  cancelLastSubmittedPhaseRound: jest.fn(),
  resetPhase: jest.fn(),
  reportPhase3Time: jest.fn(),
  PhaseResetConflictError: class PhaseResetConflictError extends Error {},
}));

jest.mock('@/lib/api-auth', () => ({
  requireAdminOrPlayerSession: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('@/lib/error-handling', () => ({
  createSuccessResponse: jest.fn((data) => ({ success: true, data })),
  createErrorResponse: jest.fn((error, status) => ({ success: false, error, status })),
  handleValidationError: jest.fn((error) => ({ success: false, error, status: 400 })),
  handleAuthzError: jest.fn(() => ({ success: false, status: 403 })),
}));

jest.mock('@/lib/request-utils', () => ({
  getClientIdentifier: jest.fn(),
  getUserAgent: jest.fn(),
}));

jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((value) => value) }));
jest.mock('@/lib/api-factories/score-report-helpers', () => ({ createScoreEntryLog: jest.fn() }));
jest.mock('@/lib/ta/freeze-check', () => ({ checkStageFrozen: jest.fn() }));
jest.mock('@/lib/audit-log', () => ({ resolveAuditUserId: jest.fn() }));
jest.mock('@/lib/ta/battle-royale', () => ({ TA_HANDICAP_SECONDS: [0] }));
jest.mock('@/lib/ta/battle-royale-constants', () => ({
  TA_ROUND_LIFE_LOSS_MIN: 1,
  TA_ROUND_LIFE_LOSS_MAX: 9,
}));

import prisma from '@/lib/prisma';
import { readTournamentArchive } from '@/lib/tournament-archive';
import { GET } from '@/app/api/tournaments/[id]/ta/phases/route';

describe('TA phase reportedResults normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.tournament.findUnique).mockResolvedValue(null);
    jest.mocked(readTournamentArchive).mockResolvedValue({
      schemaVersion: 1,
      tournament: { id: 'tournament-1', slug: 'archived', name: 'Archived', status: 'completed' },
      allPlayers: [],
      modes: {
        ta: {
          entries: [
            {
              id: 'entry-1',
              tournamentId: 'tournament-1',
              playerId: 'player-1',
              stage: 'phase3',
              lives: 3,
              eliminated: false,
              rank: 1,
              totalTime: 60000,
              player: { id: 'player-1', name: 'Player 1', nickname: 'Player 1' },
            },
          ],
          phaseRounds: [
            {
              id: 'round-1',
              tournamentId: 'tournament-1',
              phase: 'phase3',
              roundNumber: 1,
              course: 'MC1',
              results: [{ playerId: 'player-1', timeMs: 60000 }],
              eliminatedIds: [],
              reportedResults: [
                { playerId: 'player-1', timeMs: 60123, reportedAt: '2026-09-24T00:00:00.000Z' },
                { playerId: '', timeMs: 60200, reportedAt: '2026-09-24T00:00:01.000Z' },
                { playerId: '   ', timeMs: 60300, reportedAt: '2026-09-24T00:00:02.000Z' },
                { playerId: ' player-1 ', timeMs: 60400, reportedAt: '2026-09-24T00:00:03.000Z' },
              ],
            },
          ],
          rules: {
            mode: 'standard',
            initialLives: 3,
            lifeResetThresholds: [],
            survivorsNeeded: 1,
            handicapEnabled: false,
            allowedHandicapSeconds: [0],
            retryAppliesHandicap: false,
          },
        },
        bm: {},
        mr: {},
        gp: {},
      },
    });
  });

  it('drops blank and padded reported player IDs while preserving a canonical report', async () => {
    const response = await GET(
      { url: 'http://localhost/api/tournaments/tournament-1/ta/phases?phase=phase3' } as never,
      { params: Promise.resolve({ id: 'tournament-1' }) },
    );

    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          rounds: [
            expect.objectContaining({
              reportedResults: [
                {
                  playerId: 'player-1',
                  timeMs: 60123,
                  reportedAt: '2026-09-24T00:00:00.000Z',
                },
              ],
            }),
          ],
        }),
      }),
    );
  });
});

/**
 * @jest-environment jsdom
 *
 * Unit tests for TimeAttackFinals (src/app/tournaments/[id]/ta/finals/page.tsx),
 * covering the "final-round corrections" card (issue #2777).
 *
 * PR #2776 added a "Correct the final round" card to both TAEliminationPhase
 * (phase1/2, tested in ta-elimination-phase.test.tsx) and this phase3 finals
 * page, but only the former had unit test coverage. Both share near-identical
 * logic (isAdmin && isComplete && !pendingSuddenDeath && completedRoundsCount > 0),
 * so a regression here would otherwise go undetected.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import TimeAttackFinals from '@/app/tournaments/[id]/ta/finals/page';

// TimeAttackFinals resolves its `params` prop via React's `use()`, which
// normally requires a Suspense boundary and re-render once the promise
// settles. Mocking `use` to unwrap synchronously (as gp-finals-page-wiring.test.tsx
// does for the sibling GP finals page) avoids relying on Suspense timing in jsdom.
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    use: () => ({ id: 'tournament-1' }),
  };
});

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ data: null })),
}));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;

jest.mock('@/lib/hooks/use-tournament-debug-mode', () => ({
  useTournamentDebugMode: jest.fn(() => false),
}));

jest.mock('@/lib/hooks/use-broadcast-reflect', () => ({
  useBroadcastReflect: jest.fn(() => ({
    broadcastStatus: null,
    handleBroadcastReflect: jest.fn(),
    resetBroadcastStatus: jest.fn(),
    hasUnbroadcastedTvAssignment: false,
  })),
}));

jest.mock('@/components/tournament/ta-sudden-death-panel', () => ({
  TASuddenDeathSection: () => null,
  useTaSuddenDeath: jest.fn(() => ({
    pendingSuddenDeath: null,
    pendingSuddenDeathEntries: [],
    suddenDeathTimes: {},
    changingSuddenDeathCourse: false,
    submittingSuddenDeath: false,
    setSuddenDeathTime: jest.fn(),
    handleSuddenDeathTimeBlur: jest.fn(),
    handleSuddenDeathCourseChange: jest.fn(),
    handleSubmitSuddenDeath: jest.fn(),
  })),
}));

function makeEntry(overrides: {
  id: string;
  playerId: string;
  nickname: string;
  lives?: number;
  eliminated?: boolean;
}) {
  return {
    id: overrides.id,
    playerId: overrides.playerId,
    stage: 'phase3',
    lives: overrides.lives ?? 3,
    eliminated: overrides.eliminated ?? false,
    times: null,
    totalTime: null,
    rank: null,
    player: { nickname: overrides.nickname },
  };
}

/** Champion-decided payload: only one active player remains, one completed round. */
const completePhasePayload = {
  ok: true,
  json: jest.fn().mockResolvedValue({
    data: {
      entries: [
        makeEntry({ id: 'e-1', playerId: 'p-1', nickname: 'Mario', lives: 3 }),
        makeEntry({ id: 'e-2', playerId: 'p-2', nickname: 'Luigi', lives: 0, eliminated: true }),
      ],
      rounds: [{
        id: 'r-1', phase: 'phase3', roundNumber: 1, course: 'GV1',
        results: [
          { playerId: 'p-1', timeMs: 60000, isRetry: false },
          { playerId: 'p-2', timeMs: 70000, isRetry: false },
        ],
        eliminatedIds: ['p-2'], livesReset: false, manualOverride: false,
      }],
      availableCourses: ['GV2'],
      playedCourses: ['GV1'],
    },
  }),
};

async function renderFinals() {
  render(<TimeAttackFinals params={Promise.resolve({ id: 'tournament-1' })} />);
}

let originalFetch: typeof global.fetch;

beforeAll(() => {
  originalFetch = global.fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({ data: null } as ReturnType<typeof useSession>);
});

describe('TimeAttackFinals — final-round corrections card', () => {
  it('exposes the final-round undo control to admins once the champion is decided', async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue(completePhasePayload);

    await renderFinals();

    await waitFor(() => {
      expect(screen.getByText('Correct the final round')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Undo Last Round' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel Last Round (Free Course)' })).toBeInTheDocument();
    // The normal round-management "Start Round" control stays hidden once complete.
    expect(screen.queryByRole('button', { name: /Start Round/ })).not.toBeInTheDocument();
  });

  it('hides the final-round corrections card from non-admins', async () => {
    mockUseSession.mockReturnValue({ data: null } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue(completePhasePayload);

    await renderFinals();

    await waitFor(() => {
      expect(screen.getByText('Champion')).toBeInTheDocument();
    });
    expect(screen.queryByText('Correct the final round')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo Last Round' })).not.toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 *
 * Unit tests for TAEliminationPhase component (TC-2913 through TC-2919).
 *
 * Tests cover loading, error, empty, and main render states for the
 * TA (Time Attack) single-elimination phase component (Phase 1 / Phase 2).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import TAEliminationPhase from '@/components/tournament/ta-elimination-phase';

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

const defaultProps = {
  tournamentId: 'tournament-1',
  phase: 'phase1' as const,
  title: 'Phase 1 — Elimination',
  description: 'Elimination Phase 1',
  targetSurvivors: 4,
};

function makeEntry(overrides: {
  id: string;
  playerId: string;
  nickname: string;
  eliminated?: boolean;
}) {
  return {
    id: overrides.id,
    playerId: overrides.playerId,
    stage: 'phase1',
    lives: 3,
    eliminated: overrides.eliminated ?? false,
    times: null,
    totalTime: null,
    rank: null,
    player: { nickname: overrides.nickname },
  };
}

let originalFetch: typeof global.fetch;

beforeAll(() => {
  originalFetch = global.fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  // Default to a signed-out (non-admin) session; admin tests override this.
  mockUseSession.mockReturnValue({ data: null } as ReturnType<typeof useSession>);
});

afterEach(() => {
  jest.useRealTimers();
});

/* ------------------------------------------------------------------ */
/*  TC-2913: Loading state                                             */
/* ------------------------------------------------------------------ */

describe('TAEliminationPhase — loading', () => {
  it('TC-2913: renders animated skeleton divs while fetch is pending', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    const { container } = render(<TAEliminationPhase {...defaultProps} />);
    // Loading state renders animate-pulse placeholder divs before data arrives
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    // No h1 heading rendered during initial loading
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  TC-2914 / TC-2917: Error state                                     */
/* ------------------------------------------------------------------ */

describe('TAEliminationPhase — error', () => {
  it('TC-2914: shows error message and Retry button after fetch failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'Server unavailable' }),
    });
    render(<TAEliminationPhase {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Server unavailable')).toBeInTheDocument();
    });
    // "retryLoad" key → "Retry" via en.json i18n mock
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('TC-2917: shows title h1 and "Back to Group Stage" link in error state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: 'Connection error' }),
    });
    render(<TAEliminationPhase {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Phase 1 — Elimination');
    });
    // "backToQualification" key → "Back to Group Stage" via en.json
    expect(screen.getByRole('link', { name: 'Back to Group Stage' })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  TC-2915 / TC-2916: Empty state (no entries promoted yet)           */
/* ------------------------------------------------------------------ */

describe('TAEliminationPhase — empty state', () => {
  const emptyResponse = {
    data: { entries: [], rounds: [], availableCourses: [], playedCourses: [] },
  };

  it('TC-2915: shows "No Players" card when no entries are promoted from qualification', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(emptyResponse),
    });
    render(<TAEliminationPhase {...defaultProps} />);
    // "noPlayersTitle" key → "No Players" via en.json
    await waitFor(() => {
      expect(screen.getByText('No Players')).toBeInTheDocument();
    });
  });

  it('TC-2916: renders title prop in h1 for empty state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(emptyResponse),
    });
    render(<TAEliminationPhase {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Phase 1 — Elimination' })).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  TC-2918 / TC-2919: Main render (with active entries)              */
/* ------------------------------------------------------------------ */

describe('TAEliminationPhase — main render', () => {
  it('TC-2918: renders title in h1 when active entries are present', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: {
          entries: [
            makeEntry({ id: 'e-1', playerId: 'p-1', nickname: 'Mario' }),
            makeEntry({ id: 'e-2', playerId: 'p-2', nickname: 'Luigi' }),
            makeEntry({ id: 'e-3', playerId: 'p-3', nickname: 'Yoshi' }),
            makeEntry({ id: 'e-4', playerId: 'p-4', nickname: 'Toad' }),
            makeEntry({ id: 'e-5', playerId: 'p-5', nickname: 'Bowser' }),
          ],
          rounds: [],
          availableCourses: ['GV1', 'GV2'],
          playedCourses: [],
        },
      }),
    });
    render(<TAEliminationPhase {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Phase 1 — Elimination' })).toBeInTheDocument();
    });
  });

  it('TC-2919: renders "Phase Complete" banner when active survivors ≤ targetSurvivors', async () => {
    // 4 active (≤ targetSurvivors=4) and 1 eliminated triggers isComplete=true
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: {
          entries: [
            makeEntry({ id: 'e-1', playerId: 'p-1', nickname: 'Mario' }),
            makeEntry({ id: 'e-2', playerId: 'p-2', nickname: 'Luigi' }),
            makeEntry({ id: 'e-3', playerId: 'p-3', nickname: 'Yoshi' }),
            makeEntry({ id: 'e-4', playerId: 'p-4', nickname: 'Toad' }),
            makeEntry({ id: 'e-5', playerId: 'p-5', nickname: 'Bowser', eliminated: true }),
          ],
          rounds: [{
            id: 'r-1', phase: 'phase1', roundNumber: 1, course: 'GV1',
            results: [{ playerId: 'p-5', timeMs: 99990, isRetry: false }],
            eliminatedIds: ['p-5'], livesReset: false, manualOverride: false,
          }],
          availableCourses: ['GV2'],
          playedCourses: ['GV1'],
        },
      }),
    });
    render(<TAEliminationPhase {...defaultProps} />);
    // "phaseComplete" key → "Phase Complete" via en.json
    await waitFor(() => {
      expect(screen.getByText('Phase Complete')).toBeInTheDocument();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Final-round undo remains available after a phase completes         */
  /*  (reported issue: the only fix for a final-round mistake was a      */
  /*  full phase reset because the undo button was hidden once complete) */
  /* ------------------------------------------------------------------ */

  const completePhasePayload = {
    ok: true,
    json: jest.fn().mockResolvedValue({
      data: {
        entries: [
          makeEntry({ id: 'e-1', playerId: 'p-1', nickname: 'Mario' }),
          makeEntry({ id: 'e-2', playerId: 'p-2', nickname: 'Luigi' }),
          makeEntry({ id: 'e-3', playerId: 'p-3', nickname: 'Yoshi' }),
          makeEntry({ id: 'e-4', playerId: 'p-4', nickname: 'Toad' }),
          makeEntry({ id: 'e-5', playerId: 'p-5', nickname: 'Bowser', eliminated: true }),
        ],
        rounds: [{
          id: 'r-1', phase: 'phase1', roundNumber: 1, course: 'GV1',
          results: [{ playerId: 'p-5', timeMs: 99990, isRetry: false }],
          eliminatedIds: ['p-5'], livesReset: false, manualOverride: false,
        }],
        availableCourses: ['GV2'],
        playedCourses: ['GV1'],
      },
    }),
  };

  it('exposes the final-round undo control to admins after the phase is complete', async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue(completePhasePayload);

    render(<TAEliminationPhase {...defaultProps} />);

    // The phase is complete, so the corrections card + undo button must be
    // reachable even though the normal round-management card is hidden.
    await waitFor(() => {
      expect(screen.getByText('Correct the final round')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Undo Last Round' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel Last Round (Free Course)' })).toBeInTheDocument();
    // The Undo-vs-Cancel explainer travels with the correction buttons.
    expect(
      screen.getByRole('button', { name: 'Explain the difference between Undo and Cancel' }),
    ).toBeInTheDocument();
    // Start-round control stays hidden while the phase is complete.
    expect(screen.queryByRole('button', { name: /Start Round/ })).not.toBeInTheDocument();
  });

  it('hides the final-round corrections card from non-admins', async () => {
    mockUseSession.mockReturnValue({ data: null } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue(completePhasePayload);

    render(<TAEliminationPhase {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Phase Complete')).toBeInTheDocument();
    });
    expect(screen.queryByText('Correct the final round')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo Last Round' })).not.toBeInTheDocument();
  });

  /* Case B (issue #2779): once phase1 is promoted to phase2, undoing phase1's
   * last round would desync the phase2 roster. The server refuses it (409), so
   * the UI must not offer the corrections card either — the admin has to reset
   * phase2 first. phaseStatus.phase2 being non-null signals the promotion. */
  it('hides the final-round corrections card once a later phase has started', async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: {
          entries: [
            makeEntry({ id: 'e-1', playerId: 'p-1', nickname: 'Mario' }),
            makeEntry({ id: 'e-2', playerId: 'p-2', nickname: 'Luigi' }),
            makeEntry({ id: 'e-3', playerId: 'p-3', nickname: 'Yoshi' }),
            makeEntry({ id: 'e-4', playerId: 'p-4', nickname: 'Toad' }),
            makeEntry({ id: 'e-5', playerId: 'p-5', nickname: 'Bowser', eliminated: true }),
          ],
          rounds: [{
            id: 'r-1', phase: 'phase1', roundNumber: 1, course: 'GV1',
            results: [{ playerId: 'p-5', timeMs: 99990, isRetry: false }],
            eliminatedIds: ['p-5'], livesReset: false, manualOverride: false,
          }],
          availableCourses: ['GV2'],
          playedCourses: ['GV1'],
          // phase2 has been promoted — phase1 rounds are now locked.
          phaseStatus: { phase1: { total: 5, active: 4, eliminated: 1 }, phase2: { total: 8, active: 8, eliminated: 0 }, phase3: null },
        },
      }),
    });

    render(<TAEliminationPhase {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Phase Complete')).toBeInTheDocument();
    });
    expect(screen.queryByText('Correct the final round')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo Last Round' })).not.toBeInTheDocument();
  });

  /* Issue #2781: the completed-phase card above already hides its undo/cancel
   * buttons once a later phase is promoted, but the round-management card
   * shown while the phase is still IN PROGRESS (isComplete=false — e.g. an
   * admin promoted phase2 early, before phase1 actually finished) rendered
   * the same buttons unguarded. The server still rejects the request with a
   * 409, but the UI-level defense-in-depth was missing on this branch. */
  it('hides the round-management undo/cancel buttons once a later phase has started, even while the phase is still in progress', async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: {
          entries: [
            makeEntry({ id: 'e-1', playerId: 'p-1', nickname: 'Mario' }),
            makeEntry({ id: 'e-2', playerId: 'p-2', nickname: 'Luigi' }),
            makeEntry({ id: 'e-3', playerId: 'p-3', nickname: 'Yoshi' }),
            makeEntry({ id: 'e-4', playerId: 'p-4', nickname: 'Toad' }),
            makeEntry({ id: 'e-5', playerId: 'p-5', nickname: 'Bowser' }),
          ],
          // One completed round but all 5 players still active (targetSurvivors=4)
          // so isComplete is false and the round-management card renders.
          rounds: [{
            id: 'r-1', phase: 'phase1', roundNumber: 1, course: 'GV1',
            results: [{ playerId: 'p-1', timeMs: 60000, isRetry: false }],
            eliminatedIds: null, livesReset: false, manualOverride: false,
          }],
          availableCourses: ['GV2'],
          playedCourses: ['GV1'],
          // phase2 has already been promoted (early promotion scenario).
          phaseStatus: { phase1: { total: 5, active: 5, eliminated: 0 }, phase2: { total: 8, active: 8, eliminated: 0 }, phase3: null },
        },
      }),
    });

    render(<TAEliminationPhase {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start Round/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Undo Last Round' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Last Round (Free Course)' })).not.toBeInTheDocument();
  });
});

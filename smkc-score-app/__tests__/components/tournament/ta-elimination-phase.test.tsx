/**
 * @jest-environment jsdom
 *
 * Unit tests for TAEliminationPhase component (TC-2913 through TC-2919).
 *
 * Tests cover loading, error, empty, and main render states for the
 * TA (Time Attack) single-elimination phase component (Phase 1 / Phase 2).
 */
import { render, screen, waitFor } from '@testing-library/react';
import TAEliminationPhase from '@/components/tournament/ta-elimination-phase';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ data: null })),
}));

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
});

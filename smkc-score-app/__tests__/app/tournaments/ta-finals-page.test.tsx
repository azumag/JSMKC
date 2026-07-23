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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    version: 0,
    eliminated: overrides.eliminated ?? false,
    times: null,
    totalTime: null,
    rank: null,
    player: { nickname: overrides.nickname },
  };
}

/** In-progress payload: two active players remain, no rounds submitted yet. */
function makeInProgressPayload(
  taMode: 'standard' | 'battle_royale',
  archived = false,
  marioState: { lives: number; version: number } = { lives: 3, version: 0 },
) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({
      data: {
        taMode,
        archived,
        entries: [
          { ...makeEntry({ id: 'e-1', playerId: 'p-1', nickname: 'Mario', lives: marioState.lives }), version: marioState.version },
          makeEntry({ id: 'e-2', playerId: 'p-2', nickname: 'Luigi' }),
        ],
        rounds: [],
        availableCourses: ['GV1'],
        playedCourses: [],
      },
    }),
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
      rounds: [
        {
          id: 'r-1',
          phase: 'phase3',
          roundNumber: 1,
          course: 'GV1',
          results: [
            { playerId: 'p-1', timeMs: 60000, isRetry: false },
            { playerId: 'p-2', timeMs: 70000, isRetry: false },
          ],
          eliminatedIds: ['p-2'],
          livesReset: false,
          manualOverride: false,
        },
      ],
      availableCourses: ['GV2'],
      playedCourses: ['GV1'],
    },
  }),
};

/**
 * In-progress payload (no champion yet) with server-computed livesAfter/lifeLost
 * on each result. Mario has the FASTER raw time (idx 0, which the legacy
 * "idx >= halfPoint" fallback would call safe) but the server says he's the one
 * who lost a life (lifeLost: true) -- e.g. a resolved sudden-death boundary tie
 * flipped the outcome. Luigi is the reverse. This intentionally disagrees with
 * the raw-time fallback so the test only passes if the component actually
 * prefers server-computed `lifeLost` over its own index-based heuristic.
 */
const roundHistoryLivesPayload = {
  ok: true,
  json: jest.fn().mockResolvedValue({
    data: {
      entries: [
        makeEntry({ id: 'e-1', playerId: 'p-1', nickname: 'Mario', lives: 2 }),
        makeEntry({ id: 'e-2', playerId: 'p-2', nickname: 'Luigi', lives: 3 }),
      ],
      rounds: [
        {
          id: 'r-1',
          phase: 'phase3',
          roundNumber: 1,
          course: 'GV1',
          results: [
            { playerId: 'p-1', timeMs: 50000, isRetry: false, livesAfter: 2, lifeLost: true },
            { playerId: 'p-2', timeMs: 70000, isRetry: false, livesAfter: 3, lifeLost: false },
          ],
          eliminatedIds: [],
          livesReset: false,
          manualOverride: false,
        },
      ],
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

describe('TimeAttackFinals — per-round life loss control (TA battle royale)', () => {
  it('shows the life-loss selector for admins in a TA battle royale tournament', async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue(makeInProgressPayload('battle_royale'));

    await renderFinals();

    await waitFor(() => {
      expect(screen.getByText('Life loss for this round')).toBeInTheDocument();
    });
  });

  it('hides the life-loss selector for a standard (non-battle-royale) TA tournament', async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue(makeInProgressPayload('standard'));

    await renderFinals();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start Round/ })).toBeInTheDocument();
    });
    expect(screen.queryByText('Life loss for this round')).not.toBeInTheDocument();
  });

  it('keeps manual elimination available but hides exact-life inputs in TA battle royale', async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue(makeInProgressPayload('battle_royale'));

    await renderFinals();

    expect((await screen.findAllByRole('button', { name: 'Eliminate' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('spinbutton', { name: 'Set lives for Mario' })).not.toBeInTheDocument();
  });
});

describe('TimeAttackFinals — manual life adjustment', () => {
  it('lets an admin set an active player to five lives through the versioned exact-life API', async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    const payload = makeInProgressPayload('standard');
    // The second response is consumed by fetchData after the successful save.
    global.fetch = jest.fn().mockResolvedValue(payload);

    await renderFinals();

    const input = await screen.findByRole('spinbutton', { name: 'Set lives for Mario' });
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save lives for Mario' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tournaments/tournament-1/ta',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
    const [, request] = (global.fetch as jest.Mock).mock.calls.find(
      ([url]: [string]) => url === '/api/tournaments/tournament-1/ta',
    );
    expect(JSON.parse(request.body)).toEqual({
      entryId: 'e-1',
      action: 'set_lives',
      lives: 5,
      expectedVersion: 0,
      expectedLives: 3,
    });
  });

  it('preserves the version and lives from when an administrator begins editing across a polling refresh', async () => {
    jest.useFakeTimers();
    try {
      mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(makeInProgressPayload('standard'))
        .mockResolvedValueOnce(makeInProgressPayload('standard', false, { lives: 4, version: 1 }))
        .mockResolvedValueOnce({ ok: false, json: jest.fn().mockResolvedValue({ error: 'stale edit' }) });

      await renderFinals();

      const input = await screen.findByRole('spinbutton', { name: 'Set lives for Mario' });
      fireEvent.change(input, { target: { value: '5' } });
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      await waitFor(() => {
        expect(screen.getByRole('spinbutton', { name: 'Set lives for Mario' })).toHaveValue(5);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save lives for Mario' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(3);
      });
      const [, request] = (global.fetch as jest.Mock).mock.calls[2];
      expect(JSON.parse(request.body)).toMatchObject({ expectedVersion: 0, expectedLives: 3, lives: 5 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not expose life adjustment controls to non-admins', async () => {
    global.fetch = jest.fn().mockResolvedValue(makeInProgressPayload('standard'));

    await renderFinals();

    await waitFor(() => {
      expect(screen.getByText('Finals Standings')).toBeInTheDocument();
    });
    expect(screen.queryByRole('spinbutton', { name: 'Set lives for Mario' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('ta-top2-life-adjustment-warning')).not.toBeInTheDocument();
  });

  it('warns administrators to set both Top 2 players to five lives', async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue(makeInProgressPayload('standard'));

    await renderFinals();

    expect(await screen.findByTestId('ta-top2-life-adjustment-warning')).toHaveTextContent(
      'set both remaining players to 5 lives',
    );
  });

  it('does not show the Top 2 adjustment warning for an archived tournament', async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue(makeInProgressPayload('standard', true));

    await renderFinals();

    await waitFor(() => {
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('ta-top2-life-adjustment-warning')).not.toBeInTheDocument();
  });
});

describe('TimeAttackFinals — round history remaining-life display', () => {
  it('follows server-computed lifeLost rather than raw finish-time order when they disagree', async () => {
    mockUseSession.mockReturnValue({ data: null } as ReturnType<typeof useSession>);
    global.fetch = jest.fn().mockResolvedValue(roundHistoryLivesPayload);

    const { container } = render(<TimeAttackFinals params={Promise.resolve({ id: 'tournament-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('Round History')).toBeInTheDocument();
    });
    // The name, retry badge, "(-1 lives)"/"left" tags all render as sibling text
    // nodes inside one row <span>, so assert on the row's full text rather than
    // an exact getByText match on a lone substring. Scope to the round-history
    // section (after the "Round History" heading): the standings table above
    // it also lists "Mario"/"Luigi", which would otherwise produce false regex
    // matches spanning both sections.
    const fullText = container.textContent ?? '';
    const text = fullText.slice(fullText.indexOf('Round History'));
    expect(text.length).toBeGreaterThan(0);
    // Mario (p-1) has the FASTER raw time -- the legacy "idx >= halfPoint"
    // fallback would call him safe -- but the fixture's lifeLost: true says he
    // actually lost a life. This only passes if the component reads lifeLost.
    // (Default round lifeLoss is 1, so the tag reads "(-1 lives)".)
    expect(text).toMatch(/Mario.*\(-1 lives\).*2 left/);
    // Luigi (p-2) has the SLOWER raw time -- the fallback would call him
    // damaged -- but lifeLost: false says he was safe, so no "(-1 lives)" tag
    // should render for him. His remaining life should still be shown though:
    // every entrant's life-at-this-round is useful history, not just the ones
    // who lost a life this round.
    expect(text).not.toMatch(/Luigi.*\(-1 lives\)/);
    expect(text).toMatch(/Luigi.*3 left/);
  });
});

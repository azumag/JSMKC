/**
 * @jest-environment jsdom
 *
 * Behavior tests for the TA participant page's Phase 3 time report card
 * (issue #2994): visible only when the tournament toggle is on and the player
 * has a phase3 entry, and the report POST body carries the correct payload.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { usePolling } from '@/lib/hooks/usePolling';
import TimeAttackParticipantPage from '@/app/tournaments/[id]/ta/participant/page';

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    use: () => ({ id: 'tournament-1' }),
  };
});

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ data: { user: { role: 'player', userType: 'player', playerId: 'player-1' } } })),
}));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${String(params.count ?? params.number ?? '')}` : key,
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), info: jest.fn(), warning: jest.fn(), success: jest.fn() },
}));

jest.mock('@/lib/hooks/usePolling', () => ({
  usePolling: jest.fn(),
}));

jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: mockSummaryData }) })),
}));

const mockSummaryData = {
  id: 'tournament-1',
  name: 'Test Tournament',
  date: '2026-08-09T00:00:00.000Z',
  status: 'active',
  publicModes: ['ta'],
  taBattleRoyaleMode: true,
};

jest.mock('@/lib/client-logger', () => ({
  createLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

let mockTaPollData: unknown = null;
let mockPhase3PollData: unknown = null;

const player = (id: string, nickname: string) => ({ id, name: nickname, nickname });

const baseTaData = {
  entries: [
    {
      id: 'e1',
      playerId: 'player-1',
      partnerId: null,
      stage: 'qualification',
      lives: 3,
      eliminated: false,
      times: {},
      totalTime: null,
      rank: null,
      player: player('player-1', 'Mario'),
    },
  ],
  frozenStages: [],
  qualificationRegistrationLocked: false,
  qualificationEditingLockedForPlayers: false,
  taPlayerSelfEdit: true,
  taPlayerReportEnabled: true,
};

const basePhase3Data = {
  phaseStatus: {
    phase1: null,
    phase2: null,
    phase3: { total: 2, active: 2, eliminated: 0, winner: null },
    currentPhase: 'phase3',
  },
  taMode: 'battle_royale',
  taBattleRoyaleMode: true,
  taPlayerReportEnabled: true,
  phase3Rules: {
    initialLives: 10,
    lifeResetThresholds: [],
    survivorsNeeded: 1,
    handicapEnabled: true,
    retryAppliesHandicap: false,
  },
  entries: [
    {
      id: 'pe1',
      playerId: 'player-1',
      stage: 'phase3',
      lives: 10,
      eliminated: false,
      rank: 1,
      totalTime: null,
      taHandicapSeconds: 0,
      player: player('player-1', 'Mario'),
    },
    {
      id: 'pe2',
      playerId: 'player-2',
      stage: 'phase3',
      lives: 10,
      eliminated: false,
      rank: 2,
      totalTime: null,
      taHandicapSeconds: 0,
      player: player('player-2', 'Luigi'),
    },
  ],
  rounds: [
    { id: 'r1', roundNumber: 1, course: 'GV1', results: [], reportedResults: [], eliminatedIds: [], livesReset: false },
  ],
  availableCourses: ['GV1'],
  playedCourses: [],
};

describe('TA participant Phase 3 time report (issue #2994)', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { user: { role: 'player', userType: 'player', playerId: 'player-1' } },
    } as ReturnType<typeof useSession>);
    mockTaPollData = { data: baseTaData };
    mockPhase3PollData = { data: basePhase3Data };
    (usePolling as jest.Mock).mockImplementation((fetcher: unknown) => {
      const source = typeof fetcher === 'function' ? String(fetcher) : '';
      const isPhase3Poller = source.includes('/ta/phases');
      return isPhase3Poller
        ? { data: basePhase3Data, error: null, refetch: jest.fn() }
        : { data: baseTaData, error: null, refetch: jest.fn() };
    });
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: baseTaData }),
    });
  });

  it('shows the Phase 3 report card when enabled and the player has a phase3 entry', async () => {
    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('phase3ReportTitle')).toBeInTheDocument();
    });
    expect(screen.getByText(/currentCourse/)).toBeInTheDocument();
  });

  it('sends the report_time POST with the player time', async () => {
    const reportResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({ data: { reportedTime: { playerId: 'player-1', timeMs: 60000 } } }),
    };
    (global.fetch as jest.Mock).mockImplementation((url: string) =>
      url.includes('/ta/phases')
        ? Promise.resolve(reportResponse)
        : Promise.resolve({ ok: true, json: jest.fn().mockResolvedValue({ data: baseTaData }) }),
    );

    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('phase3ReportTitle')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('reportTime'), { target: { value: '1:00.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'reportTime' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tournaments/tournament-1/ta/phases',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'report_time', phase: 'phase3', roundNumber: 1, timeMs: 60000 }),
        }),
      );
    });
  });

  it('hides the Phase 3 report card when the toggle is off', async () => {
    mockTaPollData = { data: { ...baseTaData, taPlayerReportEnabled: false } };
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: { ...baseTaData, taPlayerReportEnabled: false } }),
    });

    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('loggedInAsPlayer')).toBeInTheDocument();
    });
    expect(screen.queryByText('phase3ReportTitle')).not.toBeInTheDocument();
  });
});

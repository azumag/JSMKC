/**
 * @jest-environment jsdom
 *
 * Behavior tests for the TA participant page, including Phase 3 time reports
 * (issue #2994) and tournament debug-mode gating for admin random-fill UI
 * (issue #3540).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { usePolling } from '@/lib/hooks/usePolling';
import { useTournamentDebugMode } from '@/lib/hooks/use-tournament-debug-mode';
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

jest.mock('@/lib/hooks/use-tournament-debug-mode', () => ({
  useTournamentDebugMode: jest.fn(() => false),
}));

const mockUseTournamentDebugMode = useTournamentDebugMode as jest.MockedFunction<typeof useTournamentDebugMode>;

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

jest.mock('@/lib/client-logger', () => {
  const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
  return { createLogger: () => logger, __mockLogger: logger };
});

const mockLoggerError = (
  jest.requireMock('@/lib/client-logger') as { __mockLogger: { error: jest.Mock } }
).__mockLogger.error;

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

describe('TA participant page', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { user: { role: 'player', userType: 'player', playerId: 'player-1' } },
    } as ReturnType<typeof useSession>);
    mockUseTournamentDebugMode.mockReturnValue(false);
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
    mockLoggerError.mockClear();
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

  it('rejects an out-of-contract Phase 3 time before POSTing', async () => {
    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('phase3ReportTitle')).toBeInTheDocument();
    });

    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockClear();
    fireEvent.change(screen.getByLabelText('reportTime'), { target: { value: '100:00.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'reportTime' }));

    await waitFor(() => {
      expect(screen.getByText('reportInvalidTime')).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/tournaments/tournament-1/ta/phases',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('hides the Phase 3 report card when the toggle is off', async () => {
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

  it('hides the translated random-fill control from admins when tournament debug mode is off', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: 'admin', userType: 'admin', playerId: 'player-1', nickname: 'Admin' } },
    } as ReturnType<typeof useSession>);
    mockUseTournamentDebugMode.mockReturnValue(false);

    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('loggedInAsPlayer')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'debugRandomFill' })).not.toBeInTheDocument();
  });

  it('shows the translated random-fill control to admins in debug mode and localizes its success toast', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { role: 'admin', userType: 'admin', playerId: 'player-1', nickname: 'Admin' } },
    } as ReturnType<typeof useSession>);
    mockUseTournamentDebugMode.mockReturnValue(true);
    (toast.success as jest.Mock).mockClear();

    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    const fillButton = await screen.findByRole('button', { name: 'debugRandomFill' });
    fireEvent.click(fillButton);

    expect(toast.success).toHaveBeenCalledWith('debugRandomFillSuccess');
  });

  it('hides the translated random-fill control from players even when tournament debug mode is on', async () => {
    mockUseTournamentDebugMode.mockReturnValue(true);

    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('loggedInAsPlayer')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'debugRandomFill' })).not.toBeInTheDocument();
  });
});

describe('TA participant page mutation request rejection fallbacks (issue #3606)', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { user: { role: 'player', userType: 'player', playerId: 'player-1' } },
    } as ReturnType<typeof useSession>);
    mockUseTournamentDebugMode.mockReturnValue(false);
    mockLoggerError.mockClear();
  });

  it('localizes an own qualification submission that is rejected by the network and preserves the input', async () => {
    const customEntries = {
      ...baseTaData,
      entries: [{ ...baseTaData.entries[0], times: { MC1: '1:23.45' } }],
    };
    (usePolling as jest.Mock).mockImplementation((fetcher: unknown) => {
      const source = typeof fetcher === 'function' ? String(fetcher) : '';
      const isPhase3Poller = source.includes('/ta/phases');
      return isPhase3Poller
        ? { data: basePhase3Data, error: null, refetch: jest.fn() }
        : { data: customEntries, error: null, refetch: jest.fn() };
    });
    (global.fetch as jest.Mock) = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.reject(new Error('own qualification network failure'));
      return Promise.resolve({ ok: true, json: jest.fn().mockResolvedValue({ data: customEntries }) });
    });

    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    const submitButton = await screen.findByRole('button', { name: 'submitTimes' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('networkError')).toBeInTheDocument();
    });
    expect(screen.queryByText(/own qualification network failure/)).not.toBeInTheDocument();
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to submit TA qualification times:',
      expect.objectContaining({ error: expect.any(Error) }),
    );
    expect(submitButton).not.toBeDisabled();
    expect(screen.getByDisplayValue('1:23.45')).toBeInTheDocument();
  });

  it('localizes a partner qualification submission that is rejected by the network', async () => {
    const customEntries = {
      ...baseTaData,
      entries: [
        { ...baseTaData.entries[0], partnerId: 'player-2', times: {} },
        {
          id: 'e2',
          playerId: 'player-2',
          partnerId: 'player-1',
          stage: 'qualification',
          lives: 3,
          eliminated: false,
          times: { MC1: '2:00.00' },
          totalTime: null,
          rank: null,
          player: player('player-2', 'Luigi'),
        },
      ],
    };
    (usePolling as jest.Mock).mockImplementation((fetcher: unknown) => {
      const source = typeof fetcher === 'function' ? String(fetcher) : '';
      const isPhase3Poller = source.includes('/ta/phases');
      return isPhase3Poller
        ? { data: basePhase3Data, error: null, refetch: jest.fn() }
        : { data: customEntries, error: null, refetch: jest.fn() };
    });
    (global.fetch as jest.Mock) = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.reject(new Error('partner qualification network failure'));
      return Promise.resolve({ ok: true, json: jest.fn().mockResolvedValue({ data: customEntries }) });
    });

    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'submitTimes' })).toHaveLength(2);
    });
    const partnerSubmitButton = screen
      .getAllByRole('button', { name: 'submitTimes' })
      .find((button) => !button.hasAttribute('disabled'));
    expect(partnerSubmitButton).toBeDefined();
    fireEvent.click(partnerSubmitButton as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('networkError')).toBeInTheDocument();
    });
    expect(screen.queryByText(/partner qualification network failure/)).not.toBeInTheDocument();
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to submit partner TA qualification times:',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('keeps Phase 3 error-code mapping while localizing a request rejection and preserves the input', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/ta/phases')) {
        return Promise.reject(new Error('phase 3 network failure'));
      }
      return Promise.resolve({ ok: true, json: jest.fn().mockResolvedValue({ data: baseTaData }) });
    });

    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('phase3ReportTitle')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('reportTime'), { target: { value: '1:00.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'reportTime' }));

    await waitFor(() => {
      expect(screen.getByText('networkError')).toBeInTheDocument();
    });
    expect(screen.queryByText(/phase 3 network failure/)).not.toBeInTheDocument();
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to report TA Phase 3 time:',
      expect.objectContaining({ error: expect.any(Error) }),
    );
    expect(screen.getByRole('button', { name: 'reportTime' })).not.toBeDisabled();
    expect(screen.getByDisplayValue('1:00.00')).toBeInTheDocument();
  });

  it('localizes a TA registration submission that is rejected by the network', async () => {
    const emptyEntries = { ...baseTaData, entries: [] };
    (usePolling as jest.Mock).mockImplementation((fetcher: unknown) => {
      const source = typeof fetcher === 'function' ? String(fetcher) : '';
      const isPhase3Poller = source.includes('/ta/phases');
      return isPhase3Poller
        ? { data: basePhase3Data, error: null, refetch: jest.fn() }
        : { data: emptyEntries, error: null, refetch: jest.fn() };
    });
    (global.fetch as jest.Mock) = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.reject(new Error('registration network failure'));
      return Promise.resolve({ ok: true, json: jest.fn().mockResolvedValue({ data: emptyEntries }) });
    });

    render(<TimeAttackParticipantPage params={Promise.resolve({ id: 'tournament-1' })} />);

    const addButton = await screen.findByRole('button', { name: 'addToTA' });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('networkError')).toBeInTheDocument();
    });
    expect(screen.queryByText(/registration network failure/)).not.toBeInTheDocument();
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to add participant to TA:',
      expect.objectContaining({ error: expect.any(Error) }),
    );
    expect(addButton).not.toBeDisabled();
  });
});

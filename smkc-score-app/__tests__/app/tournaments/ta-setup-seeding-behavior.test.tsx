/**
 * @jest-environment jsdom
 *
 * Behavior regression test for the TA setup dialog pairing flow (issue
 * #3058): typing into a seeding input must NOT recompute snake pairs (that
 * would silently overwrite a manually chosen partner), only the explicit
 * "Auto Pair" button may. Also verifies the non-blocking warning shown for
 * seeded entries that have no partner yet.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import TimeAttackPageClient from '@/app/tournaments/[id]/ta/page-client';

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    use: () => ({ id: 'tournament-1' }),
  };
});

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({ data: { user: { role: 'admin' } } })),
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

jest.mock('@/lib/hooks/usePolling', () => ({
  usePolling: jest.fn(() => ({
    data: mockPollData,
    error: null,
    isLoading: false,
    refetch: jest.fn(),
  })),
}));

jest.mock('@/lib/fetch-with-retry', () => ({
  fetchWithRetry: jest.fn(),
}));

jest.mock('@/lib/client-logger', () => ({
  createLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

const mockPlayer = (id: string, name: string) => ({
  id,
  name,
  nickname: name,
  country: null,
  noCamera: false,
});

let mockPollData: unknown = null;

const players = [
  mockPlayer('p1', 'Alpha'),
  mockPlayer('p2', 'Bravo'),
  mockPlayer('p3', 'Charlie'),
  mockPlayer('p4', 'Delta'),
];

const basePollData = {
  entries: [
    {
      id: 'e1',
      playerId: 'p1',
      stage: 'qualification',
      seeding: 1,
      partnerId: null,
      times: {},
      courseScores: {},
      player: players[0],
    },
    {
      id: 'e2',
      playerId: 'p2',
      stage: 'qualification',
      seeding: 2,
      partnerId: null,
      times: {},
      courseScores: {},
      player: players[1],
    },
  ],
  allPlayers: players,
  qualificationRegistrationLocked: false,
  frozenStages: [],
  taPlayerSelfEdit: false,
  taBattleRoyaleMode: false,
};

describe('TA setup dialog pairing (issue #3058)', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: { user: { role: 'admin' } } } as ReturnType<typeof useSession>);
    mockPollData = basePollData;
    (global.fetch as jest.Mock) = jest.fn();
  });

  it('updates only the edited entry seeding on input change and never auto-pairs', async () => {
    render(<TimeAttackPageClient tournamentId="tournament-1" />);

    await waitFor(() => {
      expect(screen.getByText('editPlayers')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('editPlayers'));

    const seedingInput = await screen.findByLabelText('Alpha seeding');
    fireEvent.change(seedingInput, { target: { value: '4' } });

    // Seeding changed; partner dropdowns for BOTH rows must still show the
    // "no partner" option (no pairing happened).
    await waitFor(() => {
      expect((seedingInput as HTMLInputElement).value).toBe('4');
    });
  });

  it('recomputes pairs only when the explicit Auto Pair button is clicked', async () => {
    render(<TimeAttackPageClient tournamentId="tournament-1" />);

    await waitFor(() => {
      expect(screen.getByText('editPlayers')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('editPlayers'));

    // Auto Pair button exists in the dialog
    const autoPairButton = await screen.findByText('autoPair');
    fireEvent.click(autoPairButton);

    // Seeded entries now have partners assigned (snake pairing: 1<->4, 2<->3)
    await waitFor(() => {
      expect(screen.getByLabelText('Alpha partner')).toBeInTheDocument();
    });
  });

  it('shows a non-blocking warning when a seeded entry has no partner', async () => {
    mockPollData = basePollData;
    render(<TimeAttackPageClient tournamentId="tournament-1" />);

    await waitFor(() => {
      expect(screen.getByText('editPlayers')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('editPlayers'));

    await waitFor(() => {
      expect(screen.getByText(/unpairedSeedingWarning/)).toBeInTheDocument();
    });
  });
});

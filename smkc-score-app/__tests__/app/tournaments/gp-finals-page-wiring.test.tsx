/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import GrandPrixFinals from '@/app/tournaments/[id]/gp/finals/page';

const mockDoubleBracketProps: Record<string, unknown>[] = [];
const mockPlayoffBracketProps: Record<string, unknown>[] = [];

const legacyWinnerMatch = {
  id: 'm1',
  matchNumber: 1,
  round: 'grand_final',
  stage: 'finals',
  player1Id: 'p1',
  player2Id: 'p2',
  points1: 2,
  points2: 2,
  score1: 2,
  score2: 2,
  completed: true,
  cup: 'Mushroom',
  assignedCups: ['Mushroom', 'Flower', 'Star'],
  tvNumber: null,
  player1: { id: 'p1', name: 'Player 1', nickname: 'Player 1' },
  player2: { id: 'p2', name: 'Player 2', nickname: 'Player 2' },
  suddenDeathWinnerId: 'p2',
};

let mockPollData = {
  matches: [legacyWinnerMatch],
  playoffMatches: [],
  bracketStructure: [{ matchNumber: 1, round: 'grand_final', bracket: 'grand_final' }],
  playoffStructure: [],
  roundNames: { grand_final: 'Grand Final' },
  qualificationConfirmed: true,
  phase: 'finals',
  seededPlayers: [],
  playoffSeededPlayers: [],
  playoffComplete: false,
};

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'admin' } } }),
}));

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    use: () => ({ id: 't1' }),
  };
});

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    warning: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/usePolling', () => ({
  usePolling: () => ({
    data: mockPollData,
    isLoading: false,
    lastUpdated: new Date('2026-01-01T00:00:00.000Z'),
    isPolling: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/components/tournament/double-elimination-bracket', () => ({
  DoubleEliminationBracket: (props: Record<string, unknown>) => {
    mockDoubleBracketProps.push(props);
    return <div data-testid="mock-double-elimination-bracket" />;
  },
}));

jest.mock('@/components/tournament/playoff-bracket', () => ({
  PlayoffBracket: (props: Record<string, unknown>) => {
    mockPlayoffBracketProps.push(props);
    const onMatchClick = props.onMatchClick as ((match: typeof legacyWinnerMatch) => void) | undefined;
    return (
      <button data-testid="mock-playoff-bracket" onClick={() => onMatchClick?.(mockPollData.playoffMatches[0])}>
        Open playoff score
      </button>
    );
  },
}));

describe('GrandPrixFinals TC-830 legacy winner wiring', () => {
  beforeEach(() => {
    mockDoubleBracketProps.length = 0;
    mockPlayoffBracketProps.length = 0;
    mockPollData = {
      matches: [legacyWinnerMatch],
      playoffMatches: [],
      bracketStructure: [{ matchNumber: 1, round: 'grand_final', bracket: 'grand_final' }],
      playoffStructure: [],
      roundNames: { grand_final: 'Grand Final' },
      qualificationConfirmed: true,
      phase: 'finals',
      seededPlayers: [],
      playoffSeededPlayers: [],
      playoffComplete: false,
    };
  });

  it('passes the GP legacy winner resolver into the finals bracket', async () => {
    const params = Promise.resolve({ id: 't1' });

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={params} />
      </Suspense>,
    );

    await waitFor(() => {
      expect(mockDoubleBracketProps.length).toBeGreaterThan(0);
    });

    const props = mockDoubleBracketProps.at(-1)!;
    const getWinnerId = props.getWinnerId as (match: typeof legacyWinnerMatch) => string | null;
    const matches = props.matches as (typeof legacyWinnerMatch)[];

    expect(getWinnerId).toBeDefined();
    expect(matches[0].score1).toBe(2);
    expect(matches[0].score2).toBe(2);
    expect(getWinnerId(matches[0])).toBe('p2');
  });

  it('passes the GP legacy winner resolver into the playoff bracket', async () => {
    const playoffMatch = {
      ...legacyWinnerMatch,
      stage: 'playoff',
      round: 'playoff_r1',
    };
    mockPollData = {
      matches: [],
      playoffMatches: [playoffMatch],
      bracketStructure: [],
      playoffStructure: [{ matchNumber: 1, round: 'playoff_r1', bracket: 'winners' }],
      roundNames: { playoff_r1: 'Playoff Round 1' },
      qualificationConfirmed: true,
      phase: 'playoff',
      seededPlayers: [],
      playoffSeededPlayers: [],
      playoffComplete: false,
    };
    const params = Promise.resolve({ id: 't1' });

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={params} />
      </Suspense>,
    );

    await waitFor(() => {
      expect(mockPlayoffBracketProps.length).toBeGreaterThan(0);
    });

    const props = mockPlayoffBracketProps.at(-1)!;
    const getWinnerId = props.getWinnerId as (match: typeof playoffMatch) => string | null;
    const playoffMatches = props.playoffMatches as (typeof playoffMatch)[];

    expect(getWinnerId).toBeDefined();
    expect(playoffMatches[0].score1).toBe(2);
    expect(playoffMatches[0].score2).toBe(2);
    expect(getWinnerId(playoffMatches[0])).toBe('p2');
  });

  it('defaults a new playoff match to the final cup score while keeping cup details optional', async () => {
    const playoffMatch = {
      ...legacyWinnerMatch,
      completed: false,
      points1: 0,
      points2: 0,
      cupResults: undefined,
      stage: 'playoff',
      round: 'playoff_r1',
    };
    mockPollData = {
      matches: [],
      playoffMatches: [playoffMatch],
      bracketStructure: [],
      playoffStructure: [{ matchNumber: 1, round: 'playoff_r1', bracket: 'winners' }],
      roundNames: { playoff_r1: 'Playoff Round 1' },
      qualificationConfirmed: true,
      phase: 'playoff',
      seededPlayers: [],
      playoffSeededPlayers: [],
      playoffComplete: false,
    };

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={Promise.resolve({ id: 't1' })} />
      </Suspense>,
    );

    await waitFor(() => expect(screen.getByTestId('mock-playoff-bracket')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-playoff-bracket'));

    expect(await screen.findByLabelText('Player 1')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'manualTotalScore' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'recordCupDetails' }));
    expect(await screen.findByRole('checkbox', { name: 'manualTotalScore' })).toBeChecked();
  });

  it('reopens saved race details instead of replacing them with the score-only form', async () => {
    const races = Array.from({ length: 5 }, (_, index) => ({
      course: ['MC1', 'MC2', 'MC3', 'MC4', 'DP1'][index],
      position1: 1,
      position2: 2,
      points1: 9,
      points2: 6,
    }));
    const playoffMatch = {
      ...legacyWinnerMatch,
      completed: false,
      points1: 0,
      points2: 0,
      stage: 'playoff',
      round: 'playoff_r1',
      cupResults: [{ cup: 'Mushroom', points1: 45, points2: 30, winner: 1 as const, races }],
    };
    mockPollData = {
      matches: [],
      playoffMatches: [playoffMatch],
      bracketStructure: [],
      playoffStructure: [{ matchNumber: 1, round: 'playoff_r1', bracket: 'winners' }],
      roundNames: { playoff_r1: 'Playoff Round 1' },
      qualificationConfirmed: true,
      phase: 'playoff',
      seededPlayers: [],
      playoffSeededPlayers: [],
      playoffComplete: false,
    };

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={Promise.resolve({ id: 't1' })} />
      </Suspense>,
    );

    await waitFor(() => expect(screen.getByTestId('mock-playoff-bracket')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-playoff-bracket'));

    expect(await screen.findByRole('checkbox', { name: 'manualTotalScore' })).not.toBeChecked();
    expect(screen.queryByLabelText('Player 1')).not.toBeInTheDocument();
  });

  it('reopens legacy top-level race details when cupResults is absent', async () => {
    const races = Array.from({ length: 5 }, (_, index) => ({
      course: ['MC1', 'MC2', 'MC3', 'MC4', 'DP1'][index],
      position1: 1,
      position2: 2,
      points1: 9,
      points2: 6,
    }));
    const playoffMatch = {
      ...legacyWinnerMatch,
      completed: false,
      points1: 1,
      points2: 0,
      stage: 'playoff',
      round: 'playoff_r1',
      cupResults: undefined,
      races,
    };
    mockPollData = {
      matches: [],
      playoffMatches: [playoffMatch],
      bracketStructure: [],
      playoffStructure: [{ matchNumber: 1, round: 'playoff_r1', bracket: 'winners' }],
      roundNames: { playoff_r1: 'Playoff Round 1' },
      qualificationConfirmed: true,
      phase: 'playoff',
      seededPlayers: [],
      playoffSeededPlayers: [],
      playoffComplete: false,
    };

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={Promise.resolve({ id: 't1' })} />
      </Suspense>,
    );

    await waitFor(() => expect(screen.getByTestId('mock-playoff-bracket')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-playoff-bracket'));

    expect(await screen.findByRole('checkbox', { name: 'manualTotalScore' })).not.toBeChecked();
  });
});

/**
 * @jest-environment jsdom
 *
 * Manual bracket slot placement adjustment (issue #3017 Phase 2) wired into
 * the GP finals page. Mirrors `mr-finals-slot-edit-playoff-wiring.test.tsx`
 * and `bm-finals-slot-edit-playoff-wiring.test.tsx`, adapted for GP's
 * derived `gpBracketMatches`/`gpPlayoffBracketMatches` (which alias
 * points1/points2 into score1/score2 for the shared bracket components) —
 * the slot-click payload the page hands to `BracketSlotEditDialog` is the
 * derived object, not the raw GPMatch.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import GrandPrixFinals from '@/app/tournaments/[id]/gp/finals/page';

const mockDoubleBracketProps: Record<string, unknown>[] = [];
const mockPlayoffBracketProps: Record<string, unknown>[] = [];
const mockSlotEditDialogProps: Record<string, unknown>[] = [];

const finalsMatch = {
  id: 'fm1',
  matchNumber: 1,
  round: 'winners_qf',
  stage: 'finals',
  player1Id: 'p1',
  player2Id: 'p2',
  points1: 0,
  points2: 0,
  completed: false,
  version: 0,
  tvNumber: null,
  player1: { id: 'p1', name: 'Player 1', nickname: 'Player 1' },
  player2: { id: 'p2', name: 'Player 2', nickname: 'Player 2' },
};

const playoffMatch = {
  id: 'pm1',
  matchNumber: 1,
  round: 'playoff_r1',
  stage: 'playoff',
  player1Id: 'p3',
  player2Id: 'p4',
  points1: 0,
  points2: 0,
  completed: false,
  version: 0,
  tvNumber: null,
  player1: { id: 'p3', name: 'Player 3', nickname: 'Player 3' },
  player2: { id: 'p4', name: 'Player 4', nickname: 'Player 4' },
};

let mockPollData: Record<string, unknown>;

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'admin' } } }),
}));

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return { ...actual, use: () => ({ id: 't1' }) };
});

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), warning: jest.fn(), success: jest.fn() },
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
    return <div data-testid="mock-playoff-bracket" />;
  },
}));

jest.mock('@/components/tournament/bracket-slot-edit-dialog', () => ({
  BracketSlotEditDialog: (props: Record<string, unknown>) => {
    mockSlotEditDialogProps.push(props);
    return null;
  },
}));

const basePollData = {
  bracketStructure: [],
  playoffStructure: [],
  roundNames: {},
  qualificationConfirmed: true,
  seededPlayers: [],
  playoffSeededPlayers: [],
  playoffComplete: false,
};

describe('GP finals page — manual slot placement adjustment wiring (issue #3017 Phase 2)', () => {
  beforeEach(() => {
    mockDoubleBracketProps.length = 0;
    mockPlayoffBracketProps.length = 0;
    mockSlotEditDialogProps.length = 0;
  });

  it('shows the slot-edit-mode toggle during the playoff-only phase (no main bracket yet)', async () => {
    mockPollData = {
      ...basePollData,
      matches: [],
      playoffMatches: [playoffMatch],
      playoffStructure: [{ matchNumber: 1, round: 'playoff_r1', bracket: 'winners' }],
      phase: 'playoff',
    };

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={Promise.resolve({ id: 't1' })} />
      </Suspense>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('slot-edit-mode-toggle')).toBeInTheDocument();
    });
  });

  it('passes slotEditMode/onSlotClick to PlayoffBracket once the toggle is on', async () => {
    mockPollData = {
      ...basePollData,
      matches: [],
      playoffMatches: [playoffMatch],
      playoffStructure: [{ matchNumber: 1, round: 'playoff_r1', bracket: 'winners' }],
      phase: 'playoff',
    };

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={Promise.resolve({ id: 't1' })} />
      </Suspense>,
    );

    const toggle = await screen.findByTestId('slot-edit-mode-toggle');
    toggle.click();

    await waitFor(() => {
      const props = mockPlayoffBracketProps.at(-1)!;
      expect(props.slotEditMode).toBe(true);
      expect(typeof props.onSlotClick).toBe('function');
    });
  });

  it('routes a playoff-stage slot click to the playoff matches/structure, not the finals ones', async () => {
    mockPollData = {
      ...basePollData,
      matches: [],
      playoffMatches: [playoffMatch],
      playoffStructure: [{ matchNumber: 1, round: 'playoff_r1', bracket: 'winners' }],
      phase: 'playoff',
    };

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={Promise.resolve({ id: 't1' })} />
      </Suspense>,
    );

    const toggle = await screen.findByTestId('slot-edit-mode-toggle');
    toggle.click();

    await waitFor(() => expect(mockPlayoffBracketProps.at(-1)?.onSlotClick).toBeDefined());
    const onSlotClick = mockPlayoffBracketProps.at(-1)!.onSlotClick as (
      m: typeof playoffMatch & { score1: number; score2: number },
      s: 1 | 2,
    ) => void;
    const derivedPlayoffMatch = { ...playoffMatch, score1: playoffMatch.points1, score2: playoffMatch.points2 };
    onSlotClick(derivedPlayoffMatch, 1);

    await waitFor(() => {
      const dialogProps = mockSlotEditDialogProps.at(-1)!;
      expect(dialogProps.match).toEqual(derivedPlayoffMatch);
      expect(dialogProps.slot).toBe(1);
      expect(dialogProps.matches).toEqual([derivedPlayoffMatch]);
      expect(dialogProps.bracketStructure).toEqual([{ matchNumber: 1, round: 'playoff_r1', bracket: 'winners' }]);
    });
  });

  it('routes a finals-stage slot click to the finals matches/structure, not the playoff ones', async () => {
    mockPollData = {
      ...basePollData,
      matches: [finalsMatch],
      bracketStructure: [{ matchNumber: 1, round: 'winners_qf', bracket: 'winners' }],
      playoffMatches: [],
      phase: 'finals',
    };

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={Promise.resolve({ id: 't1' })} />
      </Suspense>,
    );

    const toggle = await screen.findByTestId('slot-edit-mode-toggle');
    toggle.click();

    await waitFor(() => expect(mockDoubleBracketProps.at(-1)?.onSlotClick).toBeDefined());
    const onSlotClick = mockDoubleBracketProps.at(-1)!.onSlotClick as (
      m: typeof finalsMatch & { score1: number; score2: number },
      s: 1 | 2,
    ) => void;
    const derivedFinalsMatch = { ...finalsMatch, score1: finalsMatch.points1, score2: finalsMatch.points2 };
    onSlotClick(derivedFinalsMatch, 2);

    await waitFor(() => {
      const dialogProps = mockSlotEditDialogProps.at(-1)!;
      expect(dialogProps.match).toEqual(derivedFinalsMatch);
      expect(dialogProps.slot).toBe(2);
      expect(dialogProps.matches).toEqual([derivedFinalsMatch]);
      expect(dialogProps.bracketStructure).toEqual([{ matchNumber: 1, round: 'winners_qf', bracket: 'winners' }]);
    });
  });

  it('points BracketSlotEditDialog at the GP finals/qualification API paths', async () => {
    mockPollData = {
      ...basePollData,
      matches: [finalsMatch],
      bracketStructure: [{ matchNumber: 1, round: 'winners_qf', bracket: 'winners' }],
      playoffMatches: [],
      phase: 'finals',
    };

    render(
      <Suspense fallback={null}>
        <GrandPrixFinals params={Promise.resolve({ id: 't1' })} />
      </Suspense>,
    );

    await waitFor(() => expect(mockSlotEditDialogProps.length).toBeGreaterThan(0));
    const dialogProps = mockSlotEditDialogProps.at(-1)!;
    expect(dialogProps.finalsApiPath).toBe('/api/tournaments/t1/gp/finals');
    expect(dialogProps.qualificationApiPath).toBe('/api/tournaments/t1/gp');
  });
});

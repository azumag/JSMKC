/**
 * @jest-environment jsdom
 *
 * Playoff support for the manual bracket slot placement adjustment feature
 * (issue #3017 playoff follow-up). Before this change, the "配置調整モード"
 * toggle only appeared once the main double-elimination bracket existed
 * (`matches.length > 0`), and the edit dialog was always wired to the main
 * bracket's `matches`/`bracketStructure` regardless of which bracket the
 * clicked slot belonged to. These tests verify:
 *  - the toggle also appears during the playoff-only phase,
 *  - `PlayoffBracket` receives `slotEditMode`/`onSlotClick`,
 *  - clicking a playoff-stage slot opens the dialog with the *playoff*
 *    matches/structure (not the finals ones), and vice versa for a
 *    finals-stage slot.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import BattleModeFinals from '@/app/tournaments/[id]/bm/finals/page';

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
  score1: 0,
  score2: 0,
  completed: false,
  version: 0,
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
  score1: 0,
  score2: 0,
  completed: false,
  version: 0,
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
    error: null,
    lastETag: null,
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

describe('BM finals page — playoff slot-edit wiring (issue #3017 playoff support)', () => {
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
        <BattleModeFinals params={Promise.resolve({ id: 't1' })} />
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
        <BattleModeFinals params={Promise.resolve({ id: 't1' })} />
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
        <BattleModeFinals params={Promise.resolve({ id: 't1' })} />
      </Suspense>,
    );

    const toggle = await screen.findByTestId('slot-edit-mode-toggle');
    toggle.click();

    await waitFor(() => expect(mockPlayoffBracketProps.at(-1)?.onSlotClick).toBeDefined());
    const onSlotClick = mockPlayoffBracketProps.at(-1)!.onSlotClick as (m: typeof playoffMatch, s: 1 | 2) => void;
    onSlotClick(playoffMatch, 1);

    await waitFor(() => {
      const dialogProps = mockSlotEditDialogProps.at(-1)!;
      expect(dialogProps.match).toEqual(playoffMatch);
      expect(dialogProps.slot).toBe(1);
      expect(dialogProps.matches).toEqual([playoffMatch]);
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
        <BattleModeFinals params={Promise.resolve({ id: 't1' })} />
      </Suspense>,
    );

    const toggle = await screen.findByTestId('slot-edit-mode-toggle');
    toggle.click();

    await waitFor(() => expect(mockDoubleBracketProps.at(-1)?.onSlotClick).toBeDefined());
    const onSlotClick = mockDoubleBracketProps.at(-1)!.onSlotClick as (m: typeof finalsMatch, s: 1 | 2) => void;
    onSlotClick(finalsMatch, 2);

    await waitFor(() => {
      const dialogProps = mockSlotEditDialogProps.at(-1)!;
      expect(dialogProps.match).toEqual(finalsMatch);
      expect(dialogProps.slot).toBe(2);
      expect(dialogProps.matches).toEqual([finalsMatch]);
      expect(dialogProps.bracketStructure).toEqual([{ matchNumber: 1, round: 'winners_qf', bracket: 'winners' }]);
    });
  });
});

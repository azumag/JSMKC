/**
 * @jest-environment jsdom
 */

/**
 * Tests for the DoubleEliminationBracket layout wrapper.
 *
 * Covers issue #424: when the bracket gets wide horizontally (16-player
 * bracket, 5+ round columns), the content used to overflow its containing
 * pane on desktop because the row wrapper had `md:overflow-visible` applied,
 * which disabled the horizontal scrollbar inherited from `overflow-x-auto`.
 *
 * These tests assert that every round-row wrapper inside each bracket
 * section keeps `overflow-x-auto` active at all breakpoints so the bracket
 * scrolls horizontally instead of breaking the surrounding layout.
 */

import { render, screen } from '@testing-library/react';
import { DoubleEliminationBracket } from '@/components/tournament/double-elimination-bracket';
import { generateBracketStructure } from '@/lib/double-elimination';

/**
 * Build a minimal 8-player double-elimination bracket structure.
 * The exact match data doesn't matter for the overflow test -- we only
 * need each round-row wrapper to be rendered so we can inspect classes.
 */
function build8PlayerStructure() {
  return [
    { matchNumber: 1, round: 'winners_qf', bracket: 'winners' as const, player1Seed: 1, player2Seed: 8 },
    { matchNumber: 2, round: 'winners_qf', bracket: 'winners' as const, player1Seed: 4, player2Seed: 5 },
    { matchNumber: 3, round: 'winners_qf', bracket: 'winners' as const, player1Seed: 2, player2Seed: 7 },
    { matchNumber: 4, round: 'winners_qf', bracket: 'winners' as const, player1Seed: 3, player2Seed: 6 },
    { matchNumber: 5, round: 'winners_sf', bracket: 'winners' as const },
    { matchNumber: 6, round: 'winners_sf', bracket: 'winners' as const },
    { matchNumber: 7, round: 'winners_final', bracket: 'winners' as const },
    { matchNumber: 8, round: 'losers_r1', bracket: 'losers' as const },
    { matchNumber: 9, round: 'losers_r1', bracket: 'losers' as const },
    { matchNumber: 10, round: 'losers_r2', bracket: 'losers' as const },
    { matchNumber: 11, round: 'losers_r2', bracket: 'losers' as const },
    { matchNumber: 12, round: 'losers_r3', bracket: 'losers' as const },
    { matchNumber: 13, round: 'losers_sf', bracket: 'losers' as const },
    { matchNumber: 14, round: 'losers_final', bracket: 'losers' as const },
    { matchNumber: 15, round: 'grand_final', bracket: 'grand_final' as const },
    { matchNumber: 16, round: 'grand_final_reset', bracket: 'grand_final' as const },
  ];
}

describe('DoubleEliminationBracket horizontal overflow (issue #424)', () => {
  it('allows horizontal scrolling in every bracket section at all breakpoints', () => {
    const { container } = render(
      <DoubleEliminationBracket matches={[]} bracketStructure={build8PlayerStructure()} roundNames={{}} />,
    );

    /* Each section (Winners / Losers / Grand Final) wraps its round columns
     * in a flex row. That row is the element that needs to scroll when the
     * bracket is wider than its container. */
    const roundRows = container.querySelectorAll<HTMLElement>('div.md\\:flex-row');

    /* Winners, Losers, Grand Final => 3 round-row wrappers. */
    expect(roundRows.length).toBe(3);

    roundRows.forEach((row) => {
      /* Scrolling must be active; the prior bug was that `md:overflow-visible`
       * cancelled this on desktop and the bracket broke out of the pane. */
      expect(row.className).toContain('overflow-x-auto');
      expect(row.className).not.toContain('md:overflow-visible');
    });
  });
});

describe('DoubleEliminationBracket TBD rendering (issue #574)', () => {
  /* Right after bracket generation, losers-bracket matches have no real
   * players yet -- the DB schema requires non-null player ids so the API
   * fills both slots with the seed-1 player as a placeholder (see
   * finals-route.ts POST handler fallback). The UI must render those slots
   * as "TBD" rather than showing seed 1 on both sides, which misled users
   * into thinking the top seed was dropping straight into the losers bracket. */
  const seed1 = { id: 'p1', name: 'Alice A', nickname: 'Alice' };
  const seed2 = { id: 'p2', name: 'Bob B', nickname: 'Bob' };
  const seed3 = { id: 'p3', name: 'Carol C', nickname: 'Carol' };
  const seed4 = { id: 'p4', name: 'Dan D', nickname: 'Dan' };
  const seed5 = { id: 'p5', name: 'Eve E', nickname: 'Eve' };
  const seed6 = { id: 'p6', name: 'Frank F', nickname: 'Frank' };
  const seed7 = { id: 'p7', name: 'Grace G', nickname: 'Grace' };
  const seed8 = { id: 'p8', name: 'Heidi H', nickname: 'Heidi' };

  const seededPlayers = [seed1, seed2, seed3, seed4, seed5, seed6, seed7, seed8].map((player, i) => ({
    seed: i + 1,
    playerId: player.id,
    player,
  }));

  /* Build match rows as the POST /finals handler would immediately after
   * bracket creation: winners QF matches get their two seeds; every other
   * slot is filled with seed 1 on both sides. */
  const buildInitialMatches = () => {
    const seedPairs: Record<number, [typeof seed1, typeof seed1]> = {
      1: [seed1, seed8],
      2: [seed4, seed5],
      3: [seed2, seed7],
      4: [seed3, seed6],
    };
    return build8PlayerStructure().map((b) => {
      const pair = seedPairs[b.matchNumber];
      const player1 = pair ? pair[0] : seed1;
      const player2 = pair ? pair[1] : seed1;
      return {
        id: `m${b.matchNumber}`,
        matchNumber: b.matchNumber,
        round: b.round,
        stage: 'finals',
        player1Id: player1.id,
        player2Id: player2.id,
        score1: 0,
        score2: 0,
        completed: false,
        player1,
        player2,
      };
    });
  };

  it('renders losers_r1 slots as TBD right after bracket generation', () => {
    const { container } = render(
      <DoubleEliminationBracket
        matches={buildInitialMatches()}
        bracketStructure={build8PlayerStructure()}
        roundNames={{}}
        seededPlayers={seededPlayers}
      />,
    );

    /* Locate losers_r1 cards (match 8 and 9) by their match-number label. */
    const losersR1Cards = Array.from(container.querySelectorAll<HTMLElement>("[role='button']")).filter((el) => {
      const label = el.querySelector('div.text-xs');
      return label && (label.textContent === 'M8' || label.textContent === 'M9');
    });

    expect(losersR1Cards).toHaveLength(2);

    for (const card of losersR1Cards) {
      /* Both player rows should say TBD, and neither should display the
       * seed-1 placeholder name that the DB stored. */
      expect(card.textContent).toContain('TBD');
      expect(card.textContent).not.toContain(seed1.nickname);
      expect(card.textContent).not.toContain('[1]');
    }
  });

  it('keeps winners_qf first-round matches showing seeded player names', () => {
    const { container } = render(
      <DoubleEliminationBracket
        matches={buildInitialMatches()}
        bracketStructure={build8PlayerStructure()}
        roundNames={{}}
        seededPlayers={seededPlayers}
      />,
    );

    /* Match 1 is Seed 1 vs Seed 8 -- must not be TBD. */
    const winnersQF1 = Array.from(container.querySelectorAll<HTMLElement>("[role='button']")).find(
      (el) => el.querySelector('div.text-xs')?.textContent === 'M1',
    );

    expect(winnersQF1).toBeDefined();
    expect(winnersQF1!.textContent).toContain(seed1.nickname);
    expect(winnersQF1!.textContent).toContain(seed8.nickname);
    expect(winnersQF1!.textContent).toContain('[1]');
    expect(winnersQF1!.textContent).toContain('[8]');
  });

  it('prefers the numeric seed over a qualification group-rank label when both are available', () => {
    const { container } = render(
      <DoubleEliminationBracket
        matches={buildInitialMatches()}
        bracketStructure={build8PlayerStructure()}
        roundNames={{}}
        seededPlayers={seededPlayers.map((entry, index) => ({
          ...entry,
          qualificationRankLabel: index % 2 === 0 ? `A${index + 1}` : `B${index + 1}`,
        }))}
      />,
    );

    const winnersQF1 = Array.from(container.querySelectorAll<HTMLElement>("[role='button']")).find(
      (el) => el.querySelector('div.text-xs')?.textContent === 'M1',
    );

    expect(winnersQF1).toBeDefined();
    expect(winnersQF1!.textContent).toContain('[1]');
    expect(winnersQF1!.textContent).toContain('[8]');
    expect(winnersQF1!.textContent).not.toContain('[A1]');
    expect(winnersQF1!.textContent).not.toContain('[B8]');
  });

  it("keeps a barrage winner's original seed in later KO rounds", () => {
    const barrageWinner = { id: 'p17', name: 'Barrage Winner', nickname: 'Barrage' };
    const semifinal = {
      ...buildInitialMatches().find((match) => match.matchNumber === 5)!,
      player1Id: barrageWinner.id,
      player2Id: seed2.id,
      player1: barrageWinner,
      player2: seed2,
      completed: true,
      score1: 3,
      score2: 1,
    };

    const { container } = render(
      <DoubleEliminationBracket
        matches={[semifinal]}
        bracketStructure={build8PlayerStructure()}
        roundNames={{}}
        seededPlayers={[
          ...seededPlayers,
          /* The player was routed into structural Upper slot 16, but earned
           * qualification seed 17 through the barrage. */
          { seed: 16, originalSeed: 17, playerId: barrageWinner.id, player: barrageWinner },
        ]}
      />,
    );

    const winnersSF = Array.from(container.querySelectorAll<HTMLElement>("[role='button']")).find(
      (el) => el.querySelector('div.text-xs')?.textContent === 'M5',
    );

    expect(winnersSF?.textContent).toContain('[17]');
    expect(winnersSF?.textContent).toContain('[2]');
    expect(winnersSF?.textContent).not.toContain('[16]');
  });

  it('renders unresolved Top-24 barrage seats as TBD in a previewed 16-player bracket', () => {
    const bracketStructure = generateBracketStructure(16);
    const seededPreview = [
      ...seededPlayers,
      { seed: 9, playerId: 'p9', player: { id: 'p9', name: 'Ivy I', nickname: 'Ivy' } },
      { seed: 10, playerId: 'p10', player: { id: 'p10', name: 'Jules J', nickname: 'Jules' } },
      { seed: 11, playerId: 'p11', player: { id: 'p11', name: 'Kai K', nickname: 'Kai' } },
      { seed: 12, playerId: 'p12', player: { id: 'p12', name: 'Lee L', nickname: 'Lee' } },
      { seed: 16, playerId: 'p16', player: { id: 'p16', name: 'Mika M', nickname: 'Mika' } },
    ];

    const { container } = render(
      <DoubleEliminationBracket
        matches={[]}
        bracketStructure={bracketStructure}
        roundNames={{}}
        seededPlayers={seededPreview}
      />,
    );

    /* Barrage seeds 13-16 face direct seeds 4, 2, 3, and 1 respectively in
     * Winners R1 (matches 3, 5, 7, 1 -- see generate16PlayerBracket's
     * seedPairs16). Seed 16 (Mika) is resolved here, so only match 1 shows
     * two real names; matches 3/5/7 still have a TBD barrage seat. */
    const winnersR1Cards = Array.from(container.querySelectorAll<HTMLElement>("[role='button']")).filter((el) => {
      const label = el.querySelector('div.text-xs');
      return label && ['M1', 'M3', 'M5', 'M7'].includes(label.textContent || '');
    });

    expect(winnersR1Cards).toHaveLength(4);
    expect(winnersR1Cards[0].textContent).toContain(seed1.nickname); /* M1: seed1 vs seed16 */
    expect(winnersR1Cards[0].textContent).toContain('Mika');
    expect(winnersR1Cards[1].textContent).toContain(seed4.nickname); /* M3: seed4 vs seed13 */
    expect(winnersR1Cards[1].textContent).toContain('TBD');
    expect(winnersR1Cards[2].textContent).toContain(seed2.nickname); /* M5: seed2 vs seed15 */
    expect(winnersR1Cards[2].textContent).toContain('TBD');
    expect(winnersR1Cards[3].textContent).toContain(seed3.nickname); /* M7: seed3 vs seed14 */
    expect(winnersR1Cards[3].textContent).toContain('TBD');
  });

  it('renders a skipped Top-24 direct seed as TBD while keeping the bracket slot visible', () => {
    const bracketStructure = generateBracketStructure(16);
    const seededPreview = [
      ...seededPlayers.filter((entry) => entry.seed !== 1),
      { seed: 16, playerId: 'p16', player: { id: 'p16', name: 'Mika M', nickname: 'Mika' } },
    ];

    render(
      <DoubleEliminationBracket
        matches={[]}
        bracketStructure={bracketStructure}
        roundNames={{}}
        seededPlayers={seededPreview}
      />,
    );

    const winnersR1M1 = screen.getByRole('button', {
      name: /Match 1: TBD vs Mika/,
    });

    expect(winnersR1M1.textContent).not.toContain('[1]');
    expect(winnersR1M1.textContent).toContain('TBD');
    expect(winnersR1M1.textContent).toContain('[16]');
    expect(winnersR1M1.textContent).toContain('Mika');
  });
});

describe('DoubleEliminationBracket winner resolver', () => {
  const player1 = { id: 'p1', name: 'Alice A', nickname: 'Alice' };
  const player2 = { id: 'p2', name: 'Bob B', nickname: 'Bob' };

  it('uses getWinnerId for completed tied matches instead of score ordering only', () => {
    render(
      <DoubleEliminationBracket
        matches={[
          {
            id: 'm1',
            matchNumber: 1,
            round: 'winners_qf',
            stage: 'finals',
            player1Id: player1.id,
            player2Id: player2.id,
            score1: 2,
            score2: 2,
            completed: true,
            player1,
            player2,
          },
        ]}
        bracketStructure={[build8PlayerStructure()[0]]}
        roundNames={{}}
        getWinnerId={() => player2.id}
      />,
    );

    expect(screen.getByText('Bob').closest('div')?.className).toContain('bg-primary/10');
    expect(screen.getByText('Alice').closest('div')?.className).not.toContain('bg-primary/10');
  });
});

describe('DoubleEliminationBracket manual slot placement adjustment (issue #3017)', () => {
  const player1 = { id: 'p1', name: 'Alice A', nickname: 'Alice' };
  const player2 = { id: 'p2', name: 'Bob B', nickname: 'Bob' };

  const buildMatch = (overrides = {}) => ({
    id: 'm1',
    matchNumber: 1,
    round: 'winners_qf',
    stage: 'finals',
    player1Id: player1.id,
    player2Id: player2.id,
    score1: 0,
    score2: 0,
    completed: false,
    player1,
    player2,
    ...overrides,
  });

  it('shows an edit button on each confirmed slot when slotEditMode is on', () => {
    render(
      <DoubleEliminationBracket
        matches={[buildMatch()]}
        bracketStructure={[build8PlayerStructure()[0]]}
        roundNames={{}}
        slotEditMode
        onSlotClick={() => {}}
      />,
    );

    expect(screen.getByTestId('slot-edit-button-1')).toBeInTheDocument();
    expect(screen.getByTestId('slot-edit-button-2')).toBeInTheDocument();
  });

  it('hides edit buttons when slotEditMode is off', () => {
    render(
      <DoubleEliminationBracket
        matches={[buildMatch()]}
        bracketStructure={[build8PlayerStructure()[0]]}
        roundNames={{}}
      />,
    );

    expect(screen.queryByTestId('slot-edit-button-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slot-edit-button-2')).not.toBeInTheDocument();
  });

  it('hides edit buttons on a completed match even in slotEditMode', () => {
    render(
      <DoubleEliminationBracket
        matches={[buildMatch({ completed: true, score1: 3, score2: 1 })]}
        bracketStructure={[build8PlayerStructure()[0]]}
        roundNames={{}}
        slotEditMode
        onSlotClick={() => {}}
      />,
    );

    expect(screen.queryByTestId('slot-edit-button-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slot-edit-button-2')).not.toBeInTheDocument();
  });

  it('hides the edit button for a slot that is still TBD', () => {
    /* Match 5 (winners_sf) is fed by winners_qf matches 1 and 2 via
     * winnerGoesTo; neither source match is present (i.e. not completed),
     * so both of match 5's slots are TBD and must not be editable. */
    const bracketStructure = [
      { matchNumber: 1, round: 'winners_qf', bracket: 'winners' as const, winnerGoesTo: 5, position: 1 as const },
      { matchNumber: 2, round: 'winners_qf', bracket: 'winners' as const, winnerGoesTo: 5, position: 2 as const },
      { matchNumber: 5, round: 'winners_sf', bracket: 'winners' as const },
    ];
    render(
      <DoubleEliminationBracket
        matches={[buildMatch({ id: 'm5', matchNumber: 5, round: 'winners_sf' })]}
        bracketStructure={bracketStructure}
        roundNames={{}}
        slotEditMode
        onSlotClick={() => {}}
      />,
    );

    expect(screen.queryByTestId('slot-edit-button-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slot-edit-button-2')).not.toBeInTheDocument();
  });

  it('calls onSlotClick with the match and slot, without triggering onMatchClick', () => {
    const onSlotClick = jest.fn();
    const onMatchClick = jest.fn();
    render(
      <DoubleEliminationBracket
        matches={[buildMatch()]}
        bracketStructure={[build8PlayerStructure()[0]]}
        roundNames={{}}
        slotEditMode
        onSlotClick={onSlotClick}
        onMatchClick={onMatchClick}
      />,
    );

    screen.getByTestId('slot-edit-button-2').click();

    expect(onSlotClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }), 2);
    expect(onMatchClick).not.toHaveBeenCalled();
  });

  it('shows the manual-adjustment badge only when slotOverrideAt is set', () => {
    const { rerender } = render(
      <DoubleEliminationBracket
        matches={[buildMatch({ slotOverrideAt: '2026-07-20T00:00:00.000Z' })]}
        bracketStructure={[build8PlayerStructure()[0]]}
        roundNames={{}}
      />,
    );
    expect(screen.getByTestId('slot-override-badge')).toBeInTheDocument();

    rerender(
      <DoubleEliminationBracket
        matches={[buildMatch({ slotOverrideAt: null })]}
        bracketStructure={[build8PlayerStructure()[0]]}
        roundNames={{}}
      />,
    );
    expect(screen.queryByTestId('slot-override-badge')).not.toBeInTheDocument();
  });
});

describe('DoubleEliminationBracket startingCourseNumber display (issue #731)', () => {
  /* Verify that when matches carry a startingCourseNumber, the round header
   * shows the battle course label below the round name. */
  const player = { id: 'p1', name: 'Alice A', nickname: 'Alice' };
  const buildMatchesWithCourse = (courseByRound: Record<string, number>) =>
    build8PlayerStructure().map((b) => ({
      id: `m${b.matchNumber}`,
      matchNumber: b.matchNumber,
      round: b.round,
      stage: 'finals',
      player1Id: 'p1',
      player2Id: 'p1',
      score1: 0,
      score2: 0,
      completed: false,
      player1: player,
      player2: player,
      startingCourseNumber: b.round && courseByRound[b.round] != null ? courseByRound[b.round] : null,
    }));

  it('shows battleCourse label under round header when startingCourseNumber is set', () => {
    const matches = buildMatchesWithCourse({ winners_qf: 2, losers_r1: 3, grand_final: 1 });
    const { container } = render(
      <DoubleEliminationBracket matches={matches} bracketStructure={build8PlayerStructure()} roundNames={{}} />,
    );
    /* finals.battleCourse translation resolves to "Battle Course {number}" in test env */
    const text = container.textContent || '';
    expect(text).toContain('Battle Course 2'); /* winners_qf */
    expect(text).toContain('Battle Course 3'); /* losers_r1 */
    expect(text).toContain('Battle Course 1'); /* grand_final */
  });

  it('hides battleCourse label when startingCourseNumber is null', () => {
    const matches = buildMatchesWithCourse({});
    const { container } = render(
      <DoubleEliminationBracket matches={matches} bracketStructure={build8PlayerStructure()} roundNames={{}} />,
    );
    expect(container.textContent).not.toContain('Battle Course');
  });
});

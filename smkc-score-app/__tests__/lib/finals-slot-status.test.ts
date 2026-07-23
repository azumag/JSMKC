/**
 * @module __tests__/lib/finals-slot-status.test.ts
 *
 * Test suite for finals-slot-status.ts: determines whether a bracket slot
 * (player1/player2 of a given finals/playoff match) is "confirmed" (a real
 * player has been routed into it) or still "TBD" (waiting on an upstream
 * match to complete). This mirrors the client-side `isTBD` logic in
 * double-elimination-bracket.tsx so the manual slot-edit API (issue #3017)
 * can reject edits to unconfirmed slots using the same rules the UI uses.
 */
import { describe, it, expect } from '@jest/globals';
import { generateBracketStructure, generatePlayoffStructure } from '@/lib/double-elimination';
import { getFinalsSlotStatus, isFinalsSlotConfirmed, type SlotStatusMatch } from '@/lib/finals-slot-status';

function makeMatch(overrides: Partial<SlotStatusMatch> & { matchNumber: number }): SlotStatusMatch {
  return {
    round: null,
    completed: false,
    player1Id: `p1-${overrides.matchNumber}`,
    player2Id: `p2-${overrides.matchNumber}`,
    ...overrides,
  };
}

describe('finals-slot-status', () => {
  describe('8-player bracket (winners_qf is always confirmed)', () => {
    const bracketStructure = generateBracketStructure(8);

    it('treats winners_qf slots as confirmed even with no other matches present', () => {
      const matches = [makeMatch({ matchNumber: 1, round: 'winners_qf' })];
      const status = getFinalsSlotStatus(1, matches, bracketStructure);
      expect(status).toEqual({ player1: false, player2: false });
    });

    it('is unconfirmed (TBD) when the source match has not completed', () => {
      // Match 5 (winners_sf #1) receives from QF1 (position 1) and QF2 (position 2).
      const matches = [
        makeMatch({ matchNumber: 1, round: 'winners_qf', completed: false }),
        makeMatch({ matchNumber: 2, round: 'winners_qf', completed: false }),
        makeMatch({ matchNumber: 5, round: 'winners_sf' }),
      ];
      const status = getFinalsSlotStatus(5, matches, bracketStructure);
      expect(status).toEqual({ player1: true, player2: true });
    });

    it('is confirmed on the winner side once the source match completes', () => {
      const matches = [
        makeMatch({ matchNumber: 1, round: 'winners_qf', completed: true }),
        makeMatch({ matchNumber: 2, round: 'winners_qf', completed: false }),
        makeMatch({ matchNumber: 5, round: 'winners_sf' }),
      ];
      const status = getFinalsSlotStatus(5, matches, bracketStructure);
      expect(status).toEqual({ player1: false, player2: true });
    });

    it('is confirmed on the loser side once the source match completes', () => {
      // Match 8 (losers_r1 #1) receives the loser of QF1 (position 1, from loserGoesTo).
      const matches = [
        makeMatch({ matchNumber: 1, round: 'winners_qf', completed: true }),
        makeMatch({ matchNumber: 8, round: 'losers_r1' }),
      ];
      expect(isFinalsSlotConfirmed(8, 1, matches, bracketStructure)).toBe(true);
    });

    it('is unconfirmed on the loser side while the source match is incomplete', () => {
      const matches = [
        makeMatch({ matchNumber: 1, round: 'winners_qf', completed: false }),
        makeMatch({ matchNumber: 8, round: 'losers_r1' }),
      ];
      expect(isFinalsSlotConfirmed(8, 1, matches, bracketStructure)).toBe(false);
    });

    it('does not treat a completed row as confirmed when its upstream slots were never routed', () => {
      const matches = [makeMatch({ matchNumber: 5, round: 'winners_sf', completed: true })];
      const status = getFinalsSlotStatus(5, matches, bracketStructure);
      expect(status).toEqual({ player1: true, player2: true });
    });

    it('does not depend on placeholder ID equality when a source match exists', () => {
      // Even if player1Id happens to equal player2Id on the receiving match
      // (a placeholder artifact), a real routing source takes precedence.
      const matches = [
        makeMatch({ matchNumber: 1, round: 'winners_qf', completed: true }),
        makeMatch({ matchNumber: 2, round: 'winners_qf', completed: false }),
        makeMatch({ matchNumber: 5, round: 'winners_sf', player1Id: 'same', player2Id: 'same' }),
      ];
      const status = getFinalsSlotStatus(5, matches, bracketStructure);
      expect(status).toEqual({ player1: false, player2: true });
    });

    it('falls back to the placeholder-ID heuristic only when no routing source exists', () => {
      // Grand Final Reset (match 17) has no winnerGoesTo/loserGoesTo pointing
      // to it from any other match, so it cannot be resolved structurally.
      const beforePrefill = [
        makeMatch({ matchNumber: 17, round: 'grand_final_reset', player1Id: 'same', player2Id: 'same' }),
      ];
      expect(getFinalsSlotStatus(17, beforePrefill, bracketStructure)).toEqual({ player1: true, player2: true });

      const afterPrefill = [
        makeMatch({ matchNumber: 17, round: 'grand_final_reset', player1Id: 'winnerA', player2Id: 'winnerB' }),
      ];
      expect(getFinalsSlotStatus(17, afterPrefill, bracketStructure)).toEqual({ player1: false, player2: false });
    });

    it('resolves grand_final slots from winners_final and losers_final results', () => {
      const matches = [
        makeMatch({ matchNumber: 7, round: 'winners_final', completed: true }),
        makeMatch({ matchNumber: 15, round: 'losers_final', completed: false }),
        makeMatch({ matchNumber: 16, round: 'grand_final' }),
      ];
      expect(getFinalsSlotStatus(16, matches, bracketStructure)).toEqual({ player1: false, player2: true });
    });

    it('resolves Lower Final P1 from Winners Final and P2 from the lower-side semi-final', () => {
      const matches = [
        makeMatch({ matchNumber: 7, round: 'winners_final', completed: true }),
        makeMatch({ matchNumber: 14, round: 'losers_sf', completed: false }),
        makeMatch({ matchNumber: 15, round: 'losers_final' }),
      ];
      expect(getFinalsSlotStatus(15, matches, bracketStructure)).toEqual({ player1: false, player2: true });

      matches[1].completed = true;
      expect(getFinalsSlotStatus(15, matches, bracketStructure)).toEqual({ player1: false, player2: false });
    });

    it('treats NULL slots as TBD even when a legacy row has a completed source', () => {
      const matches = [
        makeMatch({ matchNumber: 7, round: 'winners_final', completed: true }),
        makeMatch({ matchNumber: 14, round: 'losers_sf', completed: true }),
        makeMatch({ matchNumber: 15, round: 'losers_final', player1Id: null, player2Id: null }),
      ];
      expect(getFinalsSlotStatus(15, matches, bracketStructure)).toEqual({ player1: true, player2: true });
    });

    it('returns fully TBD for a match number that is not present at all', () => {
      expect(getFinalsSlotStatus(999, [], bracketStructure)).toEqual({ player1: true, player2: true });
    });
  });

  describe('16-player bracket', () => {
    const bracketStructure = generateBracketStructure(16);

    it('treats winners_r1 slots as confirmed', () => {
      const winnersR1 = bracketStructure.find((b) => b.round === 'winners_r1');
      expect(winnersR1).toBeDefined();
      const matches = [makeMatch({ matchNumber: winnersR1!.matchNumber, round: 'winners_r1' })];
      expect(getFinalsSlotStatus(winnersR1!.matchNumber, matches, bracketStructure)).toEqual({
        player1: false,
        player2: false,
      });
    });

    it('keeps 16-player winners_qf slots TBD until their winners_r1 sources complete', () => {
      const qf = bracketStructure.find((b) => b.round === 'winners_qf')!;
      const sources = bracketStructure.filter((b) => b.winnerGoesTo === qf.matchNumber);
      const matches = [
        ...sources.map((source) =>
          makeMatch({ matchNumber: source.matchNumber, round: 'winners_r1', completed: false }),
        ),
        makeMatch({ matchNumber: qf.matchNumber, round: 'winners_qf', completed: false }),
      ];
      expect(getFinalsSlotStatus(qf.matchNumber, matches, bracketStructure)).toEqual({
        player1: true,
        player2: true,
      });
    });

    it('reverse-resolves a winners_sf slot from its two winners_qf sources', () => {
      const sf = bracketStructure.find((b) => b.round === 'winners_sf')!;
      const sources = bracketStructure.filter((b) => b.winnerGoesTo === sf.matchNumber);
      expect(sources).toHaveLength(2);
      const [sourceA, sourceB] = sources;

      const matches = [
        makeMatch({ matchNumber: sourceA.matchNumber, round: 'winners_qf', completed: true }),
        makeMatch({ matchNumber: sourceB.matchNumber, round: 'winners_qf', completed: false }),
        makeMatch({ matchNumber: sf.matchNumber, round: 'winners_sf' }),
      ];
      const status = getFinalsSlotStatus(sf.matchNumber, matches, bracketStructure);
      const expectedConfirmedSlot = sourceA.position === 1 ? 'player1' : 'player2';
      const expectedTbdSlot = expectedConfirmedSlot === 'player1' ? 'player2' : 'player1';
      expect(status[expectedConfirmedSlot]).toBe(false);
      expect(status[expectedTbdSlot]).toBe(true);
    });
  });

  describe('12-entrant playoff structure', () => {
    const playoffStructure = generatePlayoffStructure(12);

    it('reverse-resolves a playoff_r2 slot from its playoff_r1 source', () => {
      const r2 = playoffStructure.find((b) => b.round === 'playoff_r2')!;
      const source = playoffStructure.find((b) => b.winnerGoesTo === r2.matchNumber)!;
      expect(source.round).toBe('playoff_r1');

      const incomplete = [
        makeMatch({ matchNumber: source.matchNumber, round: 'playoff_r1', completed: false }),
        makeMatch({ matchNumber: r2.matchNumber, round: 'playoff_r2' }),
      ];
      expect(isFinalsSlotConfirmed(r2.matchNumber, source.position!, incomplete, playoffStructure)).toBe(false);

      const complete = [
        makeMatch({ matchNumber: source.matchNumber, round: 'playoff_r1', completed: true }),
        makeMatch({ matchNumber: r2.matchNumber, round: 'playoff_r2' }),
      ];
      expect(isFinalsSlotConfirmed(r2.matchNumber, source.position!, complete, playoffStructure)).toBe(true);
    });

    it('treats playoff_r1 slots as confirmed (seeded, not routed)', () => {
      const r1 = playoffStructure.find((b) => b.round === 'playoff_r1')!;
      const matches = [makeMatch({ matchNumber: r1.matchNumber, round: 'playoff_r1' })];
      expect(getFinalsSlotStatus(r1.matchNumber, matches, playoffStructure)).toEqual({
        player1: false,
        player2: false,
      });
    });
  });
});

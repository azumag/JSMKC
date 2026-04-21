/**
 * @module __tests__/lib/double-elimination.test.ts
 *
 * Test suite for the double elimination bracket generation logic (double-elimination.ts).
 *
 * Covers the following functionality:
 * - generateBracketStructure(): Generates the full 17-match double elimination
 *   bracket for 8 players, including:
 *   - Winners Bracket: Quarter Finals (4 matches with seeding 1v8, 4v5, 2v7, 3v6),
 *     Semi Finals (2 matches), and Finals (1 match).
 *   - Losers Bracket: Round 1 (2 matches), Round 2 (2 matches), Round 3 (2 matches),
 *     Semi Final (1 match), and Final (1 match).
 *   - Grand Final and Grand Final Reset (2 matches).
 *   - Validates winnerGoesTo and loserGoesTo routing for all matches.
 *   - Verifies correct bracket type assignments and position numbers.
 *   - Throws error for non-8-player counts.
 * - getNextMatchInfo(): Determines the next match number and player position
 *   for winners and losers of each match in the bracket.
 *   - Tests routing for winners and losers from every bracket stage.
 *   - Returns null for eliminated players and end-of-bracket scenarios.
 * - roundNames: Maps internal round identifiers to display-friendly strings.
 */
// __tests__/lib/double-elimination.test.ts
// Test for double elimination bracket generation logic
import { describe, it, expect } from '@jest/globals';
import {
  generateBracketStructure,
  generatePlayoffStructure,
  getNextMatchInfo,
  roundNames
} from '@/lib/double-elimination';

describe('Double Elimination Bracket Structure', () => {
  describe('generateBracketStructure', () => {
    it('should generate 17 matches for 8 players', () => {
      const matches = generateBracketStructure(8);
      expect(matches).toHaveLength(17);
    });

    it('should throw error for unsupported player counts', () => {
      expect(() => generateBracketStructure(4)).toThrow('Only 8-player and 16-player brackets are supported');
      expect(() => generateBracketStructure(0)).toThrow('Only 8-player and 16-player brackets are supported');
      expect(() => generateBracketStructure(12)).toThrow('Only 8-player and 16-player brackets are supported');
    });

    it('should generate 31 matches for 16 players', () => {
      const matches = generateBracketStructure(16);
      expect(matches).toHaveLength(31);
    });

    it('should have correct 16-player seeding in Winners R1', () => {
      const matches = generateBracketStructure(16);
      const r1 = matches.filter(m => m.round === 'winners_r1');
      expect(r1).toHaveLength(8);
      /* Seed 1 vs Seed 16 */
      expect(r1[0].player1Seed).toBe(1);
      expect(r1[0].player2Seed).toBe(16);
      /* Seed 2 vs Seed 15 (last R1 match) */
      expect(r1[7].player1Seed).toBe(2);
      expect(r1[7].player2Seed).toBe(15);
    });

    it('should have all bracket stages for 16 players', () => {
      const matches = generateBracketStructure(16);
      const rounds = new Set(matches.map(m => m.round));
      expect(rounds.has('winners_r1')).toBe(true);
      expect(rounds.has('winners_qf')).toBe(true);
      expect(rounds.has('winners_sf')).toBe(true);
      expect(rounds.has('winners_final')).toBe(true);
      expect(rounds.has('losers_r1')).toBe(true);
      expect(rounds.has('losers_r2')).toBe(true);
      expect(rounds.has('losers_r3')).toBe(true);
      expect(rounds.has('losers_r4')).toBe(true);
      expect(rounds.has('losers_sf')).toBe(true);
      expect(rounds.has('losers_final')).toBe(true);
      expect(rounds.has('grand_final')).toBe(true);
      expect(rounds.has('grand_final_reset')).toBe(true);
    });

    it('should have Grand Final as match 30 and Reset as 31 for 16 players', () => {
      const matches = generateBracketStructure(16);
      const gf = matches.find(m => m.round === 'grand_final');
      const gfr = matches.find(m => m.round === 'grand_final_reset');
      expect(gf?.matchNumber).toBe(30);
      expect(gfr?.matchNumber).toBe(31);
    });

    it('should create correct Winners Bracket Round 1 (Quarter Finals) structure', () => {
      const matches = generateBracketStructure(8);
      const quarterFinals = matches.filter(m => m.round === 'winners_qf');

      expect(quarterFinals).toHaveLength(4);

      // Verify seeding pairs: 1v8, 4v5, 2v7, 3v6
      expect(quarterFinals[0].player1Seed).toBe(1);
      expect(quarterFinals[0].player2Seed).toBe(8);
      expect(quarterFinals[1].player1Seed).toBe(4);
      expect(quarterFinals[1].player2Seed).toBe(5);
      expect(quarterFinals[2].player1Seed).toBe(2);
      expect(quarterFinals[2].player2Seed).toBe(7);
      expect(quarterFinals[3].player1Seed).toBe(3);
      expect(quarterFinals[3].player2Seed).toBe(6);
    });

    it('should set correct winnerGoesTo and loserGoesTo for Winners QF', () => {
      const matches = generateBracketStructure(8);
      const qfMatch1 = matches.find(m => m.matchNumber === 1);
      const qfMatch2 = matches.find(m => m.matchNumber === 2);
      const qfMatch3 = matches.find(m => m.matchNumber === 3);
      const qfMatch4 = matches.find(m => m.matchNumber === 4);

      expect(qfMatch1?.winnerGoesTo).toBe(5);
      expect(qfMatch1?.loserGoesTo).toBe(8);
      expect(qfMatch2?.winnerGoesTo).toBe(5);
      expect(qfMatch2?.loserGoesTo).toBe(8);
      expect(qfMatch3?.winnerGoesTo).toBe(6);
      expect(qfMatch3?.loserGoesTo).toBe(9);
      expect(qfMatch4?.winnerGoesTo).toBe(6);
      expect(qfMatch4?.loserGoesTo).toBe(9);
    });

    it('should create correct Winners Bracket Semi Finals structure', () => {
      const matches = generateBracketStructure(8);
      const semiFinals = matches.filter(m => m.round === 'winners_sf');

      expect(semiFinals).toHaveLength(2);
      expect(semiFinals[0].matchNumber).toBe(5);
      expect(semiFinals[1].matchNumber).toBe(6);
      expect(semiFinals[0].winnerGoesTo).toBe(7);
      expect(semiFinals[1].winnerGoesTo).toBe(7);
    });

    it('should set correct loserGoesTo for Winners SF', () => {
      const matches = generateBracketStructure(8);
      const sfMatch1 = matches.find(m => m.matchNumber === 5);
      const sfMatch2 = matches.find(m => m.matchNumber === 6);

      expect(sfMatch1?.loserGoesTo).toBe(12);
      expect(sfMatch2?.loserGoesTo).toBe(13);
    });

    it('should create correct Winners Final structure', () => {
      const matches = generateBracketStructure(8);
      const winnersFinal = matches.find(m => m.round === 'winners_final');

      expect(winnersFinal).toBeDefined();
      expect(winnersFinal?.matchNumber).toBe(7);
      expect(winnersFinal?.winnerGoesTo).toBe(16);
      expect(winnersFinal?.loserGoesTo).toBe(15);
    });

    it('should create correct Losers Bracket Round 1 structure', () => {
      const matches = generateBracketStructure(8);
      const losersR1 = matches.filter(m => m.round === 'losers_r1');

      expect(losersR1).toHaveLength(2);
      expect(losersR1[0].matchNumber).toBe(8);
      expect(losersR1[1].matchNumber).toBe(9);
      expect(losersR1[0].winnerGoesTo).toBe(10);
      expect(losersR1[1].winnerGoesTo).toBe(11);
    });

    it('should create correct Losers Bracket Round 2 structure', () => {
      const matches = generateBracketStructure(8);
      const losersR2 = matches.filter(m => m.round === 'losers_r2');

      expect(losersR2).toHaveLength(2);
      expect(losersR2[0].matchNumber).toBe(10);
      expect(losersR2[1].matchNumber).toBe(11);
      expect(losersR2[0].winnerGoesTo).toBe(12);
      expect(losersR2[1].winnerGoesTo).toBe(13);
    });

    it('should create correct Losers Bracket Round 3 structure', () => {
      const matches = generateBracketStructure(8);
      const losersR3 = matches.filter(m => m.round === 'losers_r3');

      expect(losersR3).toHaveLength(2);
      expect(losersR3[0].matchNumber).toBe(12);
      expect(losersR3[1].matchNumber).toBe(13);
      expect(losersR3[0].winnerGoesTo).toBe(14);
      expect(losersR3[1].winnerGoesTo).toBe(14);
    });

    it('should create correct Losers Semi Final structure', () => {
      const matches = generateBracketStructure(8);
      const losersSF = matches.find(m => m.round === 'losers_sf');

      expect(losersSF).toBeDefined();
      expect(losersSF?.matchNumber).toBe(14);
      expect(losersSF?.winnerGoesTo).toBe(15);
    });

    it('should create correct Losers Final structure', () => {
      const matches = generateBracketStructure(8);
      const losersFinal = matches.find(m => m.round === 'losers_final');

      expect(losersFinal).toBeDefined();
      expect(losersFinal?.matchNumber).toBe(15);
      expect(losersFinal?.winnerGoesTo).toBe(16);
    });

    it('should create correct Grand Final structure', () => {
      const matches = generateBracketStructure(8);
      const grandFinal = matches.find(m => m.round === 'grand_final');

      expect(grandFinal).toBeDefined();
      expect(grandFinal?.matchNumber).toBe(16);
      // Grand Final uses special-case reset logic (not winnerGoesTo) so no routing target is set
      expect(grandFinal?.winnerGoesTo).toBeUndefined();
    });

    it('should create Grand Final Reset match', () => {
      const matches = generateBracketStructure(8);
      const grandFinalReset = matches.find(m => m.round === 'grand_final_reset');

      expect(grandFinalReset).toBeDefined();
      expect(grandFinalReset?.matchNumber).toBe(17);
    });

    it('should have correct bracket types for all matches', () => {
      const matches = generateBracketStructure(8);
      const winnersMatches = matches.filter(m => m.bracket === 'winners');
      const losersMatches = matches.filter(m => m.bracket === 'losers');
      const grandFinalMatches = matches.filter(m => m.bracket === 'grand_final');

      expect(winnersMatches).toHaveLength(7); // 4 QF + 2 SF + 1 Final
      expect(losersMatches).toHaveLength(8); // 2 R1 + 2 R2 + 2 R3 + 1 SF + 1 Final = 8
      expect(grandFinalMatches).toHaveLength(2); // GF + GF Reset
    });

    it('should have correct positions for all matches', () => {
      const matches = generateBracketStructure(8);

      // Winners QF should have positions 1 and 2
      const qfMatches = matches.filter(m => m.round === 'winners_qf');
      expect(qfMatches[0].position).toBe(1);
      expect(qfMatches[1].position).toBe(2);
      expect(qfMatches[2].position).toBe(1);
      expect(qfMatches[3].position).toBe(2);

      // Winners SF should have positions 1 and 2
      const sfMatches = matches.filter(m => m.round === 'winners_sf');
      expect(sfMatches[0].position).toBe(1);
      expect(sfMatches[1].position).toBe(2);

      // Winners Final should have position 1
      const winnersFinal = matches.find(m => m.round === 'winners_final');
      expect(winnersFinal?.position).toBe(1);
    });
  });

  describe('getNextMatchInfo', () => {
    let matches: ReturnType<typeof generateBracketStructure>;

    beforeEach(() => {
      matches = generateBracketStructure(8);
    });

    it('should return null for non-existent match', () => {
      const result = getNextMatchInfo(matches, 999, true);
      expect(result).toBeNull();
    });

    it('should return next match for winner of Winners QF match 1', () => {
      const result = getNextMatchInfo(matches, 1, true);
      expect(result).toEqual({
        nextMatchNumber: 5,
        position: 1
      });
    });

    it('should return next match for winner of Winners QF match 2', () => {
      const result = getNextMatchInfo(matches, 2, true);
      expect(result).toEqual({
        nextMatchNumber: 5,
        position: 2
      });
    });

    it('should return next match for winner of Winners SF', () => {
      const result = getNextMatchInfo(matches, 5, true);
      expect(result).toEqual({
        nextMatchNumber: 7,
        position: 1
      });
    });

    it('should return next match for winner of Winners Final', () => {
      const result = getNextMatchInfo(matches, 7, true);
      expect(result).toEqual({
        nextMatchNumber: 16,
        position: 1
      });
    });

    it('should return next match for winner of Losers Final', () => {
      const result = getNextMatchInfo(matches, 15, true);
      expect(result).toEqual({
        nextMatchNumber: 16,
        position: 2
      });
    });

    it('should return correct position for loser of Winners QF match 1', () => {
      const result = getNextMatchInfo(matches, 1, false);
      expect(result).toEqual({
        nextMatchNumber: 8,
        position: 1
      });
    });

    it('should return correct position for loser of Winners QF match 2', () => {
      const result = getNextMatchInfo(matches, 2, false);
      expect(result).toEqual({
        nextMatchNumber: 8,
        position: 2
      });
    });

    it('should return correct position for loser of Winners QF match 3', () => {
      const result = getNextMatchInfo(matches, 3, false);
      expect(result).toEqual({
        nextMatchNumber: 9,
        position: 1
      });
    });

    it('should return correct position for loser of Winners QF match 4', () => {
      const result = getNextMatchInfo(matches, 4, false);
      expect(result).toEqual({
        nextMatchNumber: 9,
        position: 2
      });
    });

    it('should return next match for loser of Winners SF match 5', () => {
      const result = getNextMatchInfo(matches, 5, false);
      expect(result).toEqual({
        nextMatchNumber: 12,
        position: 1
      });
    });

    it('should return next match for loser of Winners SF match 6', () => {
      const result = getNextMatchInfo(matches, 6, false);
      expect(result).toEqual({
        nextMatchNumber: 13,
        position: 1
      });
    });

    it('should return next match for loser of Winners Final', () => {
      const result = getNextMatchInfo(matches, 7, false);
      expect(result).toEqual({
        nextMatchNumber: 15,
        position: 2
      });
    });

    it('should return null for loser of Losers matches without loserGoesTo', () => {
      const result = getNextMatchInfo(matches, 9, false);
      expect(result).toBeNull();
    });

    it('should return null for winner of Grand Final Reset (end of bracket)', () => {
      const result = getNextMatchInfo(matches, 17, true);
      expect(result).toBeNull();
    });

    it('should return null for winner of Grand Final (no automatic routing; reset handled separately)', () => {
      // Grand Final advancement uses special-case logic (round: 'grand_final_reset' lookup),
      // not the generic winnerGoesTo mechanism. So getNextMatchInfo returns null.
      const result = getNextMatchInfo(matches, 16, true);
      expect(result).toBeNull();
    });
  });

  /**
   * Pre-Bracket Playoff (a.k.a. "barrage") — Top 24 → Top 16.
   *
   * Resolves issue #454. 12 entrants from qualification positions 13-24
   * compete in a single-elimination tournament whose 4 winners fill
   * Upper-Bracket seeds 13-16. Top 4 playoff seeds receive a Round 1 BYE.
   */
  describe('generatePlayoffStructure', () => {
    it('should generate 8 matches for 12 entrants (4 R1 + 4 R2, top 4 BYE)', () => {
      const matches = generatePlayoffStructure(12);
      expect(matches).toHaveLength(8);
    });

    it('should throw for unsupported entrant counts', () => {
      expect(() => generatePlayoffStructure(0)).toThrow();
      expect(() => generatePlayoffStructure(8)).toThrow();
      expect(() => generatePlayoffStructure(16)).toThrow();
    });

    it('should split matches into playoff_r1 (4) and playoff_r2 (4)', () => {
      const matches = generatePlayoffStructure(12);
      const r1 = matches.filter(m => m.round === 'playoff_r1');
      const r2 = matches.filter(m => m.round === 'playoff_r2');
      expect(r1).toHaveLength(4);
      expect(r2).toHaveLength(4);
    });

    it('should pair cross-group seeds in R1 (A12vB11, A10vB9, A9vB10, A11vB12)', () => {
      /* Cross-group pairing for 2-group qualification.
       * barrage[] = [A7,B7,A8,B8,A9,B9,A10,B10,A11,B11,A12,B12]
       *             seed 1, 2, 3, 4, 5, 6,  7,  8,  9, 10, 11, 12 */
      const matches = generatePlayoffStructure(12);
      const r1 = matches.filter(m => m.round === 'playoff_r1');
      const pairings = r1.map(m => [m.player1Seed, m.player2Seed]);
      expect(pairings).toEqual([
        [11, 10], // A12 vs B11
        [7, 6],   // A10 vs B9
        [5, 8],   // A9 vs B10
        [9, 12],  // A11 vs B12
      ]);
    });

    it('should set the BYE seeds (1-4) as player1 on R2 matches', () => {
      const matches = generatePlayoffStructure(12);
      const r2 = matches.filter(m => m.round === 'playoff_r2');
      /* R2 match order mirrors R1 feeder order.
       * R2 M5: seed 1 (A7)  vs R1 M1 (A12 vs B11) winner
       * R2 M6: seed 4 (B8)  vs R1 M2 (A10 vs B9) winner
       * R2 M7: seed 3 (A8)  vs R1 M3 (A9 vs B10) winner
       * R2 M8: seed 2 (B7)  vs R1 M4 (A11 vs B12) winner */
      expect(r2[0].player1Seed).toBe(1); // A7
      expect(r2[1].player1Seed).toBe(4); // B8
      expect(r2[2].player1Seed).toBe(3); // A8
      expect(r2[3].player1Seed).toBe(2); // B7
      /* player2 on each R2 match is filled by an R1 winner, not a direct seed. */
      r2.forEach(m => expect(m.player2Seed).toBeUndefined());
    });

    it('should route R1 winners to their corresponding R2 match at position 2', () => {
      const matches = generatePlayoffStructure(12);
      const r1 = matches.filter(m => m.round === 'playoff_r1');
      /* R1 matches 1-4 → R2 matches 5-8 respectively */
      expect(r1[0].winnerGoesTo).toBe(5);
      expect(r1[1].winnerGoesTo).toBe(6);
      expect(r1[2].winnerGoesTo).toBe(7);
      expect(r1[3].winnerGoesTo).toBe(8);
      r1.forEach(m => expect(m.position).toBe(2));
    });

    it('should eliminate R1 losers (no loserGoesTo)', () => {
      const matches = generatePlayoffStructure(12);
      const r1 = matches.filter(m => m.round === 'playoff_r1');
      /* Single-elimination: one loss eliminates. No drop-down destination. */
      r1.forEach(m => expect(m.loserGoesTo).toBeUndefined());
    });

    it('should assign Upper-Bracket seeds 13-16 to R2 winners symmetrically', () => {
      /* Each playoff-R2 winner fills a specific Upper-Bracket seed so the
       * strongest playoff survivor (facing the lowest BYE seed) enters
       * opposite #1 in the Upper Bracket — mirroring standard bracket balance.
       *
       * Upper R1 pairings are [1,16], [8,9], [5,12], [4,13], [3,14], [6,11], [7,10], [2,15].
       * We assign upper seeds 13-16 to playoff R2 match winners so that:
       *   - Playoff R2 M5 (featuring playoff seed 1) winner → Upper seed 16 (plays Upper #1)
       *   - Playoff R2 M6 (featuring playoff seed 4) winner → Upper seed 13 (plays Upper #4)
       *   - Playoff R2 M7 (featuring playoff seed 3) winner → Upper seed 14 (plays Upper #3)
       *   - Playoff R2 M8 (featuring playoff seed 2) winner → Upper seed 15 (plays Upper #2)
       */
      const matches = generatePlayoffStructure(12);
      const r2 = matches.filter(m => m.round === 'playoff_r2');
      expect(r2[0].advancesToUpperSeed).toBe(16);
      expect(r2[1].advancesToUpperSeed).toBe(13);
      expect(r2[2].advancesToUpperSeed).toBe(14);
      expect(r2[3].advancesToUpperSeed).toBe(15);
    });

    it('should not route R2 winners via winnerGoesTo (handled at upper-bracket level)', () => {
      const matches = generatePlayoffStructure(12);
      const r2 = matches.filter(m => m.round === 'playoff_r2');
      /* R2 is the terminal round for the playoff stage. Cross-stage routing to
       * the Upper Bracket uses advancesToUpperSeed, not winnerGoesTo. */
      r2.forEach(m => {
        expect(m.winnerGoesTo).toBeUndefined();
        expect(m.loserGoesTo).toBeUndefined();
      });
    });

    it('should number matches 1-8 sequentially', () => {
      const matches = generatePlayoffStructure(12);
      expect(matches.map(m => m.matchNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  describe('getNextMatchInfo with playoff bracket', () => {
    it('should route playoff R1 winner to R2 at position 2', () => {
      const matches = generatePlayoffStructure(12);
      const result = getNextMatchInfo(matches, 1, true);
      expect(result).toEqual({ nextMatchNumber: 5, position: 2 });
    });

    it('should return null for playoff R1 loser (eliminated)', () => {
      const matches = generatePlayoffStructure(12);
      expect(getNextMatchInfo(matches, 1, false)).toBeNull();
    });

    it('should return null for playoff R2 winner (cross-stage advancement handled elsewhere)', () => {
      const matches = generatePlayoffStructure(12);
      expect(getNextMatchInfo(matches, 5, true)).toBeNull();
    });
  });

  describe('roundNames', () => {
    it('should include playoff round names', () => {
      expect(roundNames.playoff_r1).toBeDefined();
      expect(roundNames.playoff_r2).toBeDefined();
    });

    it('should export correct round display names', () => {
      expect(roundNames.winners_qf).toBe('Winners Quarter Final');
      expect(roundNames.winners_sf).toBe('Winners Semi Final');
      expect(roundNames.winners_final).toBe('Winners Final');
      expect(roundNames.losers_r1).toBe('Losers Round 1');
      expect(roundNames.losers_r2).toBe('Losers Round 2');
      expect(roundNames.losers_r3).toBe('Losers Round 3');
      expect(roundNames.losers_sf).toBe('Losers Semi Final');
      expect(roundNames.losers_final).toBe('Losers Final');
      expect(roundNames.grand_final).toBe('Grand Final');
      expect(roundNames.grand_final_reset).toBe('Grand Final Reset');
    });

    it('should have all round keys defined', () => {
      const expectedRounds = [
        'winners_qf',
        'winners_sf',
        'winners_final',
        'losers_r1',
        'losers_r2',
        'losers_r3',
        'losers_sf',
        'losers_final',
        'grand_final',
        'grand_final_reset'
      ];

      expectedRounds.forEach(round => {
        expect(roundNames[round]).toBeDefined();
        expect(typeof roundNames[round]).toBe('string');
      });
    });
  });
});

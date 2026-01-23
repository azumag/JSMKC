// __tests__/lib/double-elimination.test.ts
// Test for double elimination bracket generation logic
import { describe, it, expect } from '@jest/globals';
import {
  generateBracketStructure,
  getNextMatchInfo,
  roundNames
} from '@/lib/double-elimination';

describe('Double Elimination Bracket Structure', () => {
  describe('generateBracketStructure', () => {
    it('should generate 17 matches for 8 players', () => {
      const matches = generateBracketStructure(8);
      expect(matches).toHaveLength(17);
    });

    it('should throw error for player count not equal to 8', () => {
      expect(() => generateBracketStructure(4)).toThrow('Currently only 8-player brackets are supported');
      expect(() => generateBracketStructure(16)).toThrow('Currently only 8-player brackets are supported');
      expect(() => generateBracketStructure(0)).toThrow('Currently only 8-player brackets are supported');
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
      expect(qfMatch1?.loserGoesTo).toBe(9);
      expect(qfMatch2?.winnerGoesTo).toBe(5);
      expect(qfMatch2?.loserGoesTo).toBe(9);
      expect(qfMatch3?.winnerGoesTo).toBe(6);
      expect(qfMatch3?.loserGoesTo).toBe(10);
      expect(qfMatch4?.winnerGoesTo).toBe(6);
      expect(qfMatch4?.loserGoesTo).toBe(10);
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
      
      expect(sfMatch1?.loserGoesTo).toBe(13);
      expect(sfMatch2?.loserGoesTo).toBe(14);
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
      expect(losersR1[0].winnerGoesTo).toBe(11);
      expect(losersR1[1].winnerGoesTo).toBe(12);
    });

    it('should create correct Losers Bracket Round 2 structure', () => {
      const matches = generateBracketStructure(8);
      const losersR2 = matches.filter(m => m.round === 'losers_r2');
      
      expect(losersR2).toHaveLength(2);
      expect(losersR2[0].matchNumber).toBe(10);
      expect(losersR2[1].matchNumber).toBe(11);
      expect(losersR2[0].winnerGoesTo).toBe(13);
      expect(losersR2[1].winnerGoesTo).toBe(14);
    });

    it('should create correct Losers Bracket Round 3 structure', () => {
      const matches = generateBracketStructure(8);
      const losersR3 = matches.filter(m => m.round === 'losers_r3');
      
      expect(losersR3).toHaveLength(2);
      expect(losersR3[0].matchNumber).toBe(12);
      expect(losersR3[1].matchNumber).toBe(13);
      expect(losersR3[0].winnerGoesTo).toBe(15);
      expect(losersR3[1].winnerGoesTo).toBe(15);
    });

    it('should create correct Losers Semi Final structure', () => {
      const matches = generateBracketStructure(8);
      const losersSF = matches.find(m => m.round === 'losers_sf');
      
      expect(losersSF).toBeDefined();
      expect(losersSF?.matchNumber).toBe(14);
      expect(losersSF?.winnerGoesTo).toBe(16);
    });

    it('should create correct Losers Final structure', () => {
      const matches = generateBracketStructure(8);
      const losersFinal = matches.find(m => m.round === 'losers_final');
      
      expect(losersFinal).toBeDefined();
      expect(losersFinal?.matchNumber).toBe(15);
      expect(losersFinal?.winnerGoesTo).toBe(17);
    });

    it('should create correct Grand Final structure', () => {
      const matches = generateBracketStructure(8);
      const grandFinal = matches.find(m => m.round === 'grand_final');
      
      expect(grandFinal).toBeDefined();
      expect(grandFinal?.matchNumber).toBe(16);
      expect(grandFinal?.winnerGoesTo).toBe(18);
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
        nextMatchNumber: 17,
        position: 2
      });
    });

    it('should return correct position for loser of Winners QF match 1', () => {
      const result = getNextMatchInfo(matches, 1, false);
      expect(result).toEqual({
        nextMatchNumber: 9,
        position: 1
      });
    });

    it('should return correct position for loser of Winners QF match 2', () => {
      const result = getNextMatchInfo(matches, 2, false);
      expect(result).toEqual({
        nextMatchNumber: 9,
        position: 2
      });
    });

    it('should return correct position for loser of Winners QF match 3', () => {
      const result = getNextMatchInfo(matches, 3, false);
      expect(result).toEqual({
        nextMatchNumber: 10,
        position: 1
      });
    });

    it('should return correct position for loser of Winners QF match 4', () => {
      const result = getNextMatchInfo(matches, 4, false);
      expect(result).toEqual({
        nextMatchNumber: 10,
        position: 2
      });
    });

    it('should return next match for loser of Winners SF match 5', () => {
      const result = getNextMatchInfo(matches, 5, false);
      expect(result).toEqual({
        nextMatchNumber: 13,
        position: 1
      });
    });

    it('should return next match for loser of Winners SF match 6', () => {
      const result = getNextMatchInfo(matches, 6, false);
      expect(result).toEqual({
        nextMatchNumber: 14,
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

    it('should handle matches with default position when position is undefined', () => {
      const result = getNextMatchInfo(matches, 16, true);
      expect(result).toEqual({
        nextMatchNumber: 18,
        position: 1
      });
    });
  });

  describe('roundNames', () => {
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

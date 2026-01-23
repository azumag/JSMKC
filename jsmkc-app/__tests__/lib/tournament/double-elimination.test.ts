import { generateDoubleEliminationBracket, calculateMatchProgression, type MatchNode, type BracketPlayer } from '@/lib/tournament/double-elimination';

describe('Double Elimination Bracket Functions', () => {
  describe('generateDoubleEliminationBracket', () => {
    it('should throw error when fewer than 2 players', () => {
      const players: BracketPlayer[] = [{ playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 }];
      expect(() => generateDoubleEliminationBracket(players, 'BM')).toThrow('Need at least 2 players for bracket');
    });

    it('should generate bracket for even number of players', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
        { playerId: 'player-3', playerName: 'Player3', qualifyingRank: 3, losses: 0 },
        { playerId: 'player-4', playerName: 'Player4', qualifyingRank: 4, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      expect(bracket.winnerBracket).toHaveLength(2);
      expect(bracket.loserBracket).toHaveLength(0);
      expect(bracket.grandFinal).toBeUndefined();
    });

    it('should generate bracket for odd number of players', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
        { playerId: 'player-3', playerName: 'Player3', qualifyingRank: 3, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      expect(bracket.winnerBracket).toHaveLength(1);
      expect(bracket.loserBracket).toHaveLength(0);
      expect(bracket.grandFinal).toBeUndefined();
    });

    it('should generate bracket for power of 2 players', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
        { playerId: 'player-3', playerName: 'Player3', qualifyingRank: 3, losses: 0 },
        { playerId: 'player-4', playerName: 'Player4', qualifyingRank: 4, losses: 0 },
        { playerId: 'player-5', playerName: 'Player5', qualifyingRank: 5, losses: 0 },
        { playerId: 'player-6', playerName: 'Player6', qualifyingRank: 6, losses: 0 },
        { playerId: 'player-7', playerName: 'Player7', qualifyingRank: 7, losses: 0 },
        { playerId: 'player-8', playerName: 'Player8', qualifyingRank: 8, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      expect(bracket.winnerBracket).toHaveLength(4);
      expect(bracket.loserBracket).toHaveLength(0);
      expect(bracket.grandFinal).toBeUndefined();
    });

    it('should generate bracket for non-power of 2 players', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
        { playerId: 'player-3', playerName: 'Player3', qualifyingRank: 3, losses: 0 },
        { playerId: 'player-4', playerName: 'Player4', qualifyingRank: 4, losses: 0 },
        { playerId: 'player-5', playerName: 'Player5', qualifyingRank: 5, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      expect(bracket.winnerBracket).toHaveLength(2);
      expect(bracket.loserBracket).toHaveLength(0);
      expect(bracket.grandFinal).toBeUndefined();
    });

    it('should use player qualifying ranks for seeding', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-3', playerName: 'Player3', qualifyingRank: 3, losses: 0 },
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-4', playerName: 'Player4', qualifyingRank: 4, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      expect(bracket.winnerBracket[0].player1Id).toBe('player-1');
      expect(bracket.winnerBracket[0].player2Id).toBe('player-2');
      expect(bracket.winnerBracket[1].player1Id).toBe('player-3');
      expect(bracket.winnerBracket[1].player2Id).toBe('player-4');
    });

    it('should generate unique IDs for each match', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      const allIds = bracket.winnerBracket.map(m => m.id);

      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('should set correct bracket positions', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
        { playerId: 'player-3', playerName: 'Player3', qualifyingRank: 3, losses: 0 },
        { playerId: 'player-4', playerName: 'Player4', qualifyingRank: 4, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      expect(bracket.winnerBracket[0].bracketPosition).toBe('wb-r1');
      expect(bracket.winnerBracket[1].bracketPosition).toBe('wb-r2');
    });

    it('should set correct round names', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
        { playerId: 'player-3', playerName: 'Player3', qualifyingRank: 3, losses: 0 },
        { playerId: 'player-4', playerName: 'Player4', qualifyingRank: 4, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      expect(bracket.winnerBracket[0].round).toBe('wb-r1');
      expect(bracket.winnerBracket[1].round).toBe('wb-r2');
    });

    it('should set correct bracket type', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
        { playerId: 'player-3', playerName: 'Player3', qualifyingRank: 3, losses: 0 },
        { playerId: 'player-4', playerName: 'Player4', qualifyingRank: 4, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      bracket.winnerBracket.forEach(match => {
        expect(match.bracket).toBe('winners');
      });
    });

    it('should set correct wins for each match', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
        { playerId: 'player-3', playerName: 'Player3', qualifyingRank: 3, losses: 0 },
        { playerId: 'player-4', playerName: 'Player4', qualifyingRank: 4, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      bracket.winnerBracket.forEach(match => {
        expect(match.player1Wins).toBe(0);
        expect(match.player2Wins).toBe(0);
      });
    });

    it('should handle BM match type correctly', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      expect(bracket).toBeDefined();
      expect(bracket.winnerBracket).toHaveLength(1);
      expect(bracket.grandFinal).toBeUndefined();
    });

    it('should handle MR match type correctly', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'MR');

      expect(bracket).toBeDefined();
      expect(bracket.winnerBracket).toHaveLength(1);
      expect(bracket.grandFinal).toBeUndefined();
    });

    it('should handle large player counts', () => {
      const players: BracketPlayer[] = Array.from({ length: 32 }, (_, i) => ({
        playerId: `player-${i + 1}`,
        playerName: `Player${i + 1}`,
        qualifyingRank: i + 1,
        losses: 0,
      }));

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      expect(bracket.winnerBracket).toHaveLength(16);
      expect(bracket.loserBracket).toHaveLength(0);
      expect(bracket.grandFinal).toBeUndefined();
    });

    it('should handle 2 players correctly', () => {
      const players: BracketPlayer[] = [
        { playerId: 'player-1', playerName: 'Player1', qualifyingRank: 1, losses: 0 },
        { playerId: 'player-2', playerName: 'Player2', qualifyingRank: 2, losses: 0 },
      ];

      const bracket = generateDoubleEliminationBracket(players, 'BM');

      expect(bracket.winnerBracket).toHaveLength(1);
      expect(bracket.loserBracket).toHaveLength(0);
      expect(bracket.grandFinal).toBeUndefined();
    });
  });

  describe('calculateMatchProgression', () => {
    it('should return ongoing for regular match when neither player has 5 wins', () => {
      const match: MatchNode = {
        id: 'match-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 2,
        player2Wins: 1,
        bracket: 'winners',
        bracketPosition: 'wb-r1',
        round: 'wb-r1',
        isGrandFinal: false,
      };

      const result = calculateMatchProgression(match, 2, 1);

      expect(result).toBe('ongoing');
    });

    it('should return complete for regular match when player1 reaches 5 wins', () => {
      const match: MatchNode = {
        id: 'match-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 5,
        player2Wins: 2,
        bracket: 'winners',
        bracketPosition: 'wb-r1',
        round: 'wb-r1',
        isGrandFinal: false,
      };

      const result = calculateMatchProgression(match, 5, 2);

      expect(result).toBe('complete');
    });

    it('should return complete for regular match when player2 reaches 5 wins', () => {
      const match: MatchNode = {
        id: 'match-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 3,
        player2Wins: 5,
        bracket: 'winners',
        bracketPosition: 'wb-r1',
        round: 'wb-r1',
        isGrandFinal: false,
      };

      const result = calculateMatchProgression(match, 3, 5);

      expect(result).toBe('complete');
    });

    it('should return complete for regular match when player1 reaches target wins first', () => {
      const match: MatchNode = {
        id: 'match-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 5,
        player2Wins: 4,
        bracket: 'winners',
        bracketPosition: 'wb-r1',
        round: 'wb-r1',
        isGrandFinal: false,
      };

      const result = calculateMatchProgression(match, 5, 4);

      expect(result).toBe('complete');
    });

    it('should return ongoing for grand final when neither player has 5 wins', () => {
      const match: MatchNode = {
        id: 'gf-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 3,
        player2Wins: 2,
        bracket: 'grand_final',
        bracketPosition: 'gf',
        round: 'gf',
        isGrandFinal: true,
      };

      const result = calculateMatchProgression(match, 3, 2);

      expect(result).toBe('ongoing');
    });

    it('should return complete for grand final when player1 reaches 5 wins', () => {
      const match: MatchNode = {
        id: 'gf-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 5,
        player2Wins: 3,
        bracket: 'grand_final',
        bracketPosition: 'gf',
        round: 'gf',
        isGrandFinal: true,
      };

      const result = calculateMatchProgression(match, 5, 3);

      expect(result).toBe('complete');
    });

    it('should return complete for grand final when player2 reaches 5 wins', () => {
      const match: MatchNode = {
        id: 'gf-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 3,
        player2Wins: 5,
        bracket: 'grand_final',
        bracketPosition: 'gf',
        round: 'gf',
        isGrandFinal: true,
      };

      const result = calculateMatchProgression(match, 3, 5);

      expect(result).toBe('complete');
    });

    it('should return complete for grand final when player1 reaches 5 wins first', () => {
      const match: MatchNode = {
        id: 'gf-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 5,
        player2Wins: 4,
        bracket: 'grand_final',
        bracketPosition: 'gf',
        round: 'gf',
        isGrandFinal: true,
      };

      const result = calculateMatchProgression(match, 5, 4);

      expect(result).toBe('complete');
    });

    it('should return ongoing for grand final when player1 has 4 wins and player2 has 4 wins', () => {
      const match: MatchNode = {
        id: 'gf-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 4,
        player2Wins: 4,
        bracket: 'grand_final',
        bracketPosition: 'gf',
        round: 'gf',
        isGrandFinal: true,
      };

      const result = calculateMatchProgression(match, 4, 4);

      expect(result).toBe('ongoing');
    });

    it('should return complete for regular match when player1 has 6 wins', () => {
      const match: MatchNode = {
        id: 'match-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 6,
        player2Wins: 2,
        bracket: 'winners',
        bracketPosition: 'wb-r1',
        round: 'wb-r1',
        isGrandFinal: false,
      };

      const result = calculateMatchProgression(match, 5, 2);

      expect(result).toBe('complete');
    });

    it('should return complete for regular match when player2 has 6 wins', () => {
      const match: MatchNode = {
        id: 'match-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 2,
        player2Wins: 6,
        bracket: 'winners',
        bracketPosition: 'wb-r1',
        round: 'wb-r1',
        isGrandFinal: false,
      };

      const result = calculateMatchProgression(match, 2, 5);

      expect(result).toBe('complete');
    });

    it('should return ongoing for match with null player IDs', () => {
      const match: MatchNode = {
        id: 'match-1',
        player1Id: null,
        player2Id: null,
        player1Wins: 2,
        player2Wins: 1,
        bracket: 'winners',
        bracketPosition: 'wb-r1',
        round: 'wb-r1',
        isGrandFinal: false,
      };

      const result = calculateMatchProgression(match, 2, 1);

      expect(result).toBe('ongoing');
    });

    it('should return ongoing for match with one null player ID', () => {
      const match: MatchNode = {
        id: 'match-1',
        player1Id: 'player-1',
        player2Id: null,
        player1Wins: 2,
        player2Wins: 1,
        bracket: 'winners',
        bracketPosition: 'wb-r1',
        round: 'wb-r1',
        isGrandFinal: false,
      };

      const result = calculateMatchProgression(match, 2, 1);

      expect(result).toBe('ongoing');
    });

    it('should return complete for grand final when both players have 5 wins', () => {
      const match: MatchNode = {
        id: 'gf-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 5,
        player2Wins: 5,
        bracket: 'grand_final',
        bracketPosition: 'gf',
        round: 'gf',
        isGrandFinal: true,
      };

      const result = calculateMatchProgression(match, 5, 5);

      expect(result).toBe('complete');
    });

    it('should return ongoing for regular match when both players have 4 wins', () => {
      const match: MatchNode = {
        id: 'match-1',
        player1Id: 'player-1',
        player2Id: 'player-2',
        player1Wins: 4,
        player2Wins: 4,
        bracket: 'winners',
        bracketPosition: 'wb-r1',
        round: 'wb-r1',
        isGrandFinal: false,
      };

      const result = calculateMatchProgression(match, 4, 4);

      expect(result).toBe('ongoing');
    });
  });
});

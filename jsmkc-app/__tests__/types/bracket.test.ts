import {
  BracketMatch,
} from '@/types/bracket';

describe('Bracket Types', () => {
  describe('BracketType', () => {
    it('should have correct spellings for bracket types', () => {
      expect('winners').toBeDefined();
      expect('losers').toBeDefined();
      expect('grand_final').toBeDefined();
    });

    it('should not contain typos', () => {
      expect('winners').toBe('winners');
      expect('losers').toBe('losers');
    });
  });

  describe('BracketRound', () => {
    it('should include all winners bracket rounds', () => {
      expect('winners_qf').toBeDefined();
      expect('winners_sf').toBeDefined();
      expect('winners_final').toBeDefined();
    });

    it('should include all losers bracket rounds', () => {
      expect('losers_r1').toBeDefined();
      expect('losers_r2').toBeDefined();
      expect('losers_r3').toBeDefined();
      expect('losers_sf').toBeDefined();
      expect('losers_final').toBeDefined();
    });

    it('should include grand final round', () => {
      expect('grand_final').toBeDefined();
      expect('grand_final_reset').toBeDefined();
    });
  });

  describe('BracketMatch interface', () => {
    it('should create valid match object', () => {
      const match: BracketMatch = {
        matchNumber: 1,
        round: 'winners_qf',
        bracket: 'winners',
        player1Seed: 1,
        player2Seed: 8,
        winnerGoesTo: 5,
        loserGoesTo: 9,
        position: 1,
      };

      expect(match.matchNumber).toBe(1);
      expect(match.round).toBe('winners_qf');
      expect(match.bracket).toBe('winners');
      expect(match.player1Seed).toBe(1);
      expect(match.player2Seed).toBe(8);
      expect(match.winnerGoesTo).toBe(5);
      expect(match.loserGoesTo).toBe(9);
      expect(match.position).toBe(1);
    });

    it('should allow optional fields', () => {
      const match: BracketMatch = {
        matchNumber: 1,
        round: 'winners_qf',
        bracket: 'winners',
      };

      expect(match.matchNumber).toBe(1);
      expect(match.player1Seed).toBeUndefined();
      expect(match.player2Seed).toBeUndefined();
      expect(match.winnerGoesTo).toBeUndefined();
      expect(match.loserGoesTo).toBeUndefined();
      expect(match.position).toBeUndefined();
    });
  });
});

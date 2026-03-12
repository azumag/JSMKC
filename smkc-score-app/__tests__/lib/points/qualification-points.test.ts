/**
 * Unit tests for BM/MR/GP Qualification Points Calculation
 *
 * Tests the match points formula: 2×wins + 1×ties + 0×losses
 * And normalization: normalizedPoints = 1000 * matchPoints / maxMatchPoints
 */

import {
  calculateMatchPoints,
  calculateMaxMatchPoints,
  normalizePoints,
  calculateQualificationPoints,
  aggregateGroupQualificationPoints,
} from "@/lib/points/qualification-points";

describe("BM/MR/GP Qualification Points", () => {
  describe("calculateMatchPoints", () => {
    it("should calculate match points correctly", () => {
      // 2 per win, 1 per tie, 0 per loss
      expect(calculateMatchPoints(7, 0, 0)).toBe(14); // 7 wins
      expect(calculateMatchPoints(4, 2, 1)).toBe(10); // 4W + 2T + 1L
      expect(calculateMatchPoints(0, 7, 0)).toBe(7);  // 7 ties
      expect(calculateMatchPoints(0, 0, 7)).toBe(0);  // 7 losses
    });

    it("should handle all wins", () => {
      expect(calculateMatchPoints(10, 0, 0)).toBe(20);
    });

    it("should handle mixed results", () => {
      // 3 wins, 2 ties, 2 losses
      expect(calculateMatchPoints(3, 2, 2)).toBe(8); // 3*2 + 2*1 = 8
    });
  });

  describe("calculateMaxMatchPoints", () => {
    it("should calculate max points for round-robin", () => {
      // Max 2 points per match (win)
      expect(calculateMaxMatchPoints(7)).toBe(14);  // 7 opponents
      expect(calculateMaxMatchPoints(10)).toBe(20); // 10 opponents
      expect(calculateMaxMatchPoints(1)).toBe(2);   // 1 opponent
    });
  });

  describe("normalizePoints", () => {
    it("should normalize to 1000 scale", () => {
      // Full wins: 14/14 = 1000
      expect(normalizePoints(14, 14)).toBe(1000);
      // Half: 7/14 = 500
      expect(normalizePoints(7, 14)).toBe(500);
      // Zero: 0/14 = 0
      expect(normalizePoints(0, 14)).toBe(0);
    });

    it("should round to nearest integer", () => {
      // 10/14 = 714.285... rounds to 714
      expect(normalizePoints(10, 14)).toBe(714);
      // 5/14 = 357.142... rounds to 357
      expect(normalizePoints(5, 14)).toBe(357);
    });

    it("should handle edge case of zero max points", () => {
      expect(normalizePoints(0, 0)).toBe(0);
      expect(normalizePoints(5, 0)).toBe(0);
    });
  });

  describe("calculateQualificationPoints", () => {
    it("should calculate points for all players in a group", () => {
      // With 3 players, each plays 2 opponents, max match points = 4
      const records = [
        { playerId: "p1", wins: 2, ties: 0, losses: 0 }, // Perfect: 4 pts / 4 max = 1000
        { playerId: "p2", wins: 1, ties: 0, losses: 1 }, // Middle: 2 pts / 4 max = 500
        { playerId: "p3", wins: 0, ties: 0, losses: 2 }, // All losses: 0 pts / 4 max = 0
      ];

      const results = calculateQualificationPoints(records);

      expect(results).toHaveLength(3);

      // p1 should be rank 1 with 1000 points
      const p1 = results.find((r) => r.playerId === "p1");
      expect(p1?.normalizedPoints).toBe(1000);
      expect(p1?.rank).toBe(1);

      // p3 should be last with 0 points
      const p3 = results.find((r) => r.playerId === "p3");
      expect(p3?.normalizedPoints).toBe(0);
      expect(p3?.rank).toBe(3);
    });

    it("should handle ties in points", () => {
      const records = [
        { playerId: "p1", wins: 3, ties: 0, losses: 1 }, // 6 points
        { playerId: "p2", wins: 2, ties: 2, losses: 0 }, // 6 points
        { playerId: "p3", wins: 1, ties: 0, losses: 3 }, // 2 points
      ];

      const results = calculateQualificationPoints(records);

      // p1 and p2 should have same rank
      const p1 = results.find((r) => r.playerId === "p1");
      const p2 = results.find((r) => r.playerId === "p2");
      expect(p1?.rank).toBe(p2?.rank);
    });

    it("should return empty array for no records", () => {
      const results = calculateQualificationPoints([]);
      expect(results).toHaveLength(0);
    });

    it("should sort by normalized points descending", () => {
      const records = [
        { playerId: "p1", wins: 2, ties: 0, losses: 5 },
        { playerId: "p2", wins: 5, ties: 0, losses: 2 },
        { playerId: "p3", wins: 3, ties: 1, losses: 3 },
      ];

      const results = calculateQualificationPoints(records);

      // Results should be sorted: p2, p3, p1
      expect(results[0].playerId).toBe("p2");
      expect(results[1].playerId).toBe("p3");
      expect(results[2].playerId).toBe("p1");
    });
  });

  describe("aggregateGroupQualificationPoints", () => {
    it("should combine multiple groups and re-rank", () => {
      const groupA = [
        { playerId: "a1", matchPoints: 14, normalizedPoints: 1000, rank: 1 },
        { playerId: "a2", matchPoints: 7, normalizedPoints: 500, rank: 2 },
      ];
      const groupB = [
        { playerId: "b1", matchPoints: 12, normalizedPoints: 857, rank: 1 },
        { playerId: "b2", matchPoints: 4, normalizedPoints: 286, rank: 2 },
      ];

      const results = aggregateGroupQualificationPoints([groupA, groupB]);

      // Should be sorted by normalized points: a1, b1, a2, b2
      expect(results).toHaveLength(4);
      expect(results[0].playerId).toBe("a1");
      expect(results[0].rank).toBe(1);
      expect(results[1].playerId).toBe("b1");
      expect(results[1].rank).toBe(2);
      expect(results[2].playerId).toBe("a2");
      expect(results[2].rank).toBe(3);
      expect(results[3].playerId).toBe("b2");
      expect(results[3].rank).toBe(4);
    });

    it("should handle ties across groups", () => {
      const groupA = [
        { playerId: "a1", matchPoints: 10, normalizedPoints: 500, rank: 1 },
      ];
      const groupB = [
        { playerId: "b1", matchPoints: 10, normalizedPoints: 500, rank: 1 },
      ];

      const results = aggregateGroupQualificationPoints([groupA, groupB]);

      // Both should have rank 1
      expect(results[0].rank).toBe(1);
      expect(results[1].rank).toBe(1);
    });
  });
});

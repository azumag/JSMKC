/**
 * Unit tests for TA Qualification Points Calculation
 *
 * Tests the linear interpolation formula:
 * points = 50 * (totalParticipants - rank) / (totalParticipants - 1)
 */

import {
  calculateCoursePoints,
  calculateCourseRankings,
  calculateTAQualificationPoints,
} from "@/lib/points/ta-qualification-points";
import { COURSES } from "@/lib/constants";

describe("TA Qualification Points", () => {
  describe("calculateCoursePoints", () => {
    it("should return 50 for rank 1 with multiple participants", () => {
      // Rank 1 always gets max points
      expect(calculateCoursePoints(1, 11)).toBe(50);
      expect(calculateCoursePoints(1, 5)).toBe(50);
      expect(calculateCoursePoints(1, 24)).toBe(50);
    });

    it("should return 0 for last rank", () => {
      // Last rank gets 0 points
      expect(calculateCoursePoints(11, 11)).toBe(0);
      expect(calculateCoursePoints(5, 5)).toBe(0);
      expect(calculateCoursePoints(24, 24)).toBe(0);
    });

    it("should return 50 for single participant", () => {
      // Edge case: only one participant gets full points
      expect(calculateCoursePoints(1, 1)).toBe(50);
    });

    it("should calculate correct points for 11 participants", () => {
      // Example from requirements: 11 participants
      // Rank:    1   2   3   4   5   6   7   8   9  10  11
      // Points: 50  45  40  35  30  25  20  15  10   5   0
      expect(calculateCoursePoints(1, 11)).toBe(50);
      expect(calculateCoursePoints(2, 11)).toBe(45);
      expect(calculateCoursePoints(3, 11)).toBe(40);
      expect(calculateCoursePoints(4, 11)).toBe(35);
      expect(calculateCoursePoints(5, 11)).toBe(30);
      expect(calculateCoursePoints(6, 11)).toBe(25);
      expect(calculateCoursePoints(7, 11)).toBe(20);
      expect(calculateCoursePoints(8, 11)).toBe(15);
      expect(calculateCoursePoints(9, 11)).toBe(10);
      expect(calculateCoursePoints(10, 11)).toBe(5);
      expect(calculateCoursePoints(11, 11)).toBe(0);
    });

    it("should truncate to integer (floor)", () => {
      // With 7 participants: rank 2 = 50 * (7-2) / (7-1) = 50 * 5/6 = 41.666...
      // Should be floored to 41
      expect(calculateCoursePoints(2, 7)).toBe(41);
    });
  });

  describe("calculateCourseRankings", () => {
    it("should rank players by time ascending", () => {
      const entries = [
        { playerId: "p1", timeMs: 90000 }, // 1:30
        { playerId: "p2", timeMs: 85000 }, // 1:25 - fastest
        { playerId: "p3", timeMs: 95000 }, // 1:35
      ];

      const results = calculateCourseRankings(entries);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ playerId: "p2", rank: 1, points: 50 });
      expect(results[1]).toEqual({ playerId: "p1", rank: 2, points: 25 });
      expect(results[2]).toEqual({ playerId: "p3", rank: 3, points: 0 });
    });

    it("should handle ties correctly (same rank, same points)", () => {
      const entries = [
        { playerId: "p1", timeMs: 90000 },
        { playerId: "p2", timeMs: 85000 }, // Tied for 1st
        { playerId: "p3", timeMs: 85000 }, // Tied for 1st
        { playerId: "p4", timeMs: 95000 },
      ];

      const results = calculateCourseRankings(entries);

      // p2 and p3 should both have rank 1
      const p2Result = results.find((r) => r.playerId === "p2");
      const p3Result = results.find((r) => r.playerId === "p3");
      expect(p2Result?.rank).toBe(1);
      expect(p3Result?.rank).toBe(1);
      expect(p2Result?.points).toBe(p3Result?.points);

      // p1 should have rank 3 (skipping rank 2)
      const p1Result = results.find((r) => r.playerId === "p1");
      expect(p1Result?.rank).toBe(3);
    });

    it("should filter out invalid times", () => {
      const entries = [
        { playerId: "p1", timeMs: 90000 },
        { playerId: "p2", timeMs: 0 }, // Invalid
        { playerId: "p3", timeMs: -1 }, // Invalid
      ];

      const results = calculateCourseRankings(entries);

      expect(results).toHaveLength(1);
      expect(results[0].playerId).toBe("p1");
    });

    it("should return empty array for no valid entries", () => {
      const entries = [
        { playerId: "p1", timeMs: 0 },
        { playerId: "p2", timeMs: -1 },
      ];

      const results = calculateCourseRankings(entries);

      expect(results).toHaveLength(0);
    });
  });

  describe("calculateTAQualificationPoints", () => {
    it("should calculate total points across all 20 courses", () => {
      // Create player times with perfect scores (rank 1 on all courses)
      const playerTimes = new Map<string, Record<string, number | null>>();
      const times: Record<string, number | null> = {};

      COURSES.forEach((course) => {
        times[course] = 80000; // 1:20.000
      });

      playerTimes.set("player1", times);

      const results = calculateTAQualificationPoints(playerTimes);

      expect(results).toHaveLength(1);
      // Single player should get 50 points per course = 1000 total
      expect(results[0].totalPoints).toBe(1000);
    });

    it("should assign 0 points for missing course times", () => {
      const playerTimes = new Map<string, Record<string, number | null>>();

      // Player 1 has only one course time
      playerTimes.set("player1", { MC1: 80000 });
      // Player 2 has all courses at slower times
      const player2Times: Record<string, number | null> = {};
      COURSES.forEach((course) => {
        player2Times[course] = 90000;
      });
      playerTimes.set("player2", player2Times);

      const results = calculateTAQualificationPoints(playerTimes);

      // Player 1 should have points only for MC1
      const player1Result = results.find((r) => r.playerId === "player1");
      expect(player1Result?.coursePoints.MC1).toBe(50); // Won MC1
      expect(player1Result?.coursePoints.DP1).toBe(0); // No time

      // Player 2 should have 0 for MC1 (lost) but some points for other courses
      const player2Result = results.find((r) => r.playerId === "player2");
      expect(player2Result?.coursePoints.MC1).toBe(0);
    });

    it("should handle multiple players with varying times", () => {
      const playerTimes = new Map<string, Record<string, number | null>>();

      // Only test one course for simplicity
      playerTimes.set("p1", { MC1: 80000 }); // Fastest
      playerTimes.set("p2", { MC1: 85000 }); // Middle
      playerTimes.set("p3", { MC1: 90000 }); // Slowest

      const results = calculateTAQualificationPoints(playerTimes);

      // Check MC1 points
      const p1 = results.find((r) => r.playerId === "p1");
      const p2 = results.find((r) => r.playerId === "p2");
      const p3 = results.find((r) => r.playerId === "p3");

      expect(p1?.coursePoints.MC1).toBe(50); // Rank 1
      expect(p2?.coursePoints.MC1).toBe(25); // Rank 2 of 3
      expect(p3?.coursePoints.MC1).toBe(0);  // Rank 3
    });
  });
});

/**
 * Unit tests for Finals Points Fixed Tables
 *
 * Tests the fixed point tables for TA and BM/MR/GP finals.
 */

import {
  getTAFinalsPoints,
  getBMMRGPFinalsPoints,
  getFinalsPoints,
  calculateFinalsPoints,
  getPositionRange,
  formatOrdinal,
  formatPositionRange,
  TA_FINALS_POINTS,
  BM_MR_GP_FINALS_POINTS,
} from "@/lib/points/finals-points";

describe("Finals Points", () => {
  describe("TA Finals Points Table", () => {
    it("should have correct points for top 8", () => {
      expect(getTAFinalsPoints(1)).toBe(2000);
      expect(getTAFinalsPoints(2)).toBe(1600);
      expect(getTAFinalsPoints(3)).toBe(1300);
      expect(getTAFinalsPoints(4)).toBe(1000);
      expect(getTAFinalsPoints(5)).toBe(800);
      expect(getTAFinalsPoints(6)).toBe(700);
      expect(getTAFinalsPoints(7)).toBe(600);
      expect(getTAFinalsPoints(8)).toBe(500);
    });

    it("should have correct points for positions 9-16", () => {
      expect(getTAFinalsPoints(9)).toBe(420);
      expect(getTAFinalsPoints(10)).toBe(400);
      expect(getTAFinalsPoints(11)).toBe(380);
      expect(getTAFinalsPoints(12)).toBe(360);
      expect(getTAFinalsPoints(13)).toBe(340);
      expect(getTAFinalsPoints(14)).toBe(320);
      expect(getTAFinalsPoints(15)).toBe(300);
      expect(getTAFinalsPoints(16)).toBe(280);
    });

    it("should have correct points for positions 17-24", () => {
      expect(getTAFinalsPoints(17)).toBe(160);
      expect(getTAFinalsPoints(18)).toBe(150);
      expect(getTAFinalsPoints(19)).toBe(140);
      expect(getTAFinalsPoints(20)).toBe(130);
      expect(getTAFinalsPoints(21)).toBe(120);
      expect(getTAFinalsPoints(22)).toBe(110);
      expect(getTAFinalsPoints(23)).toBe(100);
      expect(getTAFinalsPoints(24)).toBe(90);
    });

    it("should return 0 for positions beyond 24", () => {
      expect(getTAFinalsPoints(25)).toBe(0);
      expect(getTAFinalsPoints(100)).toBe(0);
    });

    it("should return 0 for invalid positions", () => {
      expect(getTAFinalsPoints(0)).toBe(0);
      expect(getTAFinalsPoints(-1)).toBe(0);
    });

    it("should have 24 entries in the table", () => {
      expect(TA_FINALS_POINTS.length).toBe(24);
    });
  });

  describe("BM/MR/GP Finals Points Table", () => {
    it("should have correct points for top 4", () => {
      expect(getBMMRGPFinalsPoints(1)).toBe(2000);
      expect(getBMMRGPFinalsPoints(2)).toBe(1600);
      expect(getBMMRGPFinalsPoints(3)).toBe(1300);
      expect(getBMMRGPFinalsPoints(4)).toBe(1000);
    });

    it("should have same points for tied positions 5-6", () => {
      expect(getBMMRGPFinalsPoints(5)).toBe(750);
      expect(getBMMRGPFinalsPoints(6)).toBe(750);
    });

    it("should have same points for tied positions 7-8", () => {
      expect(getBMMRGPFinalsPoints(7)).toBe(550);
      expect(getBMMRGPFinalsPoints(8)).toBe(550);
    });

    it("should have same points for positions 9-12", () => {
      expect(getBMMRGPFinalsPoints(9)).toBe(400);
      expect(getBMMRGPFinalsPoints(10)).toBe(400);
      expect(getBMMRGPFinalsPoints(11)).toBe(400);
      expect(getBMMRGPFinalsPoints(12)).toBe(400);
    });

    it("should have same points for positions 13-16", () => {
      expect(getBMMRGPFinalsPoints(13)).toBe(300);
      expect(getBMMRGPFinalsPoints(14)).toBe(300);
      expect(getBMMRGPFinalsPoints(15)).toBe(300);
      expect(getBMMRGPFinalsPoints(16)).toBe(300);
    });

    it("should have same points for positions 17-20", () => {
      expect(getBMMRGPFinalsPoints(17)).toBe(150);
      expect(getBMMRGPFinalsPoints(18)).toBe(150);
      expect(getBMMRGPFinalsPoints(19)).toBe(150);
      expect(getBMMRGPFinalsPoints(20)).toBe(150);
    });

    it("should have same points for positions 21-24", () => {
      expect(getBMMRGPFinalsPoints(21)).toBe(100);
      expect(getBMMRGPFinalsPoints(22)).toBe(100);
      expect(getBMMRGPFinalsPoints(23)).toBe(100);
      expect(getBMMRGPFinalsPoints(24)).toBe(100);
    });

    it("should have 24 entries in the table", () => {
      expect(BM_MR_GP_FINALS_POINTS.length).toBe(24);
    });
  });

  describe("getFinalsPoints", () => {
    it("should return TA points for TA mode", () => {
      expect(getFinalsPoints("TA", 1)).toBe(2000);
      expect(getFinalsPoints("TA", 8)).toBe(500);
    });

    it("should return BM/MR/GP points for BM mode", () => {
      expect(getFinalsPoints("BM", 1)).toBe(2000);
      expect(getFinalsPoints("BM", 5)).toBe(750);
    });

    it("should return BM/MR/GP points for MR mode", () => {
      expect(getFinalsPoints("MR", 1)).toBe(2000);
      expect(getFinalsPoints("MR", 9)).toBe(400);
    });

    it("should return BM/MR/GP points for GP mode", () => {
      expect(getFinalsPoints("GP", 1)).toBe(2000);
      expect(getFinalsPoints("GP", 13)).toBe(300);
    });
  });

  describe("calculateFinalsPoints", () => {
    it("should calculate points for multiple placements", () => {
      const placements = [
        { playerId: "p1", position: 1 },
        { playerId: "p2", position: 2 },
        { playerId: "p3", position: 3 },
      ];

      const results = calculateFinalsPoints("TA", placements);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ playerId: "p1", position: 1, points: 2000 });
      expect(results[1]).toEqual({ playerId: "p2", position: 2, points: 1600 });
      expect(results[2]).toEqual({ playerId: "p3", position: 3, points: 1300 });
    });

    it("should handle BM/MR/GP tied positions", () => {
      const placements = [
        { playerId: "p1", position: 5 },
        { playerId: "p2", position: 6 },
      ];

      const results = calculateFinalsPoints("BM", placements);

      // Both 5th and 6th get 750 points
      expect(results[0].points).toBe(750);
      expect(results[1].points).toBe(750);
    });
  });

  describe("getPositionRange", () => {
    it("should return single position for TA (no grouping)", () => {
      expect(getPositionRange("TA", 1)).toEqual({ start: 1, end: 1 });
      expect(getPositionRange("TA", 5)).toEqual({ start: 5, end: 5 });
      expect(getPositionRange("TA", 24)).toEqual({ start: 24, end: 24 });
    });

    it("should return grouped positions for BM/MR/GP", () => {
      // Individual positions
      expect(getPositionRange("BM", 1)).toEqual({ start: 1, end: 1 });
      expect(getPositionRange("BM", 4)).toEqual({ start: 4, end: 4 });

      // Grouped positions
      expect(getPositionRange("BM", 5)).toEqual({ start: 5, end: 6 });
      expect(getPositionRange("BM", 6)).toEqual({ start: 5, end: 6 });
      expect(getPositionRange("BM", 7)).toEqual({ start: 7, end: 8 });
      expect(getPositionRange("BM", 9)).toEqual({ start: 9, end: 12 });
      expect(getPositionRange("BM", 13)).toEqual({ start: 13, end: 16 });
      expect(getPositionRange("BM", 17)).toEqual({ start: 17, end: 20 });
      expect(getPositionRange("BM", 21)).toEqual({ start: 21, end: 24 });
    });
  });

  describe("formatOrdinal", () => {
    it("should format ordinal numbers correctly", () => {
      expect(formatOrdinal(1)).toBe("1st");
      expect(formatOrdinal(2)).toBe("2nd");
      expect(formatOrdinal(3)).toBe("3rd");
      expect(formatOrdinal(4)).toBe("4th");
      expect(formatOrdinal(5)).toBe("5th");
      expect(formatOrdinal(11)).toBe("11th");
      expect(formatOrdinal(12)).toBe("12th");
      expect(formatOrdinal(13)).toBe("13th");
      expect(formatOrdinal(21)).toBe("21st");
      expect(formatOrdinal(22)).toBe("22nd");
      expect(formatOrdinal(23)).toBe("23rd");
      expect(formatOrdinal(24)).toBe("24th");
    });
  });

  describe("formatPositionRange", () => {
    it("should format single positions for TA", () => {
      expect(formatPositionRange("TA", 1)).toBe("1st");
      expect(formatPositionRange("TA", 5)).toBe("5th");
    });

    it("should format range positions for BM/MR/GP", () => {
      expect(formatPositionRange("BM", 1)).toBe("1st");
      expect(formatPositionRange("BM", 5)).toBe("5th-6th");
      expect(formatPositionRange("BM", 9)).toBe("9th-12th");
    });
  });
});

/**
 * Unit tests for GroupSetupDialog utility functions.
 *
 * Tests the randomlyAssignGroups function which distributes
 * players across groups A/B/C using Fisher-Yates shuffle.
 */

import { randomlyAssignGroups, type SetupPlayer } from "@/lib/group-utils";

describe("randomlyAssignGroups", () => {
  it("returns empty array for empty input", () => {
    expect(randomlyAssignGroups([])).toEqual([]);
  });

  it("assigns single player to group A", () => {
    const players: SetupPlayer[] = [{ playerId: "p1", group: "A" }];
    const result = randomlyAssignGroups(players);
    expect(result).toHaveLength(1);
    expect(result[0].group).toBe("A");
    expect(result[0].playerId).toBe("p1");
  });

  it("distributes players evenly across A, B, C", () => {
    const players: SetupPlayer[] = [
      { playerId: "p1", group: "A" },
      { playerId: "p2", group: "A" },
      { playerId: "p3", group: "A" },
      { playerId: "p4", group: "A" },
      { playerId: "p5", group: "A" },
      { playerId: "p6", group: "A" },
    ];
    const result = randomlyAssignGroups(players);

    /* All players must be present */
    expect(result).toHaveLength(6);
    const resultIds = result.map((p) => p.playerId).sort();
    expect(resultIds).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);

    /* Groups should be evenly distributed: 2 per group */
    const groupCounts = { A: 0, B: 0, C: 0 };
    result.forEach((p) => {
      groupCounts[p.group as keyof typeof groupCounts]++;
    });
    expect(groupCounts.A).toBe(2);
    expect(groupCounts.B).toBe(2);
    expect(groupCounts.C).toBe(2);
  });

  it("handles non-divisible player counts correctly", () => {
    const players: SetupPlayer[] = [
      { playerId: "p1", group: "A" },
      { playerId: "p2", group: "A" },
      { playerId: "p3", group: "A" },
      { playerId: "p4", group: "A" },
      { playerId: "p5", group: "A" },
    ];
    const result = randomlyAssignGroups(players);

    expect(result).toHaveLength(5);

    /* 5 players across 3 groups: either 2-2-1 distribution */
    const groupCounts = { A: 0, B: 0, C: 0 };
    result.forEach((p) => {
      groupCounts[p.group as keyof typeof groupCounts]++;
    });
    const counts = Object.values(groupCounts).sort();
    expect(counts).toEqual([1, 2, 2]);
  });

  it("only uses valid group values A, B, C", () => {
    const players: SetupPlayer[] = Array.from({ length: 10 }, (_, i) => ({
      playerId: `p${i}`,
      group: "X",
    }));
    const result = randomlyAssignGroups(players);

    result.forEach((p) => {
      expect(["A", "B", "C"]).toContain(p.group);
    });
  });

  it("does not mutate the original array", () => {
    const players: SetupPlayer[] = [
      { playerId: "p1", group: "B" },
      { playerId: "p2", group: "C" },
    ];
    const original = [...players.map((p) => ({ ...p }))];
    randomlyAssignGroups(players);

    /* Original array should be unchanged */
    expect(players).toEqual(original);
  });

  it("preserves playerIds through shuffle", () => {
    const players: SetupPlayer[] = Array.from({ length: 20 }, (_, i) => ({
      playerId: `player-${i}`,
      group: "A",
    }));
    const result = randomlyAssignGroups(players);

    const inputIds = new Set(players.map((p) => p.playerId));
    const outputIds = new Set(result.map((p) => p.playerId));
    expect(outputIds).toEqual(inputIds);
  });
});

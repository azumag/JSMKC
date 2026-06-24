/**
 * Unit tests for GroupSetupDialog utility functions.
 *
 * Tests the randomlyAssignGroups, recommendGroupCount, and
 * assignGroupsBySeeding functions from group-utils.ts.
 */

import { randomlyAssignGroups, recommendGroupCount, assignGroupsBySeeding, type SetupPlayer } from "@/lib/group-utils";

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

/* ------------------------------------------------------------------ */
/*  TC-2920–TC-2923: recommendGroupCount                               */
/* ------------------------------------------------------------------ */

describe("recommendGroupCount", () => {
  it("TC-2920: returns 2 for 15 or fewer players", () => {
    // §4.1: ≤15 players → 2 groups (4–8 per group)
    expect(recommendGroupCount(0)).toBe(2);
    expect(recommendGroupCount(1)).toBe(2);
    expect(recommendGroupCount(15)).toBe(2);
  });

  it("TC-2921: returns 3 for 16–23 players", () => {
    // §4.1: 16–23 players → 3 groups (5–8 per group)
    expect(recommendGroupCount(16)).toBe(3);
    expect(recommendGroupCount(23)).toBe(3);
  });

  it("TC-2922: returns 4 for 24 or more players", () => {
    // §4.1: ≥24 players → 4 groups (6+ per group)
    expect(recommendGroupCount(24)).toBe(4);
    expect(recommendGroupCount(32)).toBe(4);
  });

  it("TC-2923: returns 2 for 0 players (minimum valid group count)", () => {
    expect(recommendGroupCount(0)).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  TC-2924–TC-2928: assignGroupsBySeeding                             */
/* ------------------------------------------------------------------ */

describe("assignGroupsBySeeding", () => {
  it("TC-2924: distributes 4 players across 2 groups in serpentine pattern", () => {
    // §10.2: seed1→A, seed2→B, seed3→B, seed4→A (snake fold at group boundary)
    const players: SetupPlayer[] = [
      { playerId: "p1", group: "X", seeding: 1 },
      { playerId: "p2", group: "X", seeding: 2 },
      { playerId: "p3", group: "X", seeding: 3 },
      { playerId: "p4", group: "X", seeding: 4 },
    ];
    const result = assignGroupsBySeeding(players, 2);

    expect(result.find((p) => p.playerId === "p1")?.group).toBe("A");
    expect(result.find((p) => p.playerId === "p2")?.group).toBe("B");
    expect(result.find((p) => p.playerId === "p3")?.group).toBe("B");
    expect(result.find((p) => p.playerId === "p4")?.group).toBe("A");
  });

  it("TC-2925: places players without seeding after seeded players", () => {
    const players: SetupPlayer[] = [
      { playerId: "unseeded", group: "X" },
      { playerId: "seeded", group: "X", seeding: 1 },
    ];
    const result = assignGroupsBySeeding(players, 2);

    // Seeded player must be assigned to group A (first slot)
    expect(result.find((p) => p.playerId === "seeded")?.group).toBe("A");
  });

  it("TC-2926: clamps groupCount=0 to minimum 2 and groupCount=10 to maximum 4", () => {
    const players: SetupPlayer[] = [
      { playerId: "p1", group: "X" },
      { playerId: "p2", group: "X" },
    ];

    // groupCount=0 is clamped to 2; result must use only A and B
    const resultLow = assignGroupsBySeeding(players, 0);
    expect(resultLow).toHaveLength(2);
    resultLow.forEach((p) => expect(["A", "B"]).toContain(p.group));

    // groupCount=10 is clamped to 4; result must use only A–D
    const resultHigh = assignGroupsBySeeding(players, 10);
    expect(resultHigh).toHaveLength(2);
    resultHigh.forEach((p) => expect(["A", "B", "C", "D"]).toContain(p.group));
  });

  it("TC-2927: returns empty array for empty input", () => {
    expect(assignGroupsBySeeding([], 2)).toEqual([]);
  });

  it("TC-2928: does not mutate the original array", () => {
    const players: SetupPlayer[] = [
      { playerId: "p1", group: "A", seeding: 2 },
      { playerId: "p2", group: "B", seeding: 1 },
    ];
    const original = players.map((p) => ({ ...p }));
    assignGroupsBySeeding(players, 2);

    expect(players).toEqual(original);
  });
});

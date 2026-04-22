/**
 * Tests for server-ranking.ts
 *
 * Covers the shared server-side rank computation (1224 + H2H + override)
 * extracted from standings-route.ts.
 */

import { computeQualificationRanks } from "../../src/lib/server-ranking";

describe("computeQualificationRanks", () => {
  it("assigns 1224 ranks when no ties exist", () => {
    const quals = [
      { playerId: "a", score: 10, points: 3 },
      { playerId: "b", score: 8, points: 2 },
      { playerId: "c", score: 6, points: 1 },
    ];
    const result = computeQualificationRanks(quals, [{ score: "desc" }, { points: "desc" }], []);
    expect(result.map((q) => q._rank)).toEqual([1, 2, 3]);
  });

  it("assigns shared 1224 rank to tied entries", () => {
    const quals = [
      { playerId: "a", score: 10, points: 2 },
      { playerId: "b", score: 10, points: 2 },
      { playerId: "c", score: 6, points: 1 },
    ];
    const result = computeQualificationRanks(quals, [{ score: "desc" }, { points: "desc" }], []);
    expect(result.map((q) => q._rank)).toEqual([1, 1, 3]);
  });

  it("breaks ties via H2H wins", () => {
    const quals = [
      { playerId: "a", score: 10, points: 2 },
      { playerId: "b", score: 10, points: 2 },
      { playerId: "c", score: 10, points: 2 },
    ];
    const matches = [
      { player1Id: "a", player2Id: "b", score1: 3, score2: 1, completed: true, isBye: false },
      { player1Id: "b", player2Id: "c", score1: 2, score2: 2, completed: true, isBye: false },
      { player1Id: "a", player2Id: "c", score1: 1, score2: 3, completed: true, isBye: false },
    ];
    // H2H wins: a=1 (beat b), b=0 (drew c, lost a), c=1 (beat a)
    // Sorted by H2H wins: a and c both 1 win, b 0 wins.
    // a and c remain tied (1 win each), b gets rank 3.
    const result = computeQualificationRanks(
      quals,
      [{ score: "desc" }, { points: "desc" }],
      matches,
    );
    const rankMap = Object.fromEntries(result.map((q) => [q.playerId, q._rank]));
    expect(rankMap["b"]).toBe(3); // b has 0 H2H wins → lowest
    expect(rankMap["a"]).toBe(1); // a and c tied at 1 win → share rank 1
    expect(rankMap["c"]).toBe(1);
  });

  it("ignores incomplete and bye matches for H2H", () => {
    const quals = [
      { playerId: "a", score: 10, points: 2 },
      { playerId: "b", score: 10, points: 2 },
    ];
    const matches = [
      { player1Id: "a", player2Id: "b", score1: 3, score2: 1, completed: false, isBye: false },
      { player1Id: "a", player2Id: "b", score1: 3, score2: 1, completed: true, isBye: true },
    ];
    const result = computeQualificationRanks(
      quals,
      [{ score: "desc" }, { points: "desc" }],
      matches,
    );
    expect(result[0]._rank).toBe(1);
    expect(result[1]._rank).toBe(1);
  });

  it("applies rankOverride and re-sorts", () => {
    const quals = [
      { playerId: "a", score: 10, points: 3, rankOverride: null },
      { playerId: "b", score: 8, points: 2, rankOverride: 1 }, // override to rank 1
      { playerId: "c", score: 6, points: 1, rankOverride: null },
    ];
    const result = computeQualificationRanks(quals, [{ score: "desc" }, { points: "desc" }], []);
    const rankMap = Object.fromEntries(result.map((q) => [q.playerId, q._rank]));
    expect(rankMap["b"]).toBe(1); // b moves to rank 1 via override
    expect(rankMap["a"]).toBe(1); // a stays at rank 1, colliding with b
    expect(rankMap["c"]).toBe(3); // c skips rank 2 because two players occupy rank 1
    expect(result.find((q) => q.playerId === "b")?._rankOverridden).toBe(true);
  });

  it("places overridden entries first when effective ranks collide", () => {
    const quals = [
      { playerId: "a", score: 10, points: 3, rankOverride: 2 },
      { playerId: "b", score: 8, points: 2, rankOverride: null }, // auto rank 2
    ];
    const result = computeQualificationRanks(quals, [{ score: "desc" }, { points: "desc" }], []);
    expect(result[0].playerId).toBe("a"); // overridden first
    expect(result[1].playerId).toBe("b");
  });

  it("restarts ranks when group is the leading sort field", () => {
    const quals = [
      { playerId: "a1", group: "A", score: 10, points: 3, rankOverride: null },
      { playerId: "a2", group: "A", score: 8, points: 2, rankOverride: null },
      { playerId: "b1", group: "B", score: 11, points: 4, rankOverride: null },
      { playerId: "b2", group: "B", score: 7, points: 1, rankOverride: null },
    ];

    const result = computeQualificationRanks(
      quals,
      [{ group: "asc" }, { score: "desc" }, { points: "desc" }],
      [],
    );

    expect(result.map((q) => [q.playerId, q._rank])).toEqual([
      ["a1", 1],
      ["a2", 2],
      ["b1", 1],
      ["b2", 2],
    ]);
  });
});

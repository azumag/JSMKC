/**
 * Tests for buildOverlayEvents — the pure aggregator that converts
 * pre-fetched DB rows into a sorted overlay event list.
 *
 * Coverage targets:
 *   1. `since` is a strict lower bound (events at or before are dropped)
 *   2. Each event type is produced from the right input
 *   3. PII (ipAddress / userAgent / userId) is impossible to leak — the
 *      input shapes don't carry those fields, but we still assert the
 *      output object only contains the documented keys.
 *   4. Events are returned in chronological order regardless of input order
 */

import { buildOverlayEvents } from "@/lib/overlay/events";
import type { BuildOverlayEventsInput, OverlayMatchInput } from "@/lib/overlay/types";

const SINCE = new Date("2026-04-25T10:00:00.000Z");
const AFTER = new Date("2026-04-25T10:00:05.000Z");
const FAR_AFTER = new Date("2026-04-25T10:00:30.000Z");
const BEFORE = new Date("2026-04-25T09:59:30.000Z");

function emptyInput(overrides: Partial<BuildOverlayEventsInput> = {}): BuildOverlayEventsInput {
  return {
    since: SINCE,
    tournament: {
      qualificationConfirmedAt: null,
      earliestFinalsCreatedAt: null,
      latestOverallRankingUpdatedAt: null,
    },
    bmMatches: [],
    mrMatches: [],
    gpMatches: [],
    ttEntries: [],
    ttPhaseRounds: [],
    scoreLogs: [],
    ...overrides,
  };
}

function match(overrides: Partial<OverlayMatchInput>): OverlayMatchInput {
  return {
    id: "m1",
    matchNumber: 1,
    stage: "qualification",
    round: null,
    completed: true,
    updatedAt: AFTER,
    createdAt: AFTER,
    player1: { nickname: "Alice" },
    player2: { nickname: "Bob" },
    score1: 4,
    score2: 0,
    ...overrides,
  };
}

const ALLOWED_KEYS = new Set([
  "id",
  "type",
  "timestamp",
  "mode",
  "title",
  "subtitle",
  "matchResult",
  "taTimeRecord",
]);

function assertNoPII<T extends object>(obj: T) {
  for (const key of Object.keys(obj)) {
    expect(ALLOWED_KEYS.has(key)).toBe(true);
  }
}

describe("buildOverlayEvents", () => {
  it("drops events at or before the since boundary", () => {
    const events = buildOverlayEvents(
      emptyInput({
        bmMatches: [match({ id: "old", updatedAt: BEFORE })],
        scoreLogs: [
          {
            id: "log-old",
            matchId: "m1",
            matchType: "BM",
            timestamp: BEFORE,
            player: { nickname: "X" },
          },
        ],
        tournament: {
          // exactly equal to `since` should still be dropped (strict >)
          qualificationConfirmedAt: SINCE,
          earliestFinalsCreatedAt: null,
          latestOverallRankingUpdatedAt: null,
        },
      }),
    );
    expect(events).toEqual([]);
  });

  it("emits match_completed only for completed matches after since", () => {
    const events = buildOverlayEvents(
      emptyInput({
        bmMatches: [
          match({ id: "incomplete", completed: false }),
          match({ id: "done", completed: true, score1: 4, score2: 1 }),
        ],
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("match_completed");
    expect(events[0].mode).toBe("bm");
    expect(events[0].subtitle).toContain("4-1");
    expect(events[0].subtitle).toContain("Alice");
    expect(events[0].subtitle).toContain("Bob");
    // Structured scoreboard payload powers the dashboard graphical view.
    expect(events[0].matchResult).toEqual({
      player1: "Alice",
      player2: "Bob",
      score1: 4,
      score2: 1,
    });
  });

  it("attaches BM/MR assignedCourses to matchResult.courses and to subtitle", () => {
    const events = buildOverlayEvents(
      emptyInput({
        bmMatches: [
          match({
            id: "bm-with-courses",
            assignedCourses: ["MC1", "DP1", "GV1", "BC1"],
          }),
        ],
        mrMatches: [
          match({
            id: "mr-with-courses",
            assignedCourses: ["KB1", "CI2", "VL1", "BC3"],
            updatedAt: FAR_AFTER,
          }),
        ],
      }),
    );
    const bm = events.find((e) => e.mode === "bm")!;
    const mr = events.find((e) => e.mode === "mr")!;
    expect(bm.matchResult?.courses).toEqual(["MC1", "DP1", "GV1", "BC1"]);
    expect(mr.matchResult?.courses).toEqual(["KB1", "CI2", "VL1", "BC3"]);
    // Subtitle still carries the score line; course suffix is appended so
    // legacy toast overlays surface the courses as well.
    expect(bm.subtitle).toContain("MC1");
    expect(mr.subtitle).toContain("KB1");
    // GP-only `cup` field must not bleed into BM/MR results.
    expect(bm.matchResult?.cup).toBeUndefined();
    expect(mr.matchResult?.cup).toBeUndefined();
  });

  it("attaches GP cup to matchResult.cup and to subtitle", () => {
    const events = buildOverlayEvents(
      emptyInput({
        gpMatches: [
          match({
            id: "gp-with-cup",
            cup: "Mushroom",
            score1: 45,
            score2: 0,
          }),
        ],
      }),
    );
    const gp = events[0];
    expect(gp.mode).toBe("gp");
    expect(gp.matchResult?.cup).toBe("Mushroom");
    // Courses array is absent for GP — cup labels the whole match.
    expect(gp.matchResult?.courses).toBeUndefined();
    expect(gp.subtitle).toContain("Mushroom");
  });

  it("omits courses/cup when DB rows have no values (legacy data)", () => {
    const events = buildOverlayEvents(
      emptyInput({
        bmMatches: [match({ id: "bm-legacy", assignedCourses: null })],
        gpMatches: [
          // Both `null` and `""` are legacy/empty cup values — neither
          // should bleed onto the matchResult or the subtitle suffix.
          match({ id: "gp-legacy-null", cup: null, updatedAt: FAR_AFTER }),
          match({
            id: "gp-legacy-empty",
            cup: "",
            updatedAt: new Date(FAR_AFTER.getTime() + 1),
          }),
        ],
      }),
    );
    const bm = events.find((e) => e.mode === "bm")!;
    const gpEvents = events.filter((e) => e.mode === "gp");
    expect(bm.matchResult?.courses).toBeUndefined();
    expect(gpEvents).toHaveLength(2);
    for (const gp of gpEvents) {
      expect(gp.matchResult?.cup).toBeUndefined();
      expect(gp.subtitle).not.toMatch(/\[\s*\]/);
    }
  });

  it("ignores empty / non-string assignedCourses entries", () => {
    const events = buildOverlayEvents(
      emptyInput({
        bmMatches: [
          match({ id: "bm-empty", assignedCourses: [] }),
          match({
            id: "bm-mixed",
            assignedCourses: ["MC1", "", null, 42, "BC1"] as unknown as string[],
            updatedAt: FAR_AFTER,
          }),
        ],
      }),
    );
    const empty = events.find((e) => e.id.includes("bm-empty"))!;
    const mixed = events.find((e) => e.id.includes("bm-mixed"))!;
    expect(empty.matchResult?.courses).toBeUndefined();
    expect(mixed.matchResult?.courses).toEqual(["MC1", "BC1"]);
  });

  it("labels finals stage differently from qualification stage", () => {
    const events = buildOverlayEvents(
      emptyInput({
        bmMatches: [match({ id: "f", stage: "finals", matchNumber: 7 })],
      }),
    );
    expect(events[0].title).toContain("決勝");
    expect(events[0].title).toContain("#7");
  });

  it("emits score_reported for each ScoreEntryLog row", () => {
    const events = buildOverlayEvents(
      emptyInput({
        scoreLogs: [
          {
            id: "log-1",
            matchId: "m1",
            matchType: "GP",
            timestamp: AFTER,
            player: { nickname: "Charlie" },
          },
        ],
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("score_reported");
    expect(events[0].mode).toBe("gp");
    expect(events[0].subtitle).toContain("Charlie");
  });

  // Qualification (`stage='qualification'`) is now total-time-based: a single
  // notification fires once `totalTime` is non-null (all 20 courses in), not
  // per individual course entry. Phase rounds (phase1/2/3) are single-course
  // and keep the per-course event semantics.

  it("does NOT emit ta_time_recorded for qualification entries with totalTime=null", () => {
    // Even when lastRecordedCourse/Time are populated (mid-fill), the
    // qualification entry must stay silent until totalTime is computed.
    const events = buildOverlayEvents(
      emptyInput({
        ttEntries: [
          {
            id: "tt-partial",
            player: { nickname: "Dave" },
            totalTime: null,
            rank: null,
            updatedAt: AFTER,
            stage: "qualification",
            lastRecordedCourse: "MC1",
            lastRecordedTime: "1:23.45",
          },
        ],
      }),
    );
    expect(events).toHaveLength(0);
  });

  it("emits ta_time_recorded for qualification once totalTime is set, with total-time payload", () => {
    const events = buildOverlayEvents(
      emptyInput({
        ttEntries: [
          {
            id: "tt-done",
            player: { nickname: "Eve" },
            totalTime: 90_000,
            rank: 3,
            updatedAt: AFTER,
            stage: "qualification",
            lastRecordedCourse: "RR",
            lastRecordedTime: "0:42.500",
          },
        ],
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ta_time_recorded");
    expect(events[0].mode).toBe("ta");
    // Title now talks about completing qualification with the total time,
    // not the most recent course.
    expect(events[0].title).toContain("Eve");
    expect(events[0].title).toContain("予選");
    expect(events[0].title).toContain("完走");
    expect(events[0].title).toContain("1:30.00");
    expect(events[0].title).toContain("3 位");
    // Structured payload carries totals; per-course course/time are absent.
    expect(events[0].taTimeRecord).toEqual({
      player: "Eve",
      phaseLabel: "予選",
      rank: 3,
      totalTimeMs: 90_000,
      totalTimeFormatted: "1:30.00",
    });
  });

  it("dedupes qualification completion across recalculateRanks bumps via content-keyed id", () => {
    // recalculateRanks writes every TTEntry row in the stage on every PUT,
    // which bumps every completed player's updatedAt. The qualification
    // event id must be keyed on totalTime (not updatedAt) so client-side
    // seenRef dedupe collapses the duplicate emission to one toast.
    const FIRST_BUMP = new Date("2026-04-25T10:00:05.000Z");
    const SECOND_BUMP = new Date("2026-04-25T10:00:25.000Z");
    const baseEntry = {
      id: "tt-A",
      player: { nickname: "Alice" },
      totalTime: 90_000,
      rank: 1,
      stage: "qualification",
      lastRecordedCourse: "MC1",
      lastRecordedTime: "1:23.45",
    };
    const firstPoll = buildOverlayEvents(
      emptyInput({
        ttEntries: [{ ...baseEntry, updatedAt: FIRST_BUMP }],
      }),
    );
    const secondPoll = buildOverlayEvents(
      emptyInput({
        ttEntries: [{ ...baseEntry, updatedAt: SECOND_BUMP }],
      }),
    );
    expect(firstPoll[0].id).toBe(secondPoll[0].id);
    expect(firstPoll[0].id).toContain("90000");
  });

  it("emits a fresh qualification event when totalTime changes (correction)", () => {
    // Genuine corrections must re-fire so the dashboard reflects the
    // updated total time and rank. The id must change with totalTime.
    const before = buildOverlayEvents(
      emptyInput({
        ttEntries: [
          {
            id: "tt-A",
            player: { nickname: "Alice" },
            totalTime: 90_000,
            rank: 2,
            updatedAt: AFTER,
            stage: "qualification",
            lastRecordedCourse: "MC1",
            lastRecordedTime: "1:23.45",
          },
        ],
      }),
    );
    const afterCorrection = buildOverlayEvents(
      emptyInput({
        ttEntries: [
          {
            id: "tt-A",
            player: { nickname: "Alice" },
            totalTime: 89_500,
            rank: 1,
            updatedAt: AFTER,
            stage: "qualification",
            lastRecordedCourse: "MC1",
            lastRecordedTime: "1:23.40",
          },
        ],
      }),
    );
    expect(before[0].id).not.toBe(afterCorrection[0].id);
  });

  it("rounds totalTime to centiseconds in the title (89999ms -> 1:30.00)", () => {
    // Pin msToDisplayTime contract: ms divisible-by-10 boundary rounds up,
    // so the formatter is what's wired in (not e.lastRecordedTime).
    const events = buildOverlayEvents(
      emptyInput({
        ttEntries: [
          {
            id: "tt-A",
            player: { nickname: "Alice" },
            totalTime: 89_999,
            rank: 1,
            updatedAt: AFTER,
            stage: "qualification",
            lastRecordedCourse: "MC1",
            lastRecordedTime: "0:00.01",
          },
        ],
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toContain("1:30.00");
    expect(events[0].taTimeRecord?.totalTimeFormatted).toBe("1:30.00");
  });

  it("keeps per-course ta_time_recorded for phase rounds (single-course stages)", () => {
    const events = buildOverlayEvents(
      emptyInput({
        ttEntries: [
          {
            id: "tt-phase1",
            player: { nickname: "Frank" },
            totalTime: null,
            rank: 2,
            updatedAt: AFTER,
            stage: "phase1",
            lastRecordedCourse: "MC1",
            lastRecordedTime: "1:23.45",
          },
        ],
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ta_time_recorded");
    expect(events[0].title).toContain("Frank");
    expect(events[0].title).toContain("MC1");
    expect(events[0].title).toContain("1:23.45");
    expect(events[0].title).toContain("敗者復活1");
    expect(events[0].taTimeRecord).toEqual({
      player: "Frank",
      course: "MC1",
      time: "1:23.45",
      phaseLabel: "敗者復活1",
      rank: 2,
    });
  });

  it("emits qualification_confirmed / finals_started / overall_ranking_updated when their timestamps cross since", () => {
    const events = buildOverlayEvents(
      emptyInput({
        tournament: {
          qualificationConfirmedAt: AFTER,
          earliestFinalsCreatedAt: AFTER,
          latestOverallRankingUpdatedAt: AFTER,
        },
      }),
    );
    const types = events.map((e) => e.type).sort();
    expect(types).toEqual([
      "finals_started",
      "overall_ranking_updated",
      "qualification_confirmed",
    ]);
  });

  it("emits ta_phase_advanced for each phase round created after since", () => {
    const events = buildOverlayEvents(
      emptyInput({
        ttPhaseRounds: [
          { id: "r1", phase: "phase1", roundNumber: 2, course: "MC1", createdAt: AFTER },
        ],
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ta_phase_advanced");
    expect(events[0].title).toContain("phase1");
    expect(events[0].title).toContain("R2");
    expect(events[0].subtitle).toContain("MC1");
  });

  it("returns events sorted ascending by timestamp", () => {
    const events = buildOverlayEvents(
      emptyInput({
        bmMatches: [match({ id: "later", updatedAt: FAR_AFTER })],
        scoreLogs: [
          {
            id: "earlier",
            matchId: "m1",
            matchType: "BM",
            timestamp: AFTER,
            player: { nickname: "Z" },
          },
        ],
      }),
    );
    expect(events.map((e) => e.id)).toEqual([
      "score_reported:earlier",
      `match_completed:bm:later:${FAR_AFTER.getTime()}`,
    ]);
  });

  it("never includes PII fields on output objects", () => {
    const events = buildOverlayEvents(
      emptyInput({
        bmMatches: [match({ id: "m" })],
        scoreLogs: [
          {
            id: "s",
            matchId: "m",
            matchType: "BM",
            timestamp: AFTER,
            player: { nickname: "P" },
          },
        ],
        ttEntries: [
          {
            id: "t",
            player: { nickname: "Q" },
            totalTime: 1000,
            rank: 1,
            updatedAt: AFTER,
            stage: "qualification",
            lastRecordedCourse: "MC1",
            lastRecordedTime: "1:23.45",
          },
        ],
        tournament: {
          qualificationConfirmedAt: AFTER,
          earliestFinalsCreatedAt: null,
          latestOverallRankingUpdatedAt: null,
        },
      }),
    );
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) assertNoPII(e);
  });
});

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

const ALLOWED_KEYS = new Set(["id", "type", "timestamp", "mode", "title", "subtitle"]);

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

  it("emits ta_time_recorded only when a course/time was recorded", () => {
    const events = buildOverlayEvents(
      emptyInput({
        ttEntries: [
          {
            id: "tt-empty",
            player: { nickname: "Dave" },
            totalTime: null,
            rank: null,
            updatedAt: AFTER,
            stage: "qualification",
            lastRecordedCourse: null,
            lastRecordedTime: null,
          },
          {
            id: "tt-good",
            player: { nickname: "Eve" },
            totalTime: 90_000,
            rank: 3,
            updatedAt: AFTER,
            stage: "qualification",
            lastRecordedCourse: "MC1",
            lastRecordedTime: "1:23.45",
          },
        ],
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("ta_time_recorded");
    expect(events[0].title).toContain("Eve");
    expect(events[0].title).toContain("MC1");
    expect(events[0].title).toContain("1:23.45");
    expect(events[0].title).toContain("3 位");
    expect(events[0].title).toContain("予選");
    expect(events[0].subtitle).toBeUndefined();
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

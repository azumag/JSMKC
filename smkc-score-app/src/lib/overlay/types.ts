/**
 * Overlay event types for the OBS browser-source overlay.
 *
 * The overlay endpoint exposes a unified, time-ordered stream of recent
 * tournament activity (score entries, status transitions, ranking updates).
 * The shape is intentionally narrow: only fields that the overlay UI renders
 * are included, and PII (ipAddress / userAgent / passwords) is excluded at
 * the type level so it cannot accidentally leak through the public API.
 */

export type OverlayMode = "ta" | "bm" | "mr" | "gp";

export type OverlayEventType =
  | "score_reported"
  | "match_completed"
  | "ta_time_recorded"
  | "qualification_confirmed"
  | "finals_started"
  | "ta_phase_advanced"
  | "overall_ranking_updated";

/**
 * A single overlay event.
 *
 * `id` is deterministic per source row so the client can dedupe across
 * overlapping polls (e.g., after a `since` boundary that includes the same
 * record twice). `timestamp` is an ISO 8601 string echoed straight from the
 * server; the client should never compute it from `Date.now()` because the
 * OBS host clock cannot be trusted to match the server clock.
 */
export interface OverlayEvent {
  id: string;
  type: OverlayEventType;
  timestamp: string;
  mode?: OverlayMode;
  title: string;
  subtitle?: string;
}

/**
 * Minimal player shape for event titles. Only `nickname` is rendered
 * (display name on stream); we never expose email / password / userId.
 */
export interface OverlayPlayerRef {
  nickname: string;
}

/**
 * Match record passed to `buildOverlayEvents`. All four mode tables share
 * enough columns that a single shape works — GP uses points1/points2 for
 * driver points, while BM/MR use score1/score2 for round wins.
 */
export interface OverlayMatchInput {
  id: string;
  matchNumber: number;
  stage: string;
  round?: string | null;
  completed: boolean;
  updatedAt: Date;
  createdAt: Date;
  player1: OverlayPlayerRef | null;
  player2: OverlayPlayerRef | null;
  score1: number;
  score2: number;
}

export interface OverlayScoreLogInput {
  id: string;
  matchId: string;
  matchType: string;
  player: OverlayPlayerRef | null;
  timestamp: Date;
}

export interface OverlayTtEntryInput {
  id: string;
  player: OverlayPlayerRef | null;
  totalTime: number | null;
  rank: number | null;
  updatedAt: Date;
  /** Stage the entry belongs to (qualification / phase1 / phase2 / phase3). */
  stage: string;
  /** Most recently recorded course abbreviation, or null if never set. */
  lastRecordedCourse: string | null;
  /** Raw time string ("M:SS.ms") matching `lastRecordedCourse`. */
  lastRecordedTime: string | null;
}

export interface OverlayTtPhaseRoundInput {
  id: string;
  phase: string;
  roundNumber: number;
  course: string;
  createdAt: Date;
}

export interface OverlayTournamentInput {
  qualificationConfirmedAt: Date | null;
  /**
   * Earliest createdAt of any match where `stage='finals'`. Used to surface
   * a single "finals bracket created" event when finals are first generated.
   */
  earliestFinalsCreatedAt: Date | null;
  /**
   * Most-recent updatedAt across `TournamentPlayerScore` rows for the
   * tournament. Indicates the overall ranking was recalculated.
   */
  latestOverallRankingUpdatedAt: Date | null;
}

export interface BuildOverlayEventsInput {
  /** Lower bound (exclusive). Events at or before this time are filtered out. */
  since: Date;
  tournament: OverlayTournamentInput;
  bmMatches: OverlayMatchInput[];
  mrMatches: OverlayMatchInput[];
  gpMatches: OverlayMatchInput[];
  ttEntries: OverlayTtEntryInput[];
  ttPhaseRounds: OverlayTtPhaseRoundInput[];
  scoreLogs: OverlayScoreLogInput[];
}

export interface OverlayEventsResponse {
  /** Server's "now". Clients echo this back as `since` on the next poll. */
  serverTime: string;
  events: OverlayEvent[];
}

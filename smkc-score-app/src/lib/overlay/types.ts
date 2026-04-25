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
/**
 * Structured score data attached to `match_completed` events so the
 * dashboard can render a graphical scoreboard (player rows + big score
 * digits) instead of parsing the freeform `subtitle` string.
 *
 * `score1`/`score2` carry the same number the subtitle string already
 * exposes — for GP this is the driver-point total (re-mapped from
 * `points1`/`points2` in the route handler), for BM/MR it is round wins.
 * Either side can be null when a match has a bye seat.
 */
export interface OverlayMatchResult {
  player1: string;
  player2: string;
  score1: number;
  score2: number;
}

/**
 * Structured TA-time payload attached to `ta_time_recorded` events. Mirrors
 * the data already present in the title string but split into discrete
 * fields so the dashboard timeline can render a richer card (player chip,
 * course chip, prominent time digits) instead of one long sentence.
 */
export interface OverlayTaTimeRecord {
  player: string;
  course: string;
  /** Raw time string ("M:SS.ms"). Format-preserving so the broadcast UI
      can choose its own emphasis without re-parsing. */
  time: string;
  /** Human label for the TA stage ("予選" / "敗者復活1" etc.). May be
      empty when the stage is unknown. */
  phaseLabel?: string;
  /** Current rank in the active stage, when known. */
  rank: number | null;
}

export interface OverlayEvent {
  id: string;
  type: OverlayEventType;
  timestamp: string;
  mode?: OverlayMode;
  title: string;
  subtitle?: string;
  /** Populated only when `type === "match_completed"`. Drives the graphical
      scoreboard view in the dashboard timeline. */
  matchResult?: OverlayMatchResult;
  /** Populated only when `type === "ta_time_recorded"`. */
  taTimeRecord?: OverlayTaTimeRecord;
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
  /**
   * Combined tournament-phase label for the OBS dashboard footer (e.g.
   * "予選", "バラッジ1 R3", "決勝 QF"). Always populated; the legacy toast
   * overlay simply ignores it.
   */
  currentPhase?: string;
  /**
   * Format string ("First To" / equivalent) shown next to `currentPhase` —
   * for example, "FT5" for BM/MR bracket finals. Null/undefined when the
   * active phase has no meaningful FT value (TA, GP, qualification, barrage).
   */
  currentPhaseFormat?: string | null;
  /**
   * Broadcast player names set by the admin via "配信に反映" or 配信管理 page.
   * Displayed on the OBS overlay canvas at the 1P/2P name positions.
   * Empty string means no name is currently set.
   */
  overlayPlayer1Name?: string;
  overlayPlayer2Name?: string;
  /**
   * Round label of the match selected by "配信に反映" (e.g. "決勝 QF").
   * When set, the dashboard footer uses this instead of the auto-computed phase.
   * Null/undefined means fall back to computeCurrentPhase.
   */
  overlayMatchLabel?: string | null;
  /** Current wins for 1P in the broadcast match. Null when not set. */
  overlayPlayer1Wins?: number | null;
  /** Current wins for 2P in the broadcast match. Null when not set. */
  overlayPlayer2Wins?: number | null;
  /** First-To target wins for the broadcast match (BM/MR finals: 5). Null for modes without FT. */
  overlayMatchFt?: number | null;
}

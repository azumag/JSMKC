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
  | "ta_phase_completed"
  | "ta_lives_reset"
  | "ta_champion_decided"
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
  /**
   * BM/MR only. Pre-assigned courses for this match (e.g. ["MC1","DP1",
   * "GV1","BC1"]). Omitted when the source row has null/empty
   * `assignedCourses` (legacy data, BREAK byes). Renders as a chip row
   * on the dashboard scoreboard card.
   */
  courses?: string[];
  /**
   * GP only. Cup the match was played on ("Mushroom" / "Flower" / "Star" /
   * "Special"). Omitted when the source row has no cup set. Renders as a
   * label on the dashboard scoreboard card.
   */
  cup?: string;
}

/**
 * Structured TA-time payload attached to `ta_time_recorded` events.
 *
 * Two flavors share this shape so the dashboard renderer can branch on
 * which fields are populated:
 *
 *  - **Qualification completion** (stage=qualification, `totalTime` non-null):
 *    `totalTimeMs` and `totalTimeFormatted` are set; `course` / `time` are
 *    absent. One event per player per qualification stage (re-fires only on
 *    subsequent corrections).
 *
 *  - **Phase round** (phase1 / phase2 / phase3, single course per round):
 *    `course` and `time` are set per the most recently recorded course;
 *    `totalTimeMs` / `totalTimeFormatted` are absent.
 */
export interface OverlayTaTimeRecord {
  player: string;
  /** Per-course course label. Set for phase rounds; omitted for qualification completion. */
  course?: string;
  /** Raw per-course time string ("M:SS.ms"). Set for phase rounds; omitted for qualification completion. */
  time?: string;
  /** Total time in ms — set only for qualification-completion events. */
  totalTimeMs?: number;
  /** Formatted total time ("M:SS.cc") — set only for qualification-completion events. */
  totalTimeFormatted?: string;
  /** Human label for the TA stage ("Qualification" / "Phase 1" etc.). May be
      empty when the stage is unknown. */
  phaseLabel?: string;
  /** Current rank in the active stage, when known. */
  rank: number | null;
}

export interface OverlayTaPhaseParticipant {
  player: string;
  lives: number;
  rank: number | null;
}

export interface OverlayTaPhaseRound {
  phase: string;
  phaseLabel?: string;
  roundNumber: number;
  course: string;
  courseName: string;
  participants: OverlayTaPhaseParticipant[];
}

export interface OverlayTaPhaseResult {
  player: string;
  timeFormatted: string;
  isRetry: boolean;
  eliminated: boolean;
}

export interface OverlayTaPhaseCompleted {
  phase: string;
  phaseLabel?: string;
  roundNumber: number;
  course: string;
  courseName: string;
  results: OverlayTaPhaseResult[];
  eliminatedPlayers: string[];
  livesReset: boolean;
}

export interface OverlayTaChampionStanding {
  rank: 1 | 2 | 3;
  player: string;
}

export interface OverlayTaChampion {
  roundNumber: number;
  standings: OverlayTaChampionStanding[];
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
  /** Populated only when `type === "ta_phase_advanced"`. */
  taPhaseRound?: OverlayTaPhaseRound;
  /** Populated only when `type === "ta_phase_completed"`. */
  taPhaseCompleted?: OverlayTaPhaseCompleted;
  /** Populated only when `type === "ta_champion_decided"`. */
  taChampion?: OverlayTaChampion;
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
  /** BM/MR only. Raw `assignedCourses` JSON column. Aggregator filters this
      to a string[] of valid course abbreviations before exposing it. */
  assignedCourses?: unknown;
  /** GP only. The `cup` column ("Mushroom" / "Flower" / "Star" / "Special"). */
  cup?: string | null;
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
  submittedAt?: Date | null;
  results?: unknown;
  eliminatedIds?: unknown;
  livesReset?: boolean;
  participants?: OverlayTaPhaseParticipant[];
  playerNamesById?: Record<string, string>;
  championStandings?: OverlayTaChampionStanding[];
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
   * "Qualification", "Time Attack Phase 1 Round 3",
   * "Battle Mode Finals Winners Quarter Final"). Always populated; the legacy
   * toast overlay simply ignores it.
   */
  currentPhase?: string;
  /**
   * Format string shown next to `currentPhase` — for example, "First to 5"
   * for Battle Mode / Match Race bracket finals. Null/undefined when the
   * active phase has no meaningful value (Time Attack, Grand Prix,
   * qualification, barrage).
   */
  currentPhaseFormat?: string | null;
  /**
   * Broadcast player names set by the admin via "配信に反映" or broadcast page.
   * Displayed on the OBS overlay canvas at the 1P/2P name positions.
   * Empty string means no name is currently set.
   */
  overlayPlayer1Name?: string;
  overlayPlayer2Name?: string;
  /**
   * Round label of the match selected by "配信に反映"
   * (e.g. "Battle Mode Finals Winners Quarter Final").
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

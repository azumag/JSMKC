/**
 * Event Type Configuration Types
 *
 * Defines the shared interface for all tournament event types (BM, MR, GP).
 * Each event type implements EventTypeConfig to specify its scoring rules,
 * Prisma model names, and match result calculation logic.
 *
 * This pattern enables a single factory function (qualification-route.ts)
 * to generate identical API route handlers for all event types, eliminating
 * code duplication while preserving type-specific behavior.
 */

/** Result of a single match calculation */
export type MatchResult = {
  winner: number | null;
  result1: 'win' | 'loss' | 'tie' | 'no_contest';
  result2: 'win' | 'loss' | 'tie' | 'no_contest';
};

/** Parsed PUT request body for qualification match updates */
export type QualificationPutData = {
  matchId: string;
  tournamentId?: string;
  score1?: number;
  score2?: number;
  points1?: number;
  points2?: number;
  rounds?: unknown;
  cup?: string;
  races?: Array<{ course: string; position1: number; position2: number }>;
};

/**
 * Configuration interface for a tournament event type.
 *
 * Each event type (BM, MR, GP) provides an implementation of this interface
 * that captures its unique scoring rules, Prisma model names, and behavior
 * differences. The qualification-route factory consumes this config to
 * generate GET/POST/PUT handlers.
 */
export interface EventTypeConfig {
  /** Event type code for mode-specific logic (e.g., bye scores) */
  eventTypeCode: 'bm' | 'mr' | 'gp';
  /** Prisma model name for qualification records (e.g., 'bMQualification') */
  qualificationModel: string;
  /** Prisma model name for match records (e.g., 'bMMatch') */
  matchModel: string;

  /**
   * Score field names on the match model used to determine H2H winner.
   * Defaults to { p1: 'score1', p2: 'score2' } (BM/MR convention).
   * Set to { p1: 'points1', p2: 'points2' } for GP.
   */
  matchScoreFields?: { p1: string; p2: string };

  /** Logger instance name for structured logging */
  loggerName: string;
  /** Human-readable event name for error messages (e.g., 'battle mode') */
  eventDisplayName: string;

  /** Sort order for qualification standings query */
  qualificationOrderBy: Array<Record<string, 'asc' | 'desc'>>;

  /**
   * Whether to randomly assign courses to matches at qualification setup time (§10.5).
   * When true, the POST handler shuffles COURSES and distributes 4 per match sequentially.
   * Only used for MR; BM/GP do not pre-assign courses this way.
   */
  assignCoursesRandomly?: boolean;

  /**
   * Whether to randomly assign a cup to each match at qualification setup time (§7.4).
   * When true, the POST handler shuffles cupList and assigns one cup per match (cycling via modulo).
   * GP uses this to pre-assign cups; BM/MR do not.
   */
  assignCupRandomly?: boolean;
  /** List of available cups for random assignment. Required when assignCupRandomly is true. */
  cupList?: readonly string[];

  /** Whether POST endpoint requires authentication */
  postRequiresAuth: boolean;
  /** Whether PUT endpoint requires admin authentication */
  putRequiresAuth: boolean;
  /** Audit action constant for POST (undefined = no audit logging) */
  auditAction?: string;
  /** Success message returned by POST */
  setupCompleteMessage: string;

  /** Parse and validate the PUT request body */
  parsePutBody: (body: Record<string, unknown>) => {
    valid: boolean;
    error?: string;
    data?: QualificationPutData;
  };

  /**
   * Update a match record via Prisma and return the updated match
   * along with the two score values used for match result calculation.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateMatch: (prisma: any, data: QualificationPutData) => Promise<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    match: any;
    score1OrPoints1: number;
    score2OrPoints2: number;
  }>;

  /** Calculate match outcome from score/points values */
  calculateMatchResult: (val1: number, val2: number) => MatchResult;

  /**
   * Aggregate a player's stats across all their completed matches.
   * Returns stats object, computed score, and data to write to qualification record.
   */
  aggregatePlayerStats: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matches: any[],
    playerId: string,
    calculateMatchResult: (v1: number, v2: number) => MatchResult,
  ) => {
    stats: Record<string, number>;
    score: number;
    qualificationData: Record<string, number>;
  };
}

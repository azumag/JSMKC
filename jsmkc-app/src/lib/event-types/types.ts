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
  result1: 'win' | 'loss' | 'tie';
  result2: 'win' | 'loss' | 'tie';
};

/** Parsed PUT request body for qualification match updates */
export type QualificationPutData = {
  matchId: string;
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
  /** Prisma model name for qualification records (e.g., 'bMQualification') */
  qualificationModel: string;
  /** Prisma model name for match records (e.g., 'bMMatch') */
  matchModel: string;

  /** Logger instance name for structured logging */
  loggerName: string;
  /** Human-readable event name for error messages (e.g., 'battle mode') */
  eventDisplayName: string;

  /** Sort order for qualification standings query */
  qualificationOrderBy: Array<Record<string, 'asc' | 'desc'>>;

  /** Whether POST endpoint requires authentication */
  postRequiresAuth: boolean;
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

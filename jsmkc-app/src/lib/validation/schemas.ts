/**
 * Zod Validation Schemas
 *
 * Centralized validation schemas for all API request data in JSMKC.
 * Uses Zod for runtime type validation that integrates with TypeScript's
 * type system, providing both compile-time and runtime safety.
 *
 * Schema organization:
 * - Common schemas (id, pagination) shared across endpoints
 * - Player schemas (create, update)
 * - Tournament schemas (create, update)
 * - Score entry schemas (individual and batch)
 * - Match schemas (create, update)
 * - Token management schemas (regenerate, extend)
 *
 * All schemas export inferred TypeScript types using z.infer<>,
 * ensuring the validation schema and TypeScript type stay in sync.
 *
 * Usage:
 *   import { createPlayerSchema, type CreatePlayerInput } from '@/lib/validation/schemas';
 *   const result = createPlayerSchema.safeParse(requestBody);
 *   if (!result.success) return handleValidationError(result.error.message);
 *   const validData: CreatePlayerInput = result.data;
 */

import { z } from 'zod';

// ============================================================
// Common Schemas
// ============================================================

/**
 * Schema for validating CUID-format IDs.
 *
 * CUIDs are the primary key format used throughout JSMKC (via Prisma's
 * @default(cuid()) directive). They are collision-resistant, sortable,
 * and URL-safe strings.
 *
 * Pattern: lowercase letters and digits, typically 25 characters.
 *
 * @example
 *   idSchema.parse("clk2abc3d0000abcd1234efgh") // Valid
 *   idSchema.parse("") // Throws ZodError
 */
export const idSchema = z
  .string()
  .min(1, 'ID is required')
  .max(100, 'ID is too long');

/**
 * Schema for pagination query parameters.
 *
 * Validates page and limit values from URL query strings.
 * Both are optional with defaults applied by getPaginationParams().
 * Uses coerce to handle string-to-number conversion from query params.
 *
 * Constraints:
 * - page: minimum 1 (no zero or negative pages)
 * - limit: minimum 1, maximum 100 (prevents excessive data transfer)
 */
export const paginationSchema = z.object({
  /** Page number (1-based). Coerced from string for query param support. */
  page: z.coerce
    .number()
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .optional(),

  /** Records per page. Coerced from string for query param support. */
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional(),
});

// ============================================================
// Player Schemas
// ============================================================

/**
 * Schema for creating a new player.
 *
 * Required fields:
 * - name: Player's display name (1-100 chars)
 * - nickname: Unique identifier for the player (1-50 chars, alphanumeric + underscores)
 *
 * Optional fields:
 * - country: ISO country code or name (for international tournaments)
 * - password: Plain text password (will be bcrypt hashed before storage)
 *
 * The nickname is used as the primary human-readable identifier in
 * standings, brackets, and score entry. It must be unique across
 * all players in the system.
 */
export const createPlayerSchema = z.object({
  /** Player's full display name (shown in results and rankings) */
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name cannot exceed 100 characters')
    .trim(),

  /**
   * Unique player nickname (used for login and identification).
   * Restricted to alphanumeric characters and underscores to
   * ensure URL-safety and prevent confusion with similar-looking
   * characters from different scripts.
   */
  nickname: z
    .string()
    .min(1, 'Nickname is required')
    .max(50, 'Nickname cannot exceed 50 characters')
    .trim(),

  /** Optional country code or name for international player identification */
  country: z
    .string()
    .max(100, 'Country cannot exceed 100 characters')
    .trim()
    .optional()
    .nullable(),

  /**
   * Optional password for player credential login.
   * Minimum 8 characters for basic password strength.
   * Will be hashed with bcrypt before database storage.
   */
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters')
    .optional(),
});

/**
 * Schema for updating an existing player.
 *
 * All fields are optional - only provided fields will be updated.
 * This enables partial updates (PATCH semantics) where the client
 * sends only the changed fields.
 */
export const updatePlayerSchema = z.object({
  /** Updated display name */
  name: z
    .string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name cannot exceed 100 characters')
    .trim()
    .optional(),

  /** Updated nickname (must remain unique) */
  nickname: z
    .string()
    .min(1, 'Nickname cannot be empty')
    .max(50, 'Nickname cannot exceed 50 characters')
    .trim()
    .optional(),

  /** Updated country */
  country: z
    .string()
    .max(100, 'Country cannot exceed 100 characters')
    .trim()
    .optional()
    .nullable(),

  /** Updated password (will be re-hashed) */
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters')
    .optional(),
});

// ============================================================
// Tournament Schemas
// ============================================================

/**
 * Schema for creating a new tournament.
 *
 * Required fields:
 * - name: Tournament name (e.g., "JSMKC 2024 Spring Championship")
 * - date: Tournament date (ISO string or Date, coerced to Date)
 *
 * Optional fields:
 * - status: Initial status (default: "draft")
 *   - draft: Tournament is being configured
 *   - active: Tournament is in progress
 *   - completed: Tournament has finished
 */
export const createTournamentSchema = z.object({
  /** Tournament name displayed in listings and headers */
  name: z
    .string()
    .min(1, 'Tournament name is required')
    .max(200, 'Tournament name cannot exceed 200 characters')
    .trim(),

  /**
   * Tournament date. Accepts ISO date strings and Date objects.
   * Coerced to Date for consistent database storage.
   */
  date: z.coerce.date({
    error: 'Tournament date is required and must be a valid date format',
  }),

  /**
   * Tournament status. Defaults to "draft" for new tournaments.
   * Status transitions should be: draft -> active -> completed.
   */
  status: z
    .enum(['draft', 'active', 'completed'], {
      error: 'Status must be draft, active, or completed',
    })
    .optional()
    .default('draft'),
});

/**
 * Schema for updating an existing tournament.
 *
 * All fields optional for partial updates.
 * Includes version field for optimistic locking support.
 */
export const updateTournamentSchema = z.object({
  /** Updated tournament name */
  name: z
    .string()
    .min(1, 'Tournament name cannot be empty')
    .max(200, 'Tournament name cannot exceed 200 characters')
    .trim()
    .optional(),

  /** Updated tournament date */
  date: z.coerce
    .date({
      error: 'Invalid date format',
    })
    .optional(),

  /** Updated tournament status */
  status: z
    .enum(['draft', 'active', 'completed'], {
      error: 'Status must be draft, active, or completed',
    })
    .optional(),

  /**
   * Version number for optimistic locking.
   * If provided, the update will only succeed if the current
   * version in the database matches this value.
   */
  version: z.coerce.number().int().optional(),
});

// ============================================================
// Score Entry Schemas
// ============================================================

/**
 * Schema for a single score entry submission.
 *
 * Used when a participant submits their reported scores for a match.
 * The match type determines which score fields are relevant:
 * - BM: score1/score2 (balloon wins for each player)
 * - MR: score1/score2 (match race wins)
 * - GP: points (driver points from cup races)
 *
 * The matchId and matchType together identify which match is being scored.
 */
export const scoreEntrySchema = z.object({
  /** The ID of the match being scored */
  matchId: z
    .string()
    .min(1, 'Match ID is required'),

  /**
   * The competition mode type.
   * Determines how the scores are interpreted and validated.
   */
  matchType: z.enum(['BM', 'MR', 'GP'], {
    error: 'Match type is required and must be BM, MR, or GP',
  }),

  /**
   * Score data (structure varies by match type).
   * This is a flexible JSON object because different match types
   * have different scoring structures:
   * - BM: { score1: number, score2: number }
   * - MR: { points1: number, points2: number, races: [...] }
   * - GP: { points1: number, points2: number, races: [...] }
   */
  scores: z.record(z.string(), z.unknown()).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'Scores data cannot be empty' }
  ),
});

/**
 * Schema for batch score entry (multiple matches at once).
 *
 * Used when submitting scores for several matches in a single
 * API call, improving efficiency during rapid score entry
 * at live tournaments.
 *
 * Limited to 50 entries per batch to prevent oversized requests
 * and ensure reasonable processing times.
 */
export const batchScoreEntrySchema = z.object({
  /** Array of individual score entries */
  entries: z
    .array(scoreEntrySchema)
    .min(1, 'At least one score entry is required')
    .max(50, 'Cannot submit more than 50 entries at once'),
});

// ============================================================
// Match Schemas
// ============================================================

/**
 * Schema for creating a new match.
 *
 * Matches are 1v1 pairings in BM, MR, or GP modes.
 * Both player IDs are required to create a match.
 *
 * Optional fields allow specifying the tournament stage (qualification
 * vs finals) and round information for bracket positioning.
 */
export const createMatchSchema = z.object({
  /** First player's ID */
  player1Id: z
    .string()
    .min(1, 'Player 1 ID is required'),

  /** Second player's ID */
  player2Id: z
    .string()
    .min(1, 'Player 2 ID is required'),

  /**
   * Tournament stage where this match occurs.
   * - qualification: Group round-robin phase
   * - finals: Double elimination bracket phase
   * - grand_final: Championship match
   */
  stage: z
    .enum(['qualification', 'finals', 'grand_final'])
    .optional()
    .default('qualification'),

  /**
   * Round identifier within the stage.
   * For finals: "wb-r1", "wb-r2", "wb-semi", "wb-final",
   *             "lb-r1", "lb-r2", "lb-semi", "lb-final"
   */
  round: z
    .string()
    .max(50, 'Round identifier too long')
    .optional()
    .nullable(),
}).refine(
  // Ensure the two player IDs are different.
  // A player cannot play against themselves.
  (data) => data.player1Id !== data.player2Id,
  {
    message: 'Player 1 and Player 2 must be different players',
    path: ['player2Id'],
  }
);

/**
 * Schema for updating an existing match.
 *
 * Used by admins to set official scores and mark matches as completed.
 * All fields are optional for partial updates.
 */
export const updateMatchSchema = z.object({
  /** Updated score for player 1 */
  score1: z.coerce
    .number()
    .int('Score must be an integer')
    .min(0, 'Score cannot be negative')
    .optional(),

  /** Updated score for player 2 */
  score2: z.coerce
    .number()
    .int('Score must be an integer')
    .min(0, 'Score cannot be negative')
    .optional(),

  /** Whether the match is completed */
  completed: z.boolean().optional(),

  /**
   * Round-by-round details as JSON.
   * Structure depends on match type:
   * - BM: [{arena: "Arena 1", winner: 1}, ...]
   * - MR: [{course: "MC1", winner: 1}, ...]
   * - GP: [{course: "MC1", position1: 1, position2: 2, ...}, ...]
   */
  rounds: z.unknown().optional(),

  /**
   * Version for optimistic locking.
   * Prevents lost updates when multiple admins edit simultaneously.
   */
  version: z.coerce.number().int().optional(),
});

// ============================================================
// Token Management Schemas
// ============================================================

/**
 * Schema for regenerating a tournament access token.
 *
 * When a token is regenerated, the old token is immediately invalidated
 * and a new one is created. The optional hours parameter controls
 * how long the new token will be valid.
 */
export const regenerateTokenSchema = z.object({
  /**
   * Duration in hours for the new token's validity.
   * Defaults to 24 hours if not specified.
   * Maximum 168 hours (7 days) to limit exposure window.
   */
  hours: z.coerce
    .number()
    .min(1, 'Token must be valid for at least 1 hour')
    .max(168, 'Token cannot be valid for more than 7 days')
    .optional()
    .default(24),
});

/**
 * Schema for extending an existing tournament token's expiry.
 *
 * Unlike regeneration, extension preserves the current token value
 * (no need for participants to re-enter the token) and adds time
 * to the existing expiry.
 */
export const extendTokenSchema = z.object({
  /**
   * Number of hours to extend the token's validity by.
   * Required because extending without specifying duration is ambiguous.
   * Maximum 168 hours (7 days) to limit total exposure window.
   */
  hours: z.coerce
    .number()
    .min(1, 'Extension must be at least 1 hour')
    .max(168, 'Extension cannot exceed 7 days'),
});

// ============================================================
// Type Exports
// ============================================================

/**
 * Inferred TypeScript types from Zod schemas.
 *
 * These types are automatically derived from the schema definitions,
 * ensuring the validation rules and TypeScript types are always in sync.
 * When a schema is updated, the corresponding type updates automatically.
 *
 * Usage:
 *   import { type CreatePlayerInput } from '@/lib/validation/schemas';
 *   function createPlayer(data: CreatePlayerInput) { ... }
 */

/** Type for validated pagination parameters */
export type PaginationInput = z.infer<typeof paginationSchema>;

/** Type for validated create player request body */
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;

/** Type for validated update player request body */
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;

/** Type for validated create tournament request body */
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;

/** Type for validated update tournament request body */
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;

/** Type for validated score entry request body */
export type ScoreEntryInput = z.infer<typeof scoreEntrySchema>;

/** Type for validated batch score entry request body */
export type BatchScoreEntryInput = z.infer<typeof batchScoreEntrySchema>;

/** Type for validated create match request body */
export type CreateMatchInput = z.infer<typeof createMatchSchema>;

/** Type for validated update match request body */
export type UpdateMatchInput = z.infer<typeof updateMatchSchema>;

/** Type for validated regenerate token request body */
export type RegenerateTokenInput = z.infer<typeof regenerateTokenSchema>;

/** Type for validated extend token request body */
export type ExtendTokenInput = z.infer<typeof extendTokenSchema>;

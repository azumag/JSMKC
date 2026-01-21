import { z } from 'zod';

// Common validation schemas
export const idSchema = z.string().min(1, 'ID is required');

export const paginationSchema = z.object({
  page: z.string().transform(Number).refine(n => n > 0, 'Page must be greater than 0').default(() => 1),
  limit: z.string().transform(Number).refine(n => n > 0 && n <= 100, 'Limit must be between 1 and 100').default(() => 10),
});

// Player validation schemas
export const createPlayerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  nickname: z.string().min(1, 'Nickname is required').max(50, 'Nickname too long'),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  discordId: z.string().min(1, 'Discord ID is required').max(20, 'Discord ID too long'),
});

export const updatePlayerSchema = createPlayerSchema.partial().extend({
  id: idSchema,
});

// Tournament validation schemas
export const createTournamentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  location: z.string().max(200, 'Location too long').optional(),
  gameMode: z.enum(['ta', 'bm', 'mr', 'gp']).refine(() => true, {
    message: 'Invalid game mode',
  }),
  maxPlayers: z.string().transform(Number).refine(n => n > 0 && n <= 1000, 'Max players must be between 1 and 1000').default(() => 100),
});

export const updateTournamentSchema = createTournamentSchema.partial().extend({
  id: idSchema,
});

// Score validation schemas
export const scoreEntrySchema = z.object({
  playerId: idSchema,
  matchId: idSchema,
  score: z.number().min(0, 'Score cannot be negative'),
  character: z.string().max(50, 'Character name too long').optional(),
  isForfeit: z.boolean().default(false),
  notes: z.string().max(200, 'Notes too long').optional(),
});

export const batchScoreEntrySchema = z.array(scoreEntrySchema).max(100, 'Too many score entries at once');

// Match validation schemas
export const createMatchSchema = z.object({
  tournamentId: idSchema,
  player1Id: idSchema,
  player2Id: idSchema,
  round: z.string().min(1, 'Round is required'),
  stage: z.string().min(1, 'Stage is required'),
  scheduledTime: z.string().optional(),
});

export const updateMatchSchema = z.object({
  player1Score: z.number().min(0).optional(),
  player2Score: z.number().min(0).optional(),
  winnerId: idSchema.optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  completedAt: z.string().optional(),
});

// Token validation schemas
export const regenerateTokenSchema = z.object({
  tournamentId: idSchema,
});

export const extendTokenSchema = z.object({
  tournamentId: idSchema,
  days: z.string().transform(Number).refine(n => n > 0 && n <= 365, 'Days must be between 1 and 365').default(() => 7),
});

// Export validation middleware
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: Request) => {
    try {
      if (req.method === 'GET') {
        const url = new URL(req.url);
        const searchParams = Object.fromEntries(url.searchParams);
        return schema.parse(searchParams);
      } else {
        return schema.parse(req.body);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
        throw new Error(`Validation failed: ${errorMessages.join(', ')}`);
      }
      throw error;
    }
  };
}

// Export type-safe validation functions
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
export type ScoreEntryInput = z.infer<typeof scoreEntrySchema>;
export type BatchScoreEntryInput = z.infer<typeof batchScoreEntrySchema>;
export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type UpdateMatchInput = z.infer<typeof updateMatchSchema>;
export type RegenerateTokenInput = z.infer<typeof regenerateTokenSchema>;
export type ExtendTokenInput = z.infer<typeof extendTokenSchema>;
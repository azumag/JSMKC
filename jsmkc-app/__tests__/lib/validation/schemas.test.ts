/**
 * @module schemas.test
 *
 * Test suite for Zod validation schemas (`@/lib/validation/schemas`).
 *
 * Covers:
 * - Common schemas:
 *   - idSchema: valid IDs, empty/null/undefined rejection
 *   - paginationSchema: optional page/limit with coercion, boundary validation
 * - Player schemas:
 *   - createPlayerSchema: required name/nickname, optional country/password, max-length constraints
 *   - updatePlayerSchema: all fields optional, inherited validation rules
 * - Tournament schemas:
 *   - createTournamentSchema: required name/date, optional status enum (draft/active/completed)
 *   - updateTournamentSchema: all fields optional, version for optimistic locking
 * - Score schemas:
 *   - scoreEntrySchema: required matchId/matchType/scores, matchType enum (BM/MR/GP),
 *     scores as non-empty record
 *   - batchScoreEntrySchema: entries array, min 1, max 50
 * - Match schemas:
 *   - createMatchSchema: required player1Id/player2Id, optional stage enum/round,
 *     refinement that players must differ
 *   - updateMatchSchema: optional score1/score2/completed/rounds/version
 * - Token schemas:
 *   - regenerateTokenSchema: hours (1-168, default 24)
 *   - extendTokenSchema: hours (1-168, required)
 */
import {
  idSchema,
  paginationSchema,
  createPlayerSchema,
  updatePlayerSchema,
  createTournamentSchema,
  updateTournamentSchema,
  scoreEntrySchema,
  batchScoreEntrySchema,
  createMatchSchema,
  updateMatchSchema,
  regenerateTokenSchema,
  extendTokenSchema,
} from '@/lib/validation/schemas';

describe('Validation Schemas', () => {
  describe('Common Schemas', () => {
    describe('idSchema', () => {
      it('should accept valid IDs', () => {
        expect(() => idSchema.parse('123')).not.toThrow();
        expect(() => idSchema.parse('abc-123_def')).not.toThrow();
        expect(() => idSchema.parse('user@example.com')).not.toThrow();
      });

      it('should reject empty strings', () => {
        expect(() => idSchema.parse('')).toThrow();
      });

      it('should reject null', () => {
        expect(() => idSchema.parse(null)).toThrow();
      });

      it('should reject undefined', () => {
        expect(() => idSchema.parse(undefined)).toThrow();
      });

      it('should reject strings longer than 100 characters', () => {
        expect(() => idSchema.parse('a'.repeat(101))).toThrow();
      });

      it('should accept strings at maximum length', () => {
        expect(() => idSchema.parse('a'.repeat(100))).not.toThrow();
      });
    });

    describe('paginationSchema', () => {
      it('should accept valid pagination parameters', () => {
        // page and limit use z.coerce.number() so string and number inputs both work
        expect(() => paginationSchema.parse({ page: '1', limit: '10' })).not.toThrow();
        expect(() => paginationSchema.parse({ page: '5', limit: '50' })).not.toThrow();
      });

      it('should accept empty object (both fields are optional)', () => {
        // Both page and limit are optional with no defaults in the schema
        const result = paginationSchema.parse({});
        expect(result.page).toBeUndefined();
        expect(result.limit).toBeUndefined();
      });

      it('should transform string numbers to numbers via coerce', () => {
        const result = paginationSchema.parse({ page: '5', limit: '20' });
        expect(typeof result.page).toBe('number');
        expect(typeof result.limit).toBe('number');
        expect(result.page).toBe(5);
        expect(result.limit).toBe(20);
      });

      it('should reject page <= 0', () => {
        expect(() => paginationSchema.parse({ page: '0', limit: '10' }))
          .toThrow();
        expect(() => paginationSchema.parse({ page: '-1', limit: '10' }))
          .toThrow();
      });

      it('should reject limit <= 0', () => {
        expect(() => paginationSchema.parse({ page: '1', limit: '0' }))
          .toThrow();
        expect(() => paginationSchema.parse({ page: '1', limit: '-1' }))
          .toThrow();
      });

      it('should reject limit > 100', () => {
        expect(() => paginationSchema.parse({ page: '1', limit: '101' }))
          .toThrow();
      });

      it('should reject invalid number formats', () => {
        expect(() => paginationSchema.parse({ page: 'abc', limit: '10' })).toThrow();
        expect(() => paginationSchema.parse({ page: '1', limit: 'xyz' })).toThrow();
      });

      it('should accept numeric values directly', () => {
        const result = paginationSchema.parse({ page: 3, limit: 25 });
        expect(result.page).toBe(3);
        expect(result.limit).toBe(25);
      });
    });
  });

  describe('Player Schemas', () => {
    describe('createPlayerSchema', () => {
      // Valid player data matching source schema: name (required), nickname (required),
      // country (optional/nullable), password (optional, min 8 chars)
      const validPlayer = {
        name: 'Test Player',
        nickname: 'testuser',
      };

      it('should accept valid player data with required fields only', () => {
        expect(() => createPlayerSchema.parse(validPlayer)).not.toThrow();
      });

      it('should accept player with optional country', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, country: 'Japan' })).not.toThrow();
      });

      it('should accept player with null country', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, country: null })).not.toThrow();
      });

      it('should accept player with optional password', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, password: 'securepass123' })).not.toThrow();
      });

      it('should reject missing name', () => {
        const { name: _name, ...playerWithoutName } = validPlayer;
        expect(() => createPlayerSchema.parse(playerWithoutName))
          .toThrow();
      });

      it('should reject missing nickname', () => {
        const { nickname: _nickname, ...playerWithoutNickname } = validPlayer;
        expect(() => createPlayerSchema.parse(playerWithoutNickname))
          .toThrow();
      });

      it('should reject name > 100 characters', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, name: 'a'.repeat(101) }))
          .toThrow();
      });

      it('should reject nickname > 50 characters', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, nickname: 'a'.repeat(51) }))
          .toThrow();
      });

      it('should reject country > 100 characters', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, country: 'a'.repeat(101) }))
          .toThrow();
      });

      it('should reject password shorter than 8 characters', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, password: 'short' }))
          .toThrow();
      });

      it('should reject password longer than 128 characters', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, password: 'a'.repeat(129) }))
          .toThrow();
      });

      it('should accept minimum length values', () => {
        expect(() => createPlayerSchema.parse({
          name: 'a',
          nickname: 'b',
        })).not.toThrow();
      });

      it('should accept maximum length values', () => {
        expect(() => createPlayerSchema.parse({
          name: 'a'.repeat(100),
          nickname: 'b'.repeat(50),
          country: 'c'.repeat(100),
          password: 'p'.repeat(128),
        })).not.toThrow();
      });

      it('should trim whitespace from name and nickname', () => {
        const result = createPlayerSchema.parse({
          name: '  Test Player  ',
          nickname: '  testuser  ',
        });
        expect(result.name).toBe('Test Player');
        expect(result.nickname).toBe('testuser');
      });
    });

    describe('updatePlayerSchema', () => {
      it('should accept valid player update with all fields', () => {
        expect(() => updatePlayerSchema.parse({
          name: 'Updated Name',
          nickname: 'updated-user',
          country: 'USA',
          password: 'newpassword123',
        })).not.toThrow();
      });

      it('should accept partial updates (all fields are optional)', () => {
        expect(() => updatePlayerSchema.parse({ name: 'New Name' })).not.toThrow();
        expect(() => updatePlayerSchema.parse({ nickname: 'new-nick' })).not.toThrow();
        expect(() => updatePlayerSchema.parse({ country: 'Japan' })).not.toThrow();
        expect(() => updatePlayerSchema.parse({ password: 'newpass12345' })).not.toThrow();
      });

      it('should accept empty object (all fields optional)', () => {
        expect(() => updatePlayerSchema.parse({})).not.toThrow();
      });

      it('should accept null country', () => {
        expect(() => updatePlayerSchema.parse({ country: null })).not.toThrow();
      });

      it('should apply same validation rules as createPlayerSchema', () => {
        // name cannot exceed 100 characters
        expect(() => updatePlayerSchema.parse({ name: 'a'.repeat(101) }))
          .toThrow();
        // nickname cannot exceed 50 characters
        expect(() => updatePlayerSchema.parse({ nickname: 'a'.repeat(51) }))
          .toThrow();
        // password must be at least 8 characters if provided
        expect(() => updatePlayerSchema.parse({ password: 'short' }))
          .toThrow();
      });

      it('should reject empty name if provided', () => {
        expect(() => updatePlayerSchema.parse({ name: '' })).toThrow();
      });

      it('should reject empty nickname if provided', () => {
        expect(() => updatePlayerSchema.parse({ nickname: '' })).toThrow();
      });
    });
  });

  describe('Tournament Schemas', () => {
    // Source createTournamentSchema: name (required), date (coerced Date, required),
    // status (enum draft/active/completed, optional, default 'draft')
    const validTournament = {
      name: 'Test Tournament',
      date: '2024-01-01',
    };

    describe('createTournamentSchema', () => {
      it('should accept valid tournament data', () => {
        expect(() => createTournamentSchema.parse(validTournament)).not.toThrow();
      });

      it('should accept tournament with explicit status', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, status: 'active' })).not.toThrow();
        expect(() => createTournamentSchema.parse({ ...validTournament, status: 'completed' })).not.toThrow();
      });

      it('should apply default status of draft', () => {
        const result = createTournamentSchema.parse(validTournament);
        expect(result.status).toBe('draft');
      });

      it('should coerce date string to Date object', () => {
        const result = createTournamentSchema.parse(validTournament);
        expect(result.date).toBeInstanceOf(Date);
      });

      it('should reject missing name', () => {
        expect(() => createTournamentSchema.parse({ date: '2024-01-01' }))
          .toThrow();
      });

      it('should reject missing date', () => {
        expect(() => createTournamentSchema.parse({ name: 'Test' }))
          .toThrow();
      });

      it('should reject invalid status values', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, status: 'invalid' }))
          .toThrow();
        expect(() => createTournamentSchema.parse({ ...validTournament, status: 'DRAFT' }))
          .toThrow();
      });

      it('should accept all valid status values', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, status: 'draft' })).not.toThrow();
        expect(() => createTournamentSchema.parse({ ...validTournament, status: 'active' })).not.toThrow();
        expect(() => createTournamentSchema.parse({ ...validTournament, status: 'completed' })).not.toThrow();
      });

      it('should reject name > 200 characters', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, name: 'a'.repeat(201) }))
          .toThrow();
      });

      it('should reject empty name', () => {
        expect(() => createTournamentSchema.parse({ name: '', date: '2024-01-01' }))
          .toThrow();
      });

      it('should reject invalid date format', () => {
        expect(() => createTournamentSchema.parse({ name: 'Test', date: 'not-a-date' }))
          .toThrow();
      });

      it('should accept Date objects directly', () => {
        expect(() => createTournamentSchema.parse({
          name: 'Test',
          date: new Date('2024-06-15'),
        })).not.toThrow();
      });

      it('should accept minimum and maximum name lengths', () => {
        expect(() => createTournamentSchema.parse({
          name: 'a',
          date: '2024-01-01',
        })).not.toThrow();

        expect(() => createTournamentSchema.parse({
          name: 'a'.repeat(200),
          date: '2024-01-01',
        })).not.toThrow();
      });
    });

    describe('updateTournamentSchema', () => {
      it('should accept valid tournament update with all fields', () => {
        expect(() => updateTournamentSchema.parse({
          name: 'Updated Tournament',
          date: '2024-06-15',
          status: 'active',
          version: 1,
        })).not.toThrow();
      });

      it('should accept partial updates (all fields optional)', () => {
        expect(() => updateTournamentSchema.parse({ name: 'New Name' })).not.toThrow();
        expect(() => updateTournamentSchema.parse({ status: 'completed' })).not.toThrow();
        expect(() => updateTournamentSchema.parse({ date: '2024-12-31' })).not.toThrow();
        expect(() => updateTournamentSchema.parse({ version: 5 })).not.toThrow();
      });

      it('should accept empty object (all fields optional)', () => {
        expect(() => updateTournamentSchema.parse({})).not.toThrow();
      });

      it('should apply same validation rules as createTournamentSchema', () => {
        // name cannot exceed 200 characters
        expect(() => updateTournamentSchema.parse({ name: 'a'.repeat(201) }))
          .toThrow();
        // status must be a valid enum value
        expect(() => updateTournamentSchema.parse({ status: 'invalid' }))
          .toThrow();
      });

      it('should reject empty name if provided', () => {
        expect(() => updateTournamentSchema.parse({ name: '' })).toThrow();
      });

      it('should coerce version to integer', () => {
        const result = updateTournamentSchema.parse({ version: '3' });
        expect(result.version).toBe(3);
      });
    });
  });

  describe('Score Schemas', () => {
    // Source scoreEntrySchema: matchId (required string), matchType (enum BM/MR/GP),
    // scores (non-empty record of string->unknown)
    const validScoreEntry = {
      matchId: 'match-456',
      matchType: 'BM' as const,
      scores: { score1: 3, score2: 1 },
    };

    describe('scoreEntrySchema', () => {
      it('should accept valid score entry', () => {
        expect(() => scoreEntrySchema.parse(validScoreEntry)).not.toThrow();
      });

      it('should accept all valid match types', () => {
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, matchType: 'BM' })).not.toThrow();
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, matchType: 'MR' })).not.toThrow();
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, matchType: 'GP' })).not.toThrow();
      });

      it('should reject invalid match type', () => {
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, matchType: 'TA' })).toThrow();
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, matchType: 'invalid' })).toThrow();
      });

      it('should reject missing matchId', () => {
        const { matchId: _matchId, ...entryWithoutMatch } = validScoreEntry;
        expect(() => scoreEntrySchema.parse(entryWithoutMatch)).toThrow();
      });

      it('should reject empty matchId', () => {
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, matchId: '' })).toThrow();
      });

      it('should reject missing matchType', () => {
        const { matchType: _matchType, ...entryWithoutType } = validScoreEntry;
        expect(() => scoreEntrySchema.parse(entryWithoutType)).toThrow();
      });

      it('should reject missing scores', () => {
        const { scores: _scores, ...entryWithoutScores } = validScoreEntry;
        expect(() => scoreEntrySchema.parse(entryWithoutScores)).toThrow();
      });

      it('should reject empty scores object', () => {
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, scores: {} })).toThrow();
      });

      it('should accept various score data structures', () => {
        // BM style scores
        expect(() => scoreEntrySchema.parse({
          matchId: 'm1',
          matchType: 'BM',
          scores: { score1: 3, score2: 1 },
        })).not.toThrow();

        // MR style scores with races
        expect(() => scoreEntrySchema.parse({
          matchId: 'm2',
          matchType: 'MR',
          scores: { points1: 5, points2: 3, races: [] },
        })).not.toThrow();

        // GP style scores
        expect(() => scoreEntrySchema.parse({
          matchId: 'm3',
          matchType: 'GP',
          scores: { points1: 9, points2: 6 },
        })).not.toThrow();
      });
    });

    describe('batchScoreEntrySchema', () => {
      it('should accept valid batch of score entries', () => {
        const batch = {
          entries: [
            { matchId: 'm1', matchType: 'BM' as const, scores: { score1: 3, score2: 1 } },
            { matchId: 'm2', matchType: 'MR' as const, scores: { score1: 2, score2: 3 } },
            { matchId: 'm3', matchType: 'GP' as const, scores: { points1: 9 } },
          ],
        };
        expect(() => batchScoreEntrySchema.parse(batch)).not.toThrow();
      });

      it('should reject empty entries array (min 1 required)', () => {
        expect(() => batchScoreEntrySchema.parse({ entries: [] })).toThrow();
      });

      it('should reject entries array with more than 50 items', () => {
        const entries = Array.from({ length: 51 }, (_, i) => ({
          matchId: `m${i}`,
          matchType: 'BM' as const,
          scores: { score1: 1, score2: 0 },
        }));
        expect(() => batchScoreEntrySchema.parse({ entries }))
          .toThrow();
      });

      it('should accept exactly 50 entries', () => {
        const entries = Array.from({ length: 50 }, (_, i) => ({
          matchId: `m${i}`,
          matchType: 'BM' as const,
          scores: { score1: 1, score2: 0 },
        }));
        expect(() => batchScoreEntrySchema.parse({ entries })).not.toThrow();
      });

      it('should accept exactly 1 entry (minimum)', () => {
        expect(() => batchScoreEntrySchema.parse({
          entries: [{ matchId: 'm1', matchType: 'BM' as const, scores: { score1: 1 } }],
        })).not.toThrow();
      });

      it('should reject invalid score entries in batch', () => {
        const batch = {
          entries: [
            { matchId: 'm1', matchType: 'BM' as const, scores: { score1: 3, score2: 1 } },
            { matchId: '', matchType: 'BM' as const, scores: { score1: 1 } }, // Invalid: empty matchId
          ],
        };
        expect(() => batchScoreEntrySchema.parse(batch)).toThrow();
      });

      it('should reject non-object input', () => {
        expect(() => batchScoreEntrySchema.parse(null)).toThrow();
        expect(() => batchScoreEntrySchema.parse(undefined)).toThrow();
      });

      it('should reject missing entries field', () => {
        expect(() => batchScoreEntrySchema.parse({})).toThrow();
      });
    });
  });

  describe('Match Schemas', () => {
    // Source createMatchSchema: player1Id (required), player2Id (required),
    // stage (enum qualification/finals/grand_final, optional default 'qualification'),
    // round (optional string max 50, nullable).
    // Refinement: player1Id !== player2Id
    const validMatch = {
      player1Id: 'player-1',
      player2Id: 'player-2',
    };

    describe('createMatchSchema', () => {
      it('should accept valid match data with required fields only', () => {
        expect(() => createMatchSchema.parse(validMatch)).not.toThrow();
      });

      it('should accept match with explicit stage', () => {
        expect(() => createMatchSchema.parse({ ...validMatch, stage: 'finals' })).not.toThrow();
        expect(() => createMatchSchema.parse({ ...validMatch, stage: 'grand_final' })).not.toThrow();
      });

      it('should default stage to qualification', () => {
        const result = createMatchSchema.parse(validMatch);
        expect(result.stage).toBe('qualification');
      });

      it('should accept match with optional round', () => {
        expect(() => createMatchSchema.parse({ ...validMatch, round: 'wb-r1' })).not.toThrow();
        expect(() => createMatchSchema.parse({ ...validMatch, round: null })).not.toThrow();
      });

      it('should reject missing player1Id', () => {
        const { player1Id: _player1Id, ...matchWithoutPlayer1 } = validMatch;
        expect(() => createMatchSchema.parse(matchWithoutPlayer1)).toThrow();
      });

      it('should reject missing player2Id', () => {
        const { player2Id: _player2Id, ...matchWithoutPlayer2 } = validMatch;
        expect(() => createMatchSchema.parse(matchWithoutPlayer2)).toThrow();
      });

      it('should reject empty player1Id', () => {
        expect(() => createMatchSchema.parse({ ...validMatch, player1Id: '' })).toThrow();
      });

      it('should reject empty player2Id', () => {
        expect(() => createMatchSchema.parse({ ...validMatch, player2Id: '' })).toThrow();
      });

      it('should reject same player for both sides (refinement)', () => {
        expect(() => createMatchSchema.parse({
          player1Id: 'same-player',
          player2Id: 'same-player',
        })).toThrow();
      });

      it('should reject invalid stage values', () => {
        expect(() => createMatchSchema.parse({ ...validMatch, stage: 'invalid' })).toThrow();
        expect(() => createMatchSchema.parse({ ...validMatch, stage: 'FINALS' })).toThrow();
      });

      it('should accept all valid stage values', () => {
        expect(() => createMatchSchema.parse({ ...validMatch, stage: 'qualification' })).not.toThrow();
        expect(() => createMatchSchema.parse({ ...validMatch, stage: 'finals' })).not.toThrow();
        expect(() => createMatchSchema.parse({ ...validMatch, stage: 'grand_final' })).not.toThrow();
      });

      it('should reject round longer than 50 characters', () => {
        expect(() => createMatchSchema.parse({ ...validMatch, round: 'a'.repeat(51) })).toThrow();
      });

      it('should accept various round identifiers', () => {
        expect(() => createMatchSchema.parse({ ...validMatch, round: 'wb-r1' })).not.toThrow();
        expect(() => createMatchSchema.parse({ ...validMatch, round: 'lb-semi' })).not.toThrow();
        expect(() => createMatchSchema.parse({ ...validMatch, round: 'wb-final' })).not.toThrow();
      });
    });

    describe('updateMatchSchema', () => {
      // Source updateMatchSchema: score1, score2 (coerced int >= 0),
      // completed (boolean), rounds (unknown), version (coerced int) - all optional
      it('should accept valid match update with all fields', () => {
        expect(() => updateMatchSchema.parse({
          score1: 3,
          score2: 2,
          completed: true,
          rounds: [{ arena: 'Arena 1', winner: 1 }],
          version: 1,
        })).not.toThrow();
      });

      it('should accept partial updates (all fields optional)', () => {
        expect(() => updateMatchSchema.parse({ score1: 5 })).not.toThrow();
        expect(() => updateMatchSchema.parse({ score2: 3 })).not.toThrow();
        expect(() => updateMatchSchema.parse({ completed: true })).not.toThrow();
        expect(() => updateMatchSchema.parse({ version: 2 })).not.toThrow();
      });

      it('should accept empty object (all fields optional)', () => {
        expect(() => updateMatchSchema.parse({})).not.toThrow();
      });

      it('should reject negative scores', () => {
        expect(() => updateMatchSchema.parse({ score1: -1 })).toThrow();
        expect(() => updateMatchSchema.parse({ score2: -1 })).toThrow();
      });

      it('should accept zero scores', () => {
        expect(() => updateMatchSchema.parse({ score1: 0 })).not.toThrow();
        expect(() => updateMatchSchema.parse({ score2: 0 })).not.toThrow();
      });

      it('should coerce string scores to numbers', () => {
        const result = updateMatchSchema.parse({ score1: '5', score2: '3' });
        expect(result.score1).toBe(5);
        expect(result.score2).toBe(3);
      });

      it('should accept completed as boolean', () => {
        expect(() => updateMatchSchema.parse({ completed: true })).not.toThrow();
        expect(() => updateMatchSchema.parse({ completed: false })).not.toThrow();
      });

      it('should accept rounds as any data structure', () => {
        // rounds is z.unknown() so accepts anything
        expect(() => updateMatchSchema.parse({ rounds: null })).not.toThrow();
        expect(() => updateMatchSchema.parse({ rounds: [] })).not.toThrow();
        expect(() => updateMatchSchema.parse({ rounds: { data: 'test' } })).not.toThrow();
      });

      it('should coerce version to integer', () => {
        const result = updateMatchSchema.parse({ version: '7' });
        expect(result.version).toBe(7);
      });

      it('should accept large scores', () => {
        expect(() => updateMatchSchema.parse({ score1: 999999 })).not.toThrow();
        expect(() => updateMatchSchema.parse({ score2: 999999 })).not.toThrow();
      });
    });
  });

  describe('Token Validation Schemas', () => {
    describe('regenerateTokenSchema', () => {
      // Source: { hours: coerce number, min 1, max 168, optional default 24 }
      it('should apply default hours of 24', () => {
        const result = regenerateTokenSchema.parse({});
        expect(result.hours).toBe(24);
      });

      it('should accept valid hours value', () => {
        expect(() => regenerateTokenSchema.parse({ hours: 48 })).not.toThrow();
        expect(() => regenerateTokenSchema.parse({ hours: '72' })).not.toThrow();
      });

      it('should reject hours < 1', () => {
        expect(() => regenerateTokenSchema.parse({ hours: 0 })).toThrow();
        expect(() => regenerateTokenSchema.parse({ hours: -1 })).toThrow();
      });

      it('should reject hours > 168 (7 days)', () => {
        expect(() => regenerateTokenSchema.parse({ hours: 169 })).toThrow();
      });

      it('should accept minimum and maximum hours', () => {
        expect(() => regenerateTokenSchema.parse({ hours: 1 })).not.toThrow();
        expect(() => regenerateTokenSchema.parse({ hours: 168 })).not.toThrow();
      });

      it('should coerce string hours to number', () => {
        const result = regenerateTokenSchema.parse({ hours: '48' });
        expect(result.hours).toBe(48);
      });

      it('should accept various valid hour values', () => {
        expect(() => regenerateTokenSchema.parse({ hours: 12 })).not.toThrow();
        expect(() => regenerateTokenSchema.parse({ hours: 24 })).not.toThrow();
        expect(() => regenerateTokenSchema.parse({ hours: 72 })).not.toThrow();
        expect(() => regenerateTokenSchema.parse({ hours: 168 })).not.toThrow();
      });
    });

    describe('extendTokenSchema', () => {
      // Source: { hours: coerce number, min 1, max 168, required }
      it('should accept valid hours', () => {
        expect(() => extendTokenSchema.parse({ hours: 24 })).not.toThrow();
        expect(() => extendTokenSchema.parse({ hours: '48' })).not.toThrow();
      });

      it('should reject missing hours', () => {
        expect(() => extendTokenSchema.parse({})).toThrow();
      });

      it('should reject hours < 1', () => {
        expect(() => extendTokenSchema.parse({ hours: 0 })).toThrow();
        expect(() => extendTokenSchema.parse({ hours: -1 })).toThrow();
      });

      it('should reject hours > 168 (7 days)', () => {
        expect(() => extendTokenSchema.parse({ hours: 169 })).toThrow();
      });

      it('should accept minimum and maximum hours', () => {
        expect(() => extendTokenSchema.parse({ hours: 1 })).not.toThrow();
        expect(() => extendTokenSchema.parse({ hours: 168 })).not.toThrow();
      });

      it('should coerce string hours to number', () => {
        const result = extendTokenSchema.parse({ hours: '72' });
        expect(result.hours).toBe(72);
      });

      it('should accept various valid hour values', () => {
        expect(() => extendTokenSchema.parse({ hours: 12 })).not.toThrow();
        expect(() => extendTokenSchema.parse({ hours: 24 })).not.toThrow();
        expect(() => extendTokenSchema.parse({ hours: 72 })).not.toThrow();
        expect(() => extendTokenSchema.parse({ hours: 120 })).not.toThrow();
      });
    });
  });
});

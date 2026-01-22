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
    });

    describe('paginationSchema', () => {
      it('should accept valid pagination parameters', () => {
        expect(() => paginationSchema.parse({ page: '1', limit: '10' })).not.toThrow();
        expect(() => paginationSchema.parse({ page: '5', limit: '50' })).not.toThrow();
      });

      it('should apply default values when parameters are missing', () => {
        const result = paginationSchema.parse({});
        expect(result.page).toBe(1);
        expect(result.limit).toBe(10);
      });

      it('should transform string numbers to numbers', () => {
        const result = paginationSchema.parse({ page: '5', limit: '20' });
        expect(typeof result.page).toBe('number');
        expect(typeof result.limit).toBe('number');
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
    });
  });

  describe('Player Schemas', () => {
    describe('createPlayerSchema', () => {
      const validPlayer = {
        name: 'Test Player',
        nickname: 'testuser',
        email: 'test@example.com',
        discordId: '123456789012345678',
      };

      it('should accept valid player data', () => {
        expect(() => createPlayerSchema.parse(validPlayer)).not.toThrow();
      });

      it('should accept player with optional empty email', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, email: '' })).not.toThrow();
      });

      it('should accept player without email (optional)', () => {
        const { email, ...playerWithoutEmail } = validPlayer;
        expect(() => createPlayerSchema.parse(playerWithoutEmail)).not.toThrow();
      });

      it('should reject missing name', () => {
        const { name, ...playerWithoutName } = validPlayer;
        expect(() => createPlayerSchema.parse(playerWithoutName))
          .toThrow();
      });

      it('should reject missing nickname', () => {
        const { nickname, ...playerWithoutNickname } = validPlayer;
        expect(() => createPlayerSchema.parse(playerWithoutNickname))
          .toThrow();
      });

      it('should reject missing discordId', () => {
        const { discordId, ...playerWithoutDiscord } = validPlayer;
        expect(() => createPlayerSchema.parse(playerWithoutDiscord))
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

      it('should reject invalid email format', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, email: 'invalid-email' }))
          .toThrow();
        expect(() => createPlayerSchema.parse({ ...validPlayer, email: '@example.com' }))
          .toThrow();
      });

      it('should reject discordId > 20 characters', () => {
        expect(() => createPlayerSchema.parse({ ...validPlayer, discordId: 'a'.repeat(21) }))
          .toThrow();
      });

      it('should accept minimum length values', () => {
        expect(() => createPlayerSchema.parse({
          name: 'a',
          nickname: 'b',
          email: 'a@b.com',
          discordId: '1',
        })).not.toThrow();
      });

      it('should accept maximum length values', () => {
        expect(() => createPlayerSchema.parse({
          name: 'a'.repeat(100),
          nickname: 'b'.repeat(50),
          email: 'test@example.com',
          discordId: 'a'.repeat(20),
        })).not.toThrow();
      });
    });

    describe('updatePlayerSchema', () => {
      const validUpdate = {
        id: 'player-123',
        name: 'Updated Name',
        nickname: 'updated-user',
        email: 'updated@example.com',
        discordId: '987654321098765432',
      };

      it('should accept valid player update with all fields', () => {
        expect(() => updatePlayerSchema.parse(validUpdate)).not.toThrow();
      });

      it('should accept partial updates', () => {
        expect(() => updatePlayerSchema.parse({ id: 'player-123', name: 'New Name' })).not.toThrow();
        expect(() => updatePlayerSchema.parse({ id: 'player-123', nickname: 'new-nick' })).not.toThrow();
        expect(() => updatePlayerSchema.parse({ id: 'player-123', email: 'new@example.com' })).not.toThrow();
        expect(() => updatePlayerSchema.parse({ id: 'player-123', discordId: '12345' })).not.toThrow();
      });

      it('should reject update without ID', () => {
        const { id, ...updateWithoutId } = validUpdate;
        expect(() => updatePlayerSchema.parse(updateWithoutId)).toThrow();
      });

      it('should reject invalid ID', () => {
        expect(() => updatePlayerSchema.parse({ ...validUpdate, id: '' })).toThrow();
      });

      it('should apply same validation rules as createPlayerSchema', () => {
        expect(() => updatePlayerSchema.parse({ ...validUpdate, name: 'a'.repeat(101) }))
          .toThrow();
        expect(() => updatePlayerSchema.parse({ ...validUpdate, nickname: 'a'.repeat(51) }))
          .toThrow();
        expect(() => updatePlayerSchema.parse({ ...validUpdate, email: 'invalid' }))
          .toThrow();
      });
    });
  });

  describe('Tournament Schemas', () => {
    const validTournament = {
      name: 'Test Tournament',
      description: 'A test tournament',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      location: 'Tokyo',
      gameMode: 'ta' as const,
      maxPlayers: '100',
    };

    describe('createTournamentSchema', () => {
      it('should accept valid tournament data', () => {
        expect(() => createTournamentSchema.parse(validTournament)).not.toThrow();
      });

      it('should accept tournament without optional fields', () => {
        const { description, location, ...minimalTournament } = validTournament;
        expect(() => createTournamentSchema.parse(minimalTournament)).not.toThrow();
      });

      it('should apply default maxPlayers value', () => {
        const { maxPlayers, ...tournamentWithoutMax } = validTournament;
        const result = createTournamentSchema.parse(tournamentWithoutMax);
        expect(result.maxPlayers).toBe(100);
      });

      it('should reject missing name', () => {
        const { name, ...tournamentWithoutName } = validTournament;
        expect(() => createTournamentSchema.parse(tournamentWithoutName))
          .toThrow();
      });

      it('should reject missing startDate', () => {
        const { startDate, ...tournamentWithoutStart } = validTournament;
        expect(() => createTournamentSchema.parse(tournamentWithoutStart))
          .toThrow();
      });

      it('should reject missing endDate', () => {
        const { endDate, ...tournamentWithoutEnd } = validTournament;
        expect(() => createTournamentSchema.parse(tournamentWithoutEnd))
          .toThrow();
      });

      it('should reject missing gameMode', () => {
        const { gameMode, ...tournamentWithoutMode } = validTournament;
        expect(() => createTournamentSchema.parse(tournamentWithoutMode)).toThrow();
      });

      it('should reject invalid game modes', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, gameMode: 'invalid' as const }))
          .toThrow();
        expect(() => createTournamentSchema.parse({ ...validTournament, gameMode: 'TA' as const }))
          .toThrow();
      });

      it('should accept all valid game modes', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, gameMode: 'ta' as const })).not.toThrow();
        expect(() => createTournamentSchema.parse({ ...validTournament, gameMode: 'bm' as const })).not.toThrow();
        expect(() => createTournamentSchema.parse({ ...validTournament, gameMode: 'mr' as const })).not.toThrow();
        expect(() => createTournamentSchema.parse({ ...validTournament, gameMode: 'gp' as const })).not.toThrow();
      });

      it('should reject name > 100 characters', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, name: 'a'.repeat(101) }))
          .toThrow();
      });

      it('should reject description > 500 characters', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, description: 'a'.repeat(501) }))
          .toThrow();
      });

      it('should reject location > 200 characters', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, location: 'a'.repeat(201) }))
          .toThrow();
      });

      it('should reject maxPlayers < 1', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, maxPlayers: '0' }))
          .toThrow();
        expect(() => createTournamentSchema.parse({ ...validTournament, maxPlayers: '-1' }))
          .toThrow();
      });

      it('should reject maxPlayers > 1000', () => {
        expect(() => createTournamentSchema.parse({ ...validTournament, maxPlayers: '1001' }))
          .toThrow();
      });

      it('should accept minimum and maximum values', () => {
        expect(() => createTournamentSchema.parse({
          name: 'a',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          gameMode: 'ta' as const,
          maxPlayers: '1',
        })).not.toThrow();

        expect(() => createTournamentSchema.parse({
          name: 'a'.repeat(100),
          description: 'a'.repeat(500),
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          location: 'a'.repeat(200),
          gameMode: 'ta' as const,
          maxPlayers: '1000',
        })).not.toThrow();
      });
    });

    describe('updateTournamentSchema', () => {
      const validUpdate = {
        id: 'tournament-123',
        name: 'Updated Tournament',
        description: 'Updated description',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        location: 'New Location',
        gameMode: 'bm' as const,
        maxPlayers: '200',
      };

      it('should accept valid tournament update with all fields', () => {
        expect(() => updateTournamentSchema.parse(validUpdate)).not.toThrow();
      });

      it('should accept partial updates', () => {
        expect(() => updateTournamentSchema.parse({ id: 'tournament-123', name: 'New Name' })).not.toThrow();
        expect(() => updateTournamentSchema.parse({ id: 'tournament-123', gameMode: 'gp' as const })).not.toThrow();
        expect(() => updateTournamentSchema.parse({ id: 'tournament-123', maxPlayers: '150' })).not.toThrow();
      });

      it('should reject update without ID', () => {
        const { id, ...updateWithoutId } = validUpdate;
        expect(() => updateTournamentSchema.parse(updateWithoutId)).toThrow();
      });

      it('should reject invalid ID', () => {
        expect(() => updateTournamentSchema.parse({ ...validUpdate, id: '' }))
          .toThrow();
      });

      it('should apply same validation rules as createTournamentSchema', () => {
        expect(() => updateTournamentSchema.parse({ ...validUpdate, name: 'a'.repeat(101) }))
          .toThrow();
        expect(() => updateTournamentSchema.parse({ ...validUpdate, gameMode: 'invalid' as const }))
          .toThrow();
      });
    });
  });

  describe('Score Schemas', () => {
    const validScoreEntry = {
      playerId: 'player-123',
      matchId: 'match-456',
      score: 100,
      character: 'Mario',
      isForfeit: false,
      notes: 'Good run',
    };

    describe('scoreEntrySchema', () => {
      it('should accept valid score entry', () => {
        expect(() => scoreEntrySchema.parse(validScoreEntry)).not.toThrow();
      });

      it('should accept score entry without optional fields', () => {
        const { character, isForfeit, notes, ...minimalEntry } = validScoreEntry;
        expect(() => scoreEntrySchema.parse(minimalEntry)).not.toThrow();
      });

      it('should apply default isForfeit value', () => {
        const { isForfeit, ...entryWithoutForfeit } = validScoreEntry;
        const result = scoreEntrySchema.parse(entryWithoutForfeit);
        expect(result.isForfeit).toBe(false);
      });

      it('should reject missing playerId', () => {
        const { playerId, ...entryWithoutPlayer } = validScoreEntry;
        expect(() => scoreEntrySchema.parse(entryWithoutPlayer)).toThrow();
      });

      it('should reject missing matchId', () => {
        const { matchId, ...entryWithoutMatch } = validScoreEntry;
        expect(() => scoreEntrySchema.parse(entryWithoutMatch)).toThrow();
      });

      it('should reject missing score', () => {
        const { score, ...entryWithoutScore } = validScoreEntry;
        expect(() => scoreEntrySchema.parse(entryWithoutScore)).toThrow();
      });

      it('should reject negative scores', () => {
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, score: -1 }))
          .toThrow();
      });

      it('should reject character > 50 characters', () => {
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, character: 'a'.repeat(51) }))
          .toThrow();
      });

      it('should reject notes > 200 characters', () => {
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, notes: 'a'.repeat(201) }))
          .toThrow();
      });

      it('should accept isForfeit as boolean', () => {
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, isForfeit: true })).not.toThrow();
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, isForfeit: false })).not.toThrow();
      });

      it('should accept zero score', () => {
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, score: 0 })).not.toThrow();
      });

      it('should accept very large scores', () => {
        expect(() => scoreEntrySchema.parse({ ...validScoreEntry, score: 9999999 })).not.toThrow();
      });

      it('should accept minimum and maximum values', () => {
        expect(() => scoreEntrySchema.parse({
          playerId: '1',
          matchId: '2',
          score: 0,
          character: 'a',
          notes: 'a',
        })).not.toThrow();

        expect(() => scoreEntrySchema.parse({
          playerId: '1',
          matchId: '2',
          score: 999999,
          character: 'a'.repeat(50),
          notes: 'a'.repeat(200),
        })).not.toThrow();
      });
    });

    describe('batchScoreEntrySchema', () => {
      it('should accept valid batch of score entries', () => {
        const batch = [
          { ...validScoreEntry, playerId: 'p1', matchId: 'm1' },
          { ...validScoreEntry, playerId: 'p2', matchId: 'm2' },
          { ...validScoreEntry, playerId: 'p3', matchId: 'm3' },
        ];
        expect(() => batchScoreEntrySchema.parse(batch)).not.toThrow();
      });

      it('should accept empty array', () => {
        expect(() => batchScoreEntrySchema.parse([])).not.toThrow();
      });

      it('should reject array with more than 100 entries', () => {
        const batch = Array.from({ length: 101 }, (_, i) => ({
          ...validScoreEntry,
          playerId: `p${i}`,
          matchId: `m${i}`,
        }));
        expect(() => batchScoreEntrySchema.parse(batch))
          .toThrow();
      });

      it('should accept exactly 100 entries', () => {
        const batch = Array.from({ length: 100 }, (_, i) => ({
          ...validScoreEntry,
          playerId: `p${i}`,
          matchId: `m${i}`,
        }));
        expect(() => batchScoreEntrySchema.parse(batch)).not.toThrow();
      });

      it('should reject invalid score entries in batch', () => {
        const batch = [
          { ...validScoreEntry, playerId: 'p1', matchId: 'm1' },
          { ...validScoreEntry, playerId: 'p2', matchId: 'm2', score: -1 }, // Invalid score
        ];
        expect(() => batchScoreEntrySchema.parse(batch)).toThrow();
      });

      it('should reject non-array input', () => {
        expect(() => batchScoreEntrySchema.parse(null)).toThrow();
        expect(() => batchScoreEntrySchema.parse(undefined)).toThrow();
        expect(() => batchScoreEntrySchema.parse({})).toThrow();
      });
    });
  });

  describe('Match Schemas', () => {
    const validMatch = {
      tournamentId: 'tournament-123',
      player1Id: 'player-1',
      player2Id: 'player-2',
      round: '1',
      stage: 'finals',
      scheduledTime: '2024-01-01T10:00:00Z',
    };

    describe('createMatchSchema', () => {
      it('should accept valid match data', () => {
        expect(() => createMatchSchema.parse(validMatch)).not.toThrow();
      });

      it('should accept match without optional scheduledTime', () => {
        const { scheduledTime, ...matchWithoutTime } = validMatch;
        expect(() => createMatchSchema.parse(matchWithoutTime)).not.toThrow();
      });

      it('should reject missing tournamentId', () => {
        const { tournamentId, ...matchWithoutTournament } = validMatch;
        expect(() => createMatchSchema.parse(matchWithoutTournament)).toThrow();
      });

      it('should reject missing player1Id', () => {
        const { player1Id, ...matchWithoutPlayer1 } = validMatch;
        expect(() => createMatchSchema.parse(matchWithoutPlayer1)).toThrow();
      });

      it('should reject missing player2Id', () => {
        const { player2Id, ...matchWithoutPlayer2 } = validMatch;
        expect(() => createMatchSchema.parse(matchWithoutPlayer2)).toThrow();
      });

      it('should reject missing round', () => {
        const { round, ...matchWithoutRound } = validMatch;
        expect(() => createMatchSchema.parse(matchWithoutRound))
          .toThrow();
      });

      it('should reject missing stage', () => {
        const { stage, ...matchWithoutStage } = validMatch;
        expect(() => createMatchSchema.parse(matchWithoutStage))
          .toThrow();
      });

      it('should accept valid IDs for all fields', () => {
        expect(() => createMatchSchema.parse({
          tournamentId: 't-1',
          player1Id: 'p-1',
          player2Id: 'p-2',
          round: 'r-1',
          stage: 's-1',
        })).not.toThrow();
      });

      it('should accept various round and stage values', () => {
        expect(() => createMatchSchema.parse({ ...validMatch, round: 'Quarter Finals 1' })).not.toThrow();
        expect(() => createMatchSchema.parse({ ...validMatch, stage: 'Semi Finals' })).not.toThrow();
      });
    });

    describe('updateMatchSchema', () => {
      const validUpdate = {
        player1Score: 3,
        player2Score: 2,
        winnerId: 'player-1',
        status: 'completed' as const,
        completedAt: '2024-01-01T11:30:00Z',
      };

      it('should accept valid match update with all fields', () => {
        expect(() => updateMatchSchema.parse(validUpdate)).not.toThrow();
      });

      it('should accept partial updates', () => {
        expect(() => updateMatchSchema.parse({ player1Score: 5 })).not.toThrow();
        expect(() => updateMatchSchema.parse({ status: 'in_progress' as const })).not.toThrow();
        expect(() => updateMatchSchema.parse({ winnerId: 'player-2' })).not.toThrow();
      });

      it('should accept nullable winnerId', () => {
        expect(() => updateMatchSchema.parse({ winnerId: null })).not.toThrow();
      });

      it('should reject negative scores', () => {
        expect(() => updateMatchSchema.parse({ ...validUpdate, player1Score: -1 })).toThrow();
        expect(() => updateMatchSchema.parse({ ...validUpdate, player2Score: -1 })).toThrow();
      });

      it('should accept zero scores', () => {
        expect(() => updateMatchSchema.parse({ ...validUpdate, player1Score: 0 })).not.toThrow();
        expect(() => updateMatchSchema.parse({ ...validUpdate, player2Score: 0 })).not.toThrow();
      });

      it('should reject invalid status values', () => {
        expect(() => updateMatchSchema.parse({ status: 'invalid' as const })).toThrow();
        expect(() => updateMatchSchema.parse({ status: 'PENDING' as const })).toThrow();
      });

      it('should accept all valid status values', () => {
        expect(() => updateMatchSchema.parse({ status: 'pending' as const })).not.toThrow();
        expect(() => updateMatchSchema.parse({ status: 'in_progress' as const })).not.toThrow();
        expect(() => updateMatchSchema.parse({ status: 'completed' as const })).not.toThrow();
        expect(() => updateMatchSchema.parse({ status: 'cancelled' as const })).not.toThrow();
      });

      it('should accept very large scores', () => {
        expect(() => updateMatchSchema.parse({ player1Score: 999999 })).not.toThrow();
        expect(() => updateMatchSchema.parse({ player2Score: 999999 })).not.toThrow();
      });
    });
  });

  describe('Token Validation Schemas', () => {
    describe('regenerateTokenSchema', () => {
      it('should accept valid tournament ID', () => {
        expect(() => regenerateTokenSchema.parse({ tournamentId: 'tournament-123' })).not.toThrow();
      });

      it('should reject missing tournamentId', () => {
        expect(() => regenerateTokenSchema.parse({})).toThrow();
      });

      it('should reject empty tournamentId', () => {
        expect(() => regenerateTokenSchema.parse({ tournamentId: '' })).toThrow();
      });

      it('should accept various ID formats', () => {
        expect(() => regenerateTokenSchema.parse({ tournamentId: '123' })).not.toThrow();
        expect(() => regenerateTokenSchema.parse({ tournamentId: 'abc-123_def' })).not.toThrow();
      });
    });

    describe('extendTokenSchema', () => {
      it('should accept valid token extension data', () => {
        expect(() => extendTokenSchema.parse({ tournamentId: 'tournament-123', days: '7' })).not.toThrow();
      });

      it('should apply default days value', () => {
        const result = extendTokenSchema.parse({ tournamentId: 'tournament-123' });
        expect(result.days).toBe(7);
      });

      it('should reject missing tournamentId', () => {
        expect(() => extendTokenSchema.parse({})).toThrow();
      });

      it('should reject empty tournamentId', () => {
        expect(() => extendTokenSchema.parse({ tournamentId: '', days: '7' }))
          .toThrow();
      });

      it('should reject days < 1', () => {
        expect(() => extendTokenSchema.parse({ tournamentId: 't-123', days: '0' }))
          .toThrow();
        expect(() => extendTokenSchema.parse({ tournamentId: 't-123', days: '-1' }))
          .toThrow();
      });

      it('should reject days > 365', () => {
        expect(() => extendTokenSchema.parse({ tournamentId: 't-123', days: '366' }))
          .toThrow();
      });

      it('should accept minimum and maximum days', () => {
        expect(() => extendTokenSchema.parse({ tournamentId: 't-123', days: '1' })).not.toThrow();
        expect(() => extendTokenSchema.parse({ tournamentId: 't-123', days: '365' })).not.toThrow();
      });

      it('should accept various valid day values', () => {
        expect(() => extendTokenSchema.parse({ tournamentId: 't-123', days: '30' })).not.toThrow();
        expect(() => extendTokenSchema.parse({ tournamentId: 't-123', days: '90' })).not.toThrow();
        expect(() => extendTokenSchema.parse({ tournamentId: 't-123', days: '180' })).not.toThrow();
      });
    });
  });

  describe('Exported Types', () => {
    it('should export Player input types', () => {
      expect(typeof require('@/lib/validation/schemas').CreatePlayerInput).toBeDefined();
      expect(typeof require('@/lib/validation/schemas').UpdatePlayerInput).toBeDefined();
    });

    it('should export Tournament input types', () => {
      expect(typeof require('@/lib/validation/schemas').CreateTournamentInput).toBeDefined();
      expect(typeof require('@/lib/validation/schemas').UpdateTournamentInput).toBeDefined();
    });

    it('should export Score input types', () => {
      expect(typeof require('@/lib/validation/schemas').ScoreEntryInput).toBeDefined();
      expect(typeof require('@/lib/validation/schemas').BatchScoreEntryInput).toBeDefined();
    });

    it('should export Match input types', () => {
      expect(typeof require('@/lib/validation/schemas').CreateMatchInput).toBeDefined();
      expect(typeof require('@/lib/validation/schemas').UpdateMatchInput).toBeDefined();
    });

    it('should export Token input types', () => {
      expect(typeof require('@/lib/validation/schemas').RegenerateTokenInput).toBeDefined();
      expect(typeof require('@/lib/validation/schemas').ExtendTokenInput).toBeDefined();
    });
  });
});

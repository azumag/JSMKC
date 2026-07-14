import fs from 'fs';
import path from 'path';

const { DatabaseSync } = jest.requireActual('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    close: () => void;
    exec: (sql: string) => void;
    prepare: (sql: string) => {
      all: () => Array<Record<string, unknown>>;
      get: () => Record<string, unknown> | undefined;
    };
  };
};

function readMigration(...segments: string[]) {
  return fs.readFileSync(path.join(__dirname, '../../prisma/migrations', ...segments), 'utf8');
}

function readWranglerMigration(file: string) {
  return fs.readFileSync(path.join(__dirname, '../../migrations', file), 'utf8');
}

function migrationSqlFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return migrationSqlFiles(entryPath);
    }

    return entry.name === 'migration.sql' ? [entryPath] : [];
  });
}

describe('Prisma migration compatibility', () => {
  it('does not use JSONB in any migration because Cloudflare D1 applies SQLite SQL', () => {
    const migrationsDir = path.join(__dirname, '../../prisma/migrations');
    // Prisma SQLite Json columns are generated as JSONB, but D1 migration execution
    // accepts SQLite-compatible storage classes. A global guard prevents future
    // generated migrations from reintroducing the unsupported type silently.
    const jsonbMigrations = migrationSqlFiles(migrationsDir)
      .filter((file) => fs.readFileSync(file, 'utf8').includes('JSONB'))
      .map((file) => path.relative(migrationsDir, file));

    expect(jsonbMigrations).toEqual([]);
  });

  it('keeps TA sudden-death JSON columns compatible with SQLite/D1 text storage', () => {
    const migration = readMigration('0010_ta_phase_sudden_death', 'migration.sql');

    expect(migration).not.toContain('JSONB');
    expect(migration).toContain('"targetPlayerIds" TEXT NOT NULL');
    expect(migration).toContain('"results" TEXT');
  });

  it('keeps recent GP finals JSON columns compatible with SQLite/D1 text storage', () => {
    const cupResults = readMigration('0010_gp_finals_cup_results', 'migration.sql');
    const assignedCups = readMigration('0015_gp_finals_assigned_cups', 'migration.sql');

    expect(cupResults).not.toContain('JSONB');
    expect(cupResults).toContain('"cupResults" TEXT');
    expect(assignedCups).not.toContain('JSONB');
    expect(assignedCups).toContain('"assignedCups" TEXT');
  });

  it('adds overall to existing tournament publicModes with SQLite JSON semantics', () => {
    const d1Migration = readWranglerMigration('0037_add_overall_to_existing_tournaments.sql');
    const prismaMigration = readMigration('0018_add_overall_to_existing_tournaments', 'migration.sql');

    expect(d1Migration).toContain("COALESCE(publicModes, '[]')");
    expect(prismaMigration).toContain('COALESCE("publicModes", \'[]\')');

    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE Tournament (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          deletedAt TEXT,
          publicModes TEXT
        );
        INSERT INTO Tournament (id, status, deletedAt, publicModes) VALUES
          ('active-null', 'active', NULL, NULL),
          ('completed-ta', 'completed', NULL, '["ta"]'),
          ('active-overall', 'active', NULL, '["overall"]'),
          ('draft-null', 'draft', NULL, NULL),
          ('deleted-null', 'active', '2026-05-24T00:00:00.000Z', NULL);
      `);

      db.exec(d1Migration);
      db.exec(d1Migration);

      const rows = db.prepare('SELECT id, publicModes FROM Tournament ORDER BY id').all();
      expect(rows).toEqual([
        { id: 'active-null', publicModes: '["overall"]' },
        { id: 'active-overall', publicModes: '["overall"]' },
        { id: 'completed-ta', publicModes: '["ta","overall"]' },
        { id: 'deleted-null', publicModes: null },
        { id: 'draft-null', publicModes: null },
      ]);
    } finally {
      db.close();
    }
  });

  it('keeps MR scoresConfirmed type declarations aligned between Prisma and Wrangler migrations', () => {
    const prismaMigration = readMigration('0017_mr_scores_confirmed', 'migration.sql');
    const wranglerMigration = readWranglerMigration('0036_add_mr_scores_confirmed.sql');
    const expectedColumn = '"scoresConfirmed" BOOLEAN NOT NULL DEFAULT false';

    expect(prismaMigration).toContain(expectedColumn);
    expect(wranglerMigration).toContain(expectedColumn);
    expect(wranglerMigration).not.toContain('"scoresConfirmed" INTEGER NOT NULL DEFAULT 0');
  });

  it('keeps cross-group ranking override columns aligned between Prisma and Wrangler migrations', () => {
    const prismaMigration = readMigration('0020_add_combined_rank_override', 'migration.sql');
    const wranglerMigration = readWranglerMigration('0039_add_combined_rank_override.sql');

    for (const model of ['BMQualification', 'MRQualification', 'GPQualification']) {
      for (const column of [
        '"combinedRankOverride" INTEGER',
        '"combinedRankOverrideBy" TEXT',
        '"combinedRankOverrideAt" DATETIME',
      ]) {
        expect(prismaMigration).toContain(`ALTER TABLE "${model}" ADD COLUMN ${column}`);
        expect(wranglerMigration).toContain(`ALTER TABLE "${model}" ADD COLUMN ${column}`);
      }
    }
  });

  it('keeps TA battle royale settings aligned between Prisma and Wrangler migrations', () => {
    const prismaMigration = readMigration('0021_add_ta_battle_royale', 'migration.sql');
    const wranglerMigration = readWranglerMigration('0040_add_ta_battle_royale.sql');

    for (const column of [
      'ALTER TABLE "Player" ADD COLUMN "taHandicapSeconds" INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE "Tournament" ADD COLUMN "taBattleRoyaleMode" BOOLEAN NOT NULL DEFAULT false',
    ]) {
      expect(prismaMigration).toContain(column);
      expect(wranglerMigration).toContain(column);
    }
  });

  it('keeps TTEntry TA handicap schema and Prisma/Wrangler migrations aligned', () => {
    const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const prismaMigration = readMigration('0022_add_tt_entry_ta_handicap', 'migration.sql').trim();
    const wranglerMigration = readWranglerMigration('0041_add_tt_entry_ta_handicap.sql').trim();
    const expectedColumn = 'ADD COLUMN "taHandicapSeconds" INTEGER NOT NULL DEFAULT 0;';

    expect(schema).toContain('taHandicapSeconds   Int        @default(0)');
    expect(prismaMigration).toContain('ALTER TABLE "TTEntry"');
    expect(prismaMigration).toContain(expectedColumn);
    expect(wranglerMigration).toBe(prismaMigration);
  });

  it('removes the unused Player TA handicap default from the schema without a DROP COLUMN migration', () => {
    const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');

    /*
     * Player.taHandicapSeconds was a "new tournament default" that only ever
     * seeded new TTEntry rows — editing it in Player Management never
     * affected any player already entered in a tournament, which read
     * exclusively from TTEntry.taHandicapSeconds. That made the Player
     * Management control misleading, so it is removed from the schema;
     * TTEntry.taHandicapSeconds remains the sole, authoritative handicap.
     *
     * No migration drops the underlying D1 column: SQLite/D1 does not
     * support DROP COLUMN reliably here, per the same decision already made
     * for Player.ttSeeding (migrations/0015_move_seeding_to_ttentry.sql).
     * The orphaned column is left in place and ignored at the application
     * level — see the schema.prisma comment above the Player model.
     */
    const playerModel = schema.match(/model Player \{[\s\S]*?\n\}/)?.[0];
    const ttEntryModel = schema.match(/model TTEntry \{[\s\S]*?\n\}/)?.[0];
    expect(playerModel).not.toContain('taHandicapSeconds');
    expect(ttEntryModel).toContain('taHandicapSeconds');
  });

  it('keeps TTPhaseRound.lifeLoss schema and Prisma/Wrangler migrations aligned', () => {
    const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const prismaMigration = readMigration('0023_add_tt_phase_round_life_loss', 'migration.sql').trim();
    const wranglerMigration = readWranglerMigration('0042_add_tt_phase_round_life_loss.sql').trim();
    const expectedColumn = 'ADD COLUMN "lifeLoss" INTEGER NOT NULL DEFAULT 1;';

    const ttPhaseRoundModel = schema.match(/model TTPhaseRound \{[\s\S]*?\n\}/)?.[0];
    expect(ttPhaseRoundModel).toContain('lifeLoss');
    expect(prismaMigration).toContain('ALTER TABLE "TTPhaseRound"');
    expect(prismaMigration).toContain(expectedColumn);
    expect(wranglerMigration).toBe(prismaMigration);
  });

  it('never attempts to DROP COLUMN "taHandicapSeconds" from Player (D1 does not reliably support it here)', () => {
    const prismaMigrationsDir = path.join(__dirname, '../../prisma/migrations');
    const wranglerMigrationsDir = path.join(__dirname, '../../migrations');
    const wranglerMigrationFiles = fs
      .readdirSync(wranglerMigrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => path.join(wranglerMigrationsDir, file));
    const allMigrationFiles = [...migrationSqlFiles(prismaMigrationsDir), ...wranglerMigrationFiles];

    // Scoped to the Player table specifically — TTEntry.taHandicapSeconds is
    // the surviving, authoritative field and must remain droppable if ever
    // needed; only re-dropping it from Player would repeat the mistake this
    // migration avoided.
    const offending = allMigrationFiles.filter((file) =>
      /ALTER TABLE\s+"Player"\b[^;]*DROP COLUMN\s+"taHandicapSeconds"/i.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offending).toEqual([]);
  });
});

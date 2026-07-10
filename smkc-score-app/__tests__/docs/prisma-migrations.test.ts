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
});

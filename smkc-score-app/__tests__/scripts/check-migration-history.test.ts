import { spawnSync } from 'child_process';
import path from 'path';

const appDir = path.resolve(__dirname, '../..');
const scriptPath = path.join(appDir, 'scripts', 'check-migration-history.cjs');

function runGuard(diff: string) {
  const result = spawnSync(process.execPath, [scriptPath, '--json'], {
    cwd: appDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      MIGRATION_DIFF_INPUT: diff,
    },
  });

  return {
    ...result,
    payload: JSON.parse(result.stdout),
  };
}

describe('migration history guard', () => {
  it('allows one new Prisma migration with one new D1 migration', () => {
    const result = runGuard(
      [
        'A\tprisma/migrations/0028_example/migration.sql',
        'A\tmigrations/0035_example.sql',
      ].join('\n'),
    );

    expect(result.status).toBe(0);
    expect(result.payload).toEqual({
      ok: true,
      prismaAdded: 1,
      d1Added: 1,
      parityOk: true,
      violations: [],
    });
  });

  it('rejects modifying an existing Prisma migration', () => {
    const result = runGuard('M\tprisma/migrations/0027_existing/migration.sql');

    expect(result.status).toBe(1);
    expect(result.payload).toMatchObject({
      ok: false,
      parityOk: true,
      violations: [
        {
          status: 'M',
          from: 'prisma/migrations/0027_existing/migration.sql',
          to: null,
        },
      ],
    });
  });

  it('rejects deleting an existing D1 migration', () => {
    const result = runGuard('D\tmigrations/0034_existing.sql');

    expect(result.status).toBe(1);
    expect(result.payload.violations).toEqual([
      {
        status: 'D',
        from: 'migrations/0034_existing.sql',
        to: null,
      },
    ]);
  });

  it('rejects renaming an existing migration even with 100% similarity', () => {
    const result = runGuard(
      'R100\tprisma/migrations/0027_old/migration.sql\tprisma/migrations/0027_new/migration.sql',
    );

    expect(result.status).toBe(1);
    expect(result.payload.violations).toEqual([
      {
        status: 'R100',
        from: 'prisma/migrations/0027_old/migration.sql',
        to: 'prisma/migrations/0027_new/migration.sql',
      },
    ]);
  });

  it('rejects unmatched new migration counts', () => {
    const result = runGuard('A\tprisma/migrations/0028_example/migration.sql');

    expect(result.status).toBe(1);
    expect(result.payload).toMatchObject({
      ok: false,
      prismaAdded: 1,
      d1Added: 0,
      parityOk: false,
      violations: [],
    });
  });

  it('ignores changes outside managed migration SQL files', () => {
    const result = runGuard(
      ['M\tprisma/schema.prisma', 'M\tmigrations/README.md', 'A\tsrc/lib/example.ts'].join('\n'),
    );

    expect(result.status).toBe(0);
    expect(result.payload).toMatchObject({
      ok: true,
      prismaAdded: 0,
      d1Added: 0,
      violations: [],
    });
  });

  it('normalizes repository-root-prefixed paths from git diff output', () => {
    const result = runGuard(
      [
        'A\tsmkc-score-app/prisma/migrations/0028_example/migration.sql',
        'A\tsmkc-score-app/migrations/0035_example.sql',
      ].join('\n'),
    );

    expect(result.status).toBe(0);
    expect(result.payload).toMatchObject({ ok: true, prismaAdded: 1, d1Added: 1 });
  });
});

/** D1-level contract tests for the SQL shape used by #3038 corrections.
 *
 * These deliberately run against Miniflare's D1 implementation rather than
 * mocking `executeD1Batch`: a stale retry must not create an audit row merely
 * because its desired post-state already exists.
 */
import { Miniflare } from 'miniflare';

describe('D1 atomic finals/audit batches', () => {
  let mf: Miniflare;
  let db: Awaited<ReturnType<Miniflare['getD1Database']>>;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } };',
      d1Databases: ['DB'],
    });
    db = await mf.getD1Database('DB');
    await db.exec(`
      CREATE TABLE Finals (id TEXT PRIMARY KEY, version INTEGER NOT NULL, score1 INTEGER, score2 INTEGER, winnerOverrideId TEXT, player1Id TEXT);
      CREATE TABLE AuditLog (id TEXT NOT NULL PRIMARY KEY, details TEXT);
      CREATE TABLE FinalsRoundSetting (id TEXT PRIMARY KEY, tournamentId TEXT, mode TEXT, stage TEXT, round TEXT, targetWins INTEGER, UNIQUE(tournamentId, mode, stage, round));
      INSERT INTO Finals VALUES ('m1', 4, 3, 2, NULL, 'old-player');
    `);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it('does not insert a second audit row for a stale identical override retry', async () => {
    const write = () =>
      db.batch([
        db
          .prepare(
            'UPDATE Finals SET score1 = ?, score2 = ?, winnerOverrideId = ?, version = version + 1 WHERE id = ? AND version = ?',
          )
          .bind(0, -1, 'p1', 'm1', 4),
        db
          .prepare(
            `INSERT INTO AuditLog (id, details)
        SELECT ?, ? WHERE EXISTS (SELECT 1 FROM Finals WHERE id = ? AND version = ? AND winnerOverrideId = ?)
        AND changes() = 1`,
          )
          .bind(crypto.randomUUID(), 'override', 'm1', 5, 'p1'),
      ]);

    const first = await write();
    expect(first.map((result) => result.meta.changes)).toEqual([1, 1]);

    const stale = await write();
    expect(stale.map((result) => result.meta.changes)).toEqual([0, 0]);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM AuditLog').first<{ count: number }>()).toEqual({ count: 1 });
  });

  it('does not change the round export setting when a stale guarded update is rejected', async () => {
    const writeRound = (expectedVersion: number, targetWins: number) =>
      db.batch([
        db
          .prepare('UPDATE Finals SET score1 = ?, version = version + 1 WHERE id = ? AND version = ?')
          .bind(targetWins, 'm1', expectedVersion),
        db
          .prepare('INSERT INTO AuditLog (id, details) SELECT ?, ? WHERE changes() = 1')
          .bind(crypto.randomUUID(), 'round'),
        db
          .prepare(
            `INSERT INTO FinalsRoundSetting (id, tournamentId, mode, stage, round, targetWins)
            SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1
            ON CONFLICT(tournamentId, mode, stage, round) DO UPDATE SET targetWins = excluded.targetWins`,
          )
          .bind(crypto.randomUUID(), 't1', 'bm', 'finals', 'winners_r1', targetWins),
      ]);

    // m1 was advanced to version 5 by the override test above.
    expect((await writeRound(5, 7)).map((result) => result.meta.changes)).toEqual([1, 1, 1]);
    expect((await writeRound(5, 9)).map((result) => result.meta.changes)).toEqual([0, 0, 0]);
    expect(
      await db
        .prepare('SELECT targetWins FROM FinalsRoundSetting WHERE tournamentId = ?')
        .bind('t1')
        .first<{ targetWins: number }>(),
    ).toEqual({ targetWins: 7 });
  });

  it('rolls the slot write back when the reconciliation audit assertion or insert fails', async () => {
    const reconcile = (expectedVersion: number, auditId: string) =>
      db.batch([
        db
          .prepare('UPDATE Finals SET player1Id = ?, version = version + 1 WHERE id = ? AND version = ?')
          .bind('corrected-player', 'm1', expectedVersion),
        /* Mirrors #3040: never let a guarded no-op merely skip the audit,
         * because that would commit a preceding partial mutation. */
        db
          .prepare('INSERT INTO AuditLog (id, details) SELECT CASE WHEN changes() = ? THEN ? ELSE NULL END, ?')
          .bind(1, auditId, 'reconcile'),
      ]);

    // m1 is version 6 after the two preceding tests. A stale guarded write
    // makes the non-null AuditLog id assertion fail, and D1 rolls back all.
    await expect(reconcile(5, crypto.randomUUID())).rejects.toThrow();
    expect(await db.prepare('SELECT player1Id, version FROM Finals WHERE id = ?').bind('m1').first()).toEqual({
      player1Id: 'old-player',
      version: 6,
    });

    const duplicateAuditId = 'existing-reconcile-audit';
    await db.prepare('INSERT INTO AuditLog (id, details) VALUES (?, ?)').bind(duplicateAuditId, 'existing').run();
    await expect(reconcile(6, duplicateAuditId)).rejects.toThrow();
    expect(await db.prepare('SELECT player1Id, version FROM Finals WHERE id = ?').bind('m1').first()).toEqual({
      player1Id: 'old-player',
      version: 6,
    });
  });
});

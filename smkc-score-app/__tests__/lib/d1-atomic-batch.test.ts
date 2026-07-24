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
      CREATE TABLE TTEntry (id TEXT PRIMARY KEY, tournamentId TEXT, playerId TEXT, stage TEXT, eliminated BOOLEAN, version INTEGER, lives INTEGER, updatedAt DATETIME);
      CREATE TABLE TTPhaseRound (id TEXT PRIMARY KEY, tournamentId TEXT, phase TEXT, roundNumber INTEGER, submittedAt DATETIME);
      CREATE TABLE TTPhaseSuddenDeathRound (id TEXT PRIMARY KEY, phaseRoundId TEXT, resolved BOOLEAN);
      CREATE TABLE TTPhaseLifeAdjustment (id TEXT NOT NULL PRIMARY KEY, tournamentId TEXT, entryId TEXT, playerId TEXT, oldLives INTEGER, newLives INTEGER, entryVersion INTEGER, adjustedById TEXT, adjustedByName TEXT, afterRoundId TEXT, afterRoundNumber INTEGER, createdAt DATETIME);
      INSERT INTO TTEntry VALUES ('entry-1', 't1', 'p1', 'phase3', false, 7, 3, CURRENT_TIMESTAMP);
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

  it('atomically persists one absolute TA life event and writes nothing for a stale retry', async () => {
    const write = (eventId: string, expectedVersion: number, expectedLives: number, newLives: number) =>
      db.batch([
        db
          .prepare(
            `UPDATE TTEntry
             SET lives = ?, version = version + 1, updatedAt = ?
             WHERE id = ? AND tournamentId = ? AND stage = 'phase3'
               AND eliminated = false AND version = ? AND lives = ?
               AND NOT EXISTS (
                 SELECT 1 FROM TTPhaseRound round
                 LEFT JOIN TTPhaseSuddenDeathRound sudden
                   ON sudden.phaseRoundId = round.id AND sudden.resolved = false
                 WHERE round.tournamentId = ? AND round.phase = 'phase3'
                   AND (round.submittedAt IS NULL OR sudden.id IS NOT NULL)
               )`,
          )
          .bind(newLives, '2026-07-24T01:00:00.000Z', 'entry-1', 't1', expectedVersion, expectedLives, 't1'),
        db
          .prepare(
            `INSERT INTO TTPhaseLifeAdjustment (
               id, tournamentId, entryId, playerId, oldLives, newLives, entryVersion,
               adjustedById, adjustedByName, afterRoundId, afterRoundNumber, createdAt
             )
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?
             WHERE changes() = 1`,
          )
          .bind(
            eventId,
            't1',
            'entry-1',
            'p1',
            expectedLives,
            newLives,
            expectedVersion + 1,
            'admin-1',
            'Ops Admin',
            '2026-07-24T01:00:00.000Z',
          ),
      ]);

    const eventId = crypto.randomUUID();
    expect((await write(eventId, 7, 3, 5)).map((result) => result.meta.changes)).toEqual([1, 1]);
    expect((await write(crypto.randomUUID(), 7, 3, 5)).map((result) => result.meta.changes)).toEqual([0, 0]);
    expect(await db.prepare('SELECT lives, version FROM TTEntry WHERE id = ?').bind('entry-1').first()).toEqual({
      lives: 5,
      version: 8,
    });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM TTPhaseLifeAdjustment').first<{ count: number }>()).toEqual({
      count: 1,
    });

    await expect(write(eventId, 8, 5, 6)).rejects.toThrow();
    expect(await db.prepare('SELECT lives, version FROM TTEntry WHERE id = ?').bind('entry-1').first()).toEqual({
      lives: 5,
      version: 8,
    });
  });
});

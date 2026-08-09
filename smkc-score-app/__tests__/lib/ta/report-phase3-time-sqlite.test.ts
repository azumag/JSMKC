/**
 * Integration test for the reportPhase3Time atomic JSON1 upsert SQL
 * (issue #3092). The route/unit tests mock $executeRaw, so the actual
 * storage shape (object array vs double-escaped JSON string) is only
 * verifiable against a real SQLite JSON1 engine. Node >= 22 ships the
 * built-in `node:sqlite` module; the SQL below mirrors
 * reportPhase3Time() in src/lib/ta/finals-phase-manager.ts exactly.
 */
import { DatabaseSync } from 'node:sqlite';

function runUpsert(db: DatabaseSync, playerId: string, timeMs: number): void {
  const reportedRow = JSON.stringify({ playerId, timeMs, reportedAt: new Date().toISOString() });
  db.prepare(
    `UPDATE t
     SET reportedResults = (
       SELECT json_insert(
         COALESCE((SELECT json_group_array(value) FROM json_each(COALESCE(reportedResults, '[]'))
                   WHERE json_extract(value, '$.playerId') != ?), '[]'),
         '$[#]',
         json(?)
       )
     )
     WHERE id = ?`,
  ).run(playerId, reportedRow, 'r1');
}

function readReported(db: DatabaseSync): Array<{ playerId: string; timeMs: number }> {
  const raw = db.prepare('SELECT reportedResults FROM t WHERE id = ?').get('r1') as {
    reportedResults: string;
  };
  return JSON.parse(raw.reportedResults) as Array<{ playerId: string; timeMs: number }>;
}

describe('reportPhase3Time JSON1 upsert (real SQLite, issue #3092)', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, reportedResults TEXT)');
    db.exec("INSERT INTO t VALUES ('r1', NULL)");
  });

  afterEach(() => {
    db.close();
  });

  it('stores the reported row as a JSON object (not a double-escaped string)', () => {
    runUpsert(db, 'p1', 60000);

    const rows = readReported(db);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0]).toBe('object');
    expect(rows[0].playerId).toBe('p1');
    expect(rows[0].timeMs).toBe(60000);
  });

  it('appends a second concurrent player without losing the first', () => {
    runUpsert(db, 'p1', 60000);
    runUpsert(db, 'p2', 65000);

    const rows = readReported(db);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.playerId === 'p1')?.timeMs).toBe(60000);
    expect(rows.find((r) => r.playerId === 'p2')?.timeMs).toBe(65000);
  });

  it('overwrites the same player report without growing the array', () => {
    runUpsert(db, 'p1', 60000);
    runUpsert(db, 'p2', 65000);
    runUpsert(db, 'p1', 59000);

    const rows = readReported(db);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.playerId === 'p1')?.timeMs).toBe(59000);
    expect(rows.find((r) => r.playerId === 'p2')?.timeMs).toBe(65000);
  });
});

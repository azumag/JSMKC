import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';

const spawnSyncMock = jest.fn();

jest.mock('child_process', () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

type PreviewSchemaPreflight = typeof import('../../e2e/lib/preview-schema-preflight');

function loadPreflight() {
  let loaded: PreviewSchemaPreflight | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../../e2e/lib/preview-schema-preflight') as PreviewSchemaPreflight;
  });
  if (!loaded) throw new Error('Failed to load preview schema preflight');
  return loaded;
}

describe('preview schema preflight', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  it('checks the columns that previously drifted on preview D1', () => {
    const preflight = loadPreflight();

    expect(preflight.REQUIRED_PREVIEW_COLUMNS).toEqual([
      { table: 'Tournament', column: 'publicModes' },
      { table: 'GPMatch', column: 'assignedCups' },
      { table: 'GPMatch', column: 'suddenDeathWinnerId' },
    ]);
    expect(preflight.WRANGLER_TIMEOUT_MS).toBe(30_000);
    expect(preflight.buildPreviewSchemaCheckSql()).toContain("pragma_table_info('Tournament')");
    expect(preflight.buildPreviewSchemaCheckSql()).toContain("pragma_table_info('GPMatch')");
  });

  it('passes when wrangler reports all required columns', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: JSON.stringify([
        {
          results: [
            { required_column: 'Tournament.publicModes' },
            { required_column: 'GPMatch.assignedCups' },
            { required_column: 'GPMatch.suddenDeathWinnerId' },
          ],
        },
      ]),
      stderr: '',
    });

    expect(() => preflight.assertPreviewD1Schema({})).not.toThrow();
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'wrangler',
      expect.arrayContaining(['d1', 'execute', 'DB', '--remote', '--env', 'preview', '--json']),
      expect.objectContaining({
        encoding: 'utf8',
        timeout: preflight.WRANGLER_TIMEOUT_MS,
        env: expect.objectContaining({
          PATH: expect.stringContaining('node_modules/.bin'),
          WRANGLER_LOG_PATH: expect.stringContaining('jsmkc-wrangler-preflight.log'),
        }),
      }),
    );
  });

  it('preserves an explicit Wrangler log path for preview preflight', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: JSON.stringify([
        {
          results: [
            { required_column: 'Tournament.publicModes' },
            { required_column: 'GPMatch.assignedCups' },
            { required_column: 'GPMatch.suddenDeathWinnerId' },
          ],
        },
      ]),
      stderr: '',
    });

    expect(() => preflight.assertPreviewD1Schema({ WRANGLER_LOG_PATH: '/tmp/custom-wrangler.log' })).not.toThrow();
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'wrangler',
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({ WRANGLER_LOG_PATH: '/tmp/custom-wrangler.log' }),
      }),
    );
  });

  it('does not trust non-json stdout that merely mentions required column names', () => {
    const preflight = loadPreflight();

    expect(preflight.parsePresentColumns('Column Tournament.publicModes is invalid')).toEqual(new Set());
  });

  it('only parses the documented wrangler results array shape', () => {
    const preflight = loadPreflight();

    expect(
      preflight.parsePresentColumns(JSON.stringify({
        result: {
          results: [{ required_column: 'Tournament.publicModes' }],
        },
      })),
    ).toEqual(new Set());
  });

  it('fails before browser launch when a required column is missing', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: JSON.stringify([
        {
          results: [
            { required_column: 'Tournament.publicModes' },
            { required_column: 'GPMatch.assignedCups' },
          ],
        },
      ]),
      stderr: '',
    });

    expect(() => preflight.assertPreviewD1Schema({})).toThrow(
      /Preview D1 schema is missing required columns: GPMatch\.suddenDeathWinnerId/,
    );
  });

  it('fails with migration guidance when wrangler cannot run the check', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'No migrations to apply',
    });

    expect(() => preflight.assertPreviewD1Schema({})).toThrow(/db:migrations:apply:preview/);
  });

  it('separates Wrangler auth and log setup failures from schema migration guidance', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: [
        "Failed to write to log file Error: EPERM: operation not permitted, open '/Users/me/Library/Preferences/.wrangler/logs/wrangler.log'",
        'Failed to fetch auth token: 400 Bad Request',
      ].join('\n'),
    });

    expect(() => preflight.assertPreviewD1Schema({})).toThrow(/Wrangler auth\/log setup failed/);
    expect(() => preflight.assertPreviewD1Schema({})).toThrow(/WRANGLER_LOG_PATH/);
    expect(() => preflight.assertPreviewD1Schema({})).not.toThrow(/db:migrations:apply:preview/);
  });

  it('fails with timeout guidance when wrangler hangs', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: null,
      stdout: '',
      stderr: '',
      error: { code: 'ETIMEDOUT' },
    });

    expect(() => preflight.assertPreviewD1Schema({})).toThrow(/timed out after 30 seconds/);
  });

  it('fails with tool setup guidance when Wrangler is unavailable', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: null,
      stdout: '',
      stderr: '',
      error: { code: 'ENOENT', message: 'spawnSync wrangler ENOENT' },
    });

    expect(() => preflight.assertPreviewD1Schema({ PATH: '/usr/bin' })).toThrow(/Wrangler could not be started/);
  });

  it('keeps the missing GP sudden death column in Wrangler migrations', () => {
    const migrationPath = path.join(
      process.cwd(),
      'migrations',
      '0035_add_gp_match_sudden_death_winner.sql',
    );

    expect(readFileSync(migrationPath, 'utf8')).toContain(
      'ALTER TABLE `GPMatch` ADD COLUMN `suddenDeathWinnerId` TEXT',
    );
  });

  it('keeps the GP assigned cups column in Wrangler migrations', () => {
    const migrationPath = path.join(
      process.cwd(),
      'migrations',
      '0033_gp_finals_assigned_cups.sql',
    );

    expect(readFileSync(migrationPath, 'utf8')).toContain(
      'ALTER TABLE GPMatch ADD COLUMN assignedCups TEXT',
    );
  });
});

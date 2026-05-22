import { afterEach, describe, expect, it, jest, beforeEach } from '@jest/globals';
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
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('does not duplicate the local Wrangler bin path when it is already present', () => {
    const preflight = loadPreflight();
    const localBinPath = path.join(process.cwd(), 'node_modules', '.bin');
    const built = preflight.buildWranglerEnv({ PATH: [localBinPath, '/usr/bin'].join(path.delimiter) });

    expect(built.PATH.split(path.delimiter).filter((entry) => entry === localBinPath)).toHaveLength(1);
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

  it('fails with migration guidance when wrangler reports a clear schema error', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'SQLITE_ERROR: no such column: suddenDeathWinnerId',
    });

    expect(() => preflight.assertPreviewD1Schema({})).toThrow(/db:migrations:apply:preview/);
  });

  it('retries empty Wrangler status 1 once and keeps migration guidance out of transient diagnostics', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
    });

    let message = '';
    try {
      preflight.assertPreviewD1Schema({});
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    expect(message).toMatch(/Wrangler exited non-zero before preview D1 schema could be verified/);
    expect(message).toMatch(/Command: wrangler d1 execute DB --remote --env preview --json --command/);
    expect(message).toMatch(/Command exited 1/);
    expect(message).toMatch(/stderr: \(empty\)/);
    expect(message).toMatch(/stdout: \(empty\)/);
    expect(message).not.toMatch(/db:migrations:apply:preview/);
  });

  it('preserves non-schema Wrangler stderr without classifying it as migration drift', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: 'Checking preview database...',
      stderr: 'Network connection reset by peer',
    });

    let message = '';
    try {
      preflight.assertPreviewD1Schema({});
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    expect(message).toMatch(/Wrangler exited non-zero before preview D1 schema could be verified/);
    expect(message).toMatch(/stderr: Network connection reset by peer/);
    expect(message).toMatch(/stdout: Checking preview database/);
    expect(message).not.toMatch(/db:migrations:apply:preview/);
  });

  it('does not classify generic wrangler login help text as an auth failure', () => {
    const preflight = loadPreflight();

    expect(preflight.isWranglerAuthOrLogFailure('Run wrangler login if you need account access.')).toBe(false);
    expect(preflight.isWranglerAuthOrLogFailure('Failed to fetch auth token: 400 Bad Request')).toBe(true);
  });

  it('continues preview startup on Wrangler auth and log setup failures by default', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: [
        "Failed to write to log file Error: EPERM: operation not permitted, open '/Users/me/Library/Preferences/.wrangler/logs/wrangler.log'",
        'Failed to fetch auth token: 400 Bad Request',
      ].join('\n'),
    });

    expect(() => preflight.assertPreviewD1Schema({})).not.toThrow();

    expect(console.warn).toHaveBeenCalledTimes(1);
    const message = String((console.warn as jest.Mock).mock.calls[0]?.[0] ?? '');
    expect(message).toMatch(/Wrangler auth\/log setup failed/);
    expect(message).toMatch(/E2E run will continue/);
    expect(message).toMatch(/WRANGLER_LOG_PATH/);
    expect(message).not.toMatch(/db:migrations:apply:preview/);
    expect(message.split('\n')).toEqual(expect.arrayContaining([
      expect.stringMatching(/Command exited 1/),
      expect.stringMatching(/WRANGLER_LOG_PATH=/),
    ]));
  });

  it('can require Wrangler auth and log failures to block preview startup', () => {
    const preflight = loadPreflight();
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'Failed to fetch auth token: 401 Unauthorized',
    });

    expect(() => preflight.assertPreviewD1Schema({ E2E_REQUIRE_PREVIEW_SCHEMA_PREFLIGHT: '1' })).toThrow(
      /Wrangler auth\/log setup failed/,
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('keeps Wrangler auth/log message helpers private to the preflight runner', () => {
    const preflight = loadPreflight();

    expect(preflight).not.toHaveProperty('buildWranglerAuthOrLogFailureMessage');
    expect(preflight).not.toHaveProperty('shouldFailOnWranglerAuthOrLogFailure');
  });

  it('keeps TC-2161 documented as non-blocking auth preflight coverage', () => {
    const section = readFileSync(path.join(process.cwd(), '..', 'E2E_TEST_CASES.md'), 'utf8');

    expect(section).toContain('TC-2161');
    expect(section).toContain('E2E_REQUIRE_PREVIEW_SCHEMA_PREFLIGHT=1');
    expect(section).toContain('__tests__/e2e/preview-schema-preflight.test.ts');
    expect(section).toContain('private helper');
  });

  it('keeps TC-2104 documented as unreachable retry fallback coverage', () => {
    const section = readFileSync(path.join(process.cwd(), '..', 'E2E_TEST_CASES.md'), 'utf8');

    expect(section).toContain('TC-2104');
    expect(section).toContain('unreachable fallback return');
    expect(section).toContain('WRANGLER_TRANSIENT_STATUS_RETRIES + 1');
  });

  it('keeps runWranglerSchemaCheck free of a loop-after fallback return', () => {
    const source = readFileSync(path.join(process.cwd(), 'e2e/lib/preview-schema-preflight.js'), 'utf8');
    const functionStart = source.indexOf('function runWranglerSchemaCheck');
    const assertStart = source.indexOf('function assertPreviewD1Schema', functionStart);
    const section = source.slice(functionStart, assertStart);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(assertStart).toBeGreaterThan(functionStart);
    expect(section).toContain('attempt === WRANGLER_TRANSIENT_STATUS_RETRIES');
    expect(section).not.toMatch(/}\s*return \{ result, args \};\s*}$/);
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

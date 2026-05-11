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
      expect.objectContaining({ encoding: 'utf8', timeout: preflight.WRANGLER_TIMEOUT_MS }),
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
      stdout: JSON.stringify([{ results: [{ required_column: 'Tournament.publicModes' }] }]),
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
});

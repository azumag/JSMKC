import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

type CommandResult = {
  ok: boolean;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  terminationSignal: string | null;
  spawnError: string | null;
  stdout: string;
  stderr: string;
};

type FakeChild = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  pid: number;
  kill: jest.Mock;
};

type RemoteParityModule = {
  WRANGLER_PREVIEW_ARGS: readonly string[];
  compareMigrationLists: (
    wranglerNames: string[],
    cfNames: string[],
  ) => { ok: boolean; pendingMigrations: readonly string[]; wranglerOnly: readonly string[]; cfOnly: readonly string[] };
  parseCfMigrationList: (stdout: string) => string[];
  parseWranglerMigrationList: (stdout: string) => string[];
  runPreviewParity: (options: {
    source: string;
    env: NodeJS.ProcessEnv;
    timeoutMs?: number;
    cfRunner?: (plan: unknown, options: { timeoutMs: number; env: NodeJS.ProcessEnv }) => Promise<CommandResult>;
    wranglerRunner?: (options: { timeoutMs: number; env: NodeJS.ProcessEnv }) => Promise<CommandResult>;
  }) => Promise<{ ok: boolean; environment: string; pendingMigrations: readonly string[] }>;
  runWranglerPreviewList: (options: {
    timeoutMs: number;
    env?: NodeJS.ProcessEnv;
    spawnImpl?: (...args: unknown[]) => FakeChild;
    terminateImpl?: (child: FakeChild, signal: string) => void;
    setTimeoutImpl?: (callback: () => void, delay: number) => unknown;
    clearTimeoutImpl?: (handle: unknown) => void;
    platform?: NodeJS.Platform;
  }) => Promise<CommandResult>;
};

const {
  WRANGLER_PREVIEW_ARGS,
  compareMigrationLists,
  parseCfMigrationList,
  parseWranglerMigrationList,
  runPreviewParity,
  runWranglerPreviewList,
} = jest.requireActual('../../scripts/cloudflare-d1-remote-parity.cjs') as RemoteParityModule;

const WRANGLER_SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'wrangler.toml'), 'utf8');
const AUTH_ENV = {
  CLOUDFLARE_API_TOKEN: 'test-token-value',
  CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
};

function result(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    ok: true,
    exitCode: 0,
    signal: null,
    timedOut: false,
    terminationSignal: null,
    spawnError: null,
    stdout: '',
    stderr: '',
    ...overrides,
  };
}

function makeChild(pid = 4321): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    pid,
    kill: jest.fn(),
  });
}

describe('preview D1 migration-list remote parity', () => {
  it('parses cf JSON migration names and sorts them', () => {
    expect(parseCfMigrationList('[{"Name":"0052_b.sql"},{"Name":"0051_a.sql"}]\n')).toEqual([
      '0051_a.sql',
      '0052_b.sql',
    ]);
    expect(parseCfMigrationList('[]\n')).toEqual([]);
  });

  it('fails closed for malformed or unexpected cf output', () => {
    expect(() => parseCfMigrationList('')).toThrow('empty migration-list response');
    expect(() => parseCfMigrationList('not-json')).toThrow('not valid JSON');
    expect(() => parseCfMigrationList('{"Name":"0051_a.sql"}')).toThrow('must be a JSON array');
    expect(() => parseCfMigrationList('[{"name":"0051_a.sql"}]')).toThrow('must contain a string Name');
    expect(() => parseCfMigrationList('[{"Name":"../0051_a.sql"}]')).toThrow('invalid migration name');
  });

  it('parses Wrangler table output and both no-pending sentinels', () => {
    const table = `
┌──────────────────────┐
│ Name                 │
├──────────────────────┤
│ 0052_second.sql      │
│ 0051_first.sql       │
└──────────────────────┘
`;
    expect(parseWranglerMigrationList(table)).toEqual(['0051_first.sql', '0052_second.sql']);
    expect(parseWranglerMigrationList('No migrations to apply!\n')).toEqual([]);
    expect(parseWranglerMigrationList('✅ No migrations to apply!\n')).toEqual([]);
  });

  it('rejects ambiguous Wrangler output', () => {
    expect(() => parseWranglerMigrationList('warning only\n')).toThrow('no recognized result');
    expect(() => parseWranglerMigrationList('0051_first.sql\nNo migrations to apply!\n')).toThrow(
      'both pending migrations and the no-pending sentinel',
    );
  });

  it('compares the exact pending migration set', () => {
    expect(compareMigrationLists(['0051_a.sql'], ['0051_a.sql'])).toEqual({
      ok: true,
      pendingMigrations: ['0051_a.sql'],
      wranglerOnly: [],
      cfOnly: [],
    });
    expect(compareMigrationLists(['0051_a.sql'], ['0052_b.sql'])).toEqual({
      ok: false,
      pendingMigrations: ['0051_a.sql'],
      wranglerOnly: ['0051_a.sql'],
      cfOnly: ['0052_b.sql'],
    });
  });

  it('runs Wrangler only against the preview binding with a bounded process', async () => {
    const child = makeChild();
    const spawnImpl = jest.fn(() => child);
    const promise = runWranglerPreviewList({
      timeoutMs: 30_000,
      env: AUTH_ENV,
      spawnImpl,
      platform: 'linux',
    });

    child.stdout.write('No migrations to apply!\n');
    child.emit('close', 0, null);
    await expect(promise).resolves.toMatchObject({ ok: true, timedOut: false });

    expect(WRANGLER_PREVIEW_ARGS).toEqual(['d1', 'migrations', 'list', 'DB', '--remote', '--env', 'preview']);
    expect(spawnImpl).toHaveBeenCalledWith(
      'wrangler',
      [...WRANGLER_PREVIEW_ARGS],
      expect.objectContaining({ shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }),
    );
  });

  it('terminates a hung Wrangler list with TERM then KILL', async () => {
    const child = makeChild();
    const terminateImpl = jest.fn();
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const setTimeoutImpl = jest.fn((callback: () => void, delay: number) => {
      scheduled.push({ callback, delay });
      return {};
    });

    const promise = runWranglerPreviewList({
      timeoutMs: 1234,
      spawnImpl: jest.fn(() => child),
      terminateImpl,
      setTimeoutImpl,
      clearTimeoutImpl: jest.fn(),
    });

    expect(scheduled[0].delay).toBe(1234);
    scheduled[0].callback();
    expect(terminateImpl).toHaveBeenNthCalledWith(1, child, 'SIGTERM');
    scheduled[1].callback();

    await expect(promise).resolves.toMatchObject({ ok: false, timedOut: true, terminationSignal: 'SIGKILL' });
    expect(terminateImpl).toHaveBeenNthCalledWith(2, child, 'SIGKILL');
  });

  it('compares Wrangler first, then cf, using the preview cf plan only', async () => {
    const calls: string[] = [];
    const wranglerRunner = jest.fn(async () => {
      calls.push('wrangler');
      return result({ stdout: 'No migrations to apply!\n' });
    });
    const cfRunner = jest.fn(async (plan: unknown) => {
      calls.push('cf');
      expect(plan).toMatchObject({ environment: 'preview', operation: 'list', command: 'cf' });
      return result({ stdout: '[]\n' });
    });

    await expect(
      runPreviewParity({ source: WRANGLER_SOURCE, env: AUTH_ENV, timeoutMs: 30_000, wranglerRunner, cfRunner }),
    ).resolves.toEqual({ ok: true, environment: 'preview', pendingMigrations: [] });
    expect(calls).toEqual(['wrangler', 'cf']);
  });

  it('does not call cf when the incumbent Wrangler preview read fails', async () => {
    const cfRunner = jest.fn();
    const wranglerRunner = jest.fn(async () => result({ ok: false, exitCode: 1, stderr: 'auth failed' }));

    await expect(
      runPreviewParity({ source: WRANGLER_SOURCE, env: AUTH_ENV, wranglerRunner, cfRunner }),
    ).rejects.toThrow('Wrangler preview migration list failed');
    expect(cfRunner).not.toHaveBeenCalled();
  });

  it('fails closed on remote parity mismatch', async () => {
    const wranglerRunner = jest.fn(async () => result({ stdout: '│ 0051_expected.sql │\n' }));
    const cfRunner = jest.fn(async () => result({ stdout: '[{"Name":"0052_unexpected.sql"}]\n' }));

    await expect(
      runPreviewParity({ source: WRANGLER_SOURCE, env: AUTH_ENV, wranglerRunner, cfRunner }),
    ).rejects.toThrow('preview migration-list mismatch');
  });

  it('requires explicit Cloudflare automation credentials before either command runs', async () => {
    const wranglerRunner = jest.fn();
    const cfRunner = jest.fn();

    await expect(
      runPreviewParity({ source: WRANGLER_SOURCE, env: {}, wranglerRunner, cfRunner }),
    ).rejects.toThrow('CLOUDFLARE_API_TOKEN is required');
    expect(wranglerRunner).not.toHaveBeenCalled();
    expect(cfRunner).not.toHaveBeenCalled();
  });
});

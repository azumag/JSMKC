import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

type CfPlan = {
  command: 'cf';
  args: readonly string[];
  environment: 'production' | 'preview';
  operation: 'list' | 'apply';
  databaseId: string;
  migrationsDir: string;
  pattern: string;
};

type RunnerResult = {
  ok: boolean;
  command: string;
  args: readonly string[];
  environment: string;
  operation: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  terminationSignal: string | null;
  spawnError: string | null;
  stdout: string;
  stderr: string;
};

type RunnerModule = {
  runCfPlan: (
    plan: CfPlan,
    options: {
      timeoutMs: number;
      killGraceMs?: number;
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      spawnImpl?: (...args: unknown[]) => FakeChild;
      terminateImpl?: (child: FakeChild, signal: string) => void;
      setTimeoutImpl?: (callback: () => void, delay: number) => unknown;
      clearTimeoutImpl?: (handle: unknown) => void;
      platform?: NodeJS.Platform;
    },
  ) => Promise<RunnerResult>;
  terminateProcessTree: (
    child: FakeChild,
    signal: string,
    options?: { platform?: NodeJS.Platform; killFn?: (pid: number, signal: string) => void },
  ) => void;
  validateCfPlan: (plan: CfPlan) => CfPlan;
};

type FakeChild = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  pid: number;
  kill: jest.Mock;
};

const { runCfPlan, terminateProcessTree, validateCfPlan } = jest.requireActual(
  '../../scripts/cloudflare-cf-runner.cjs',
) as RunnerModule;

function makePlan(operation: 'list' | 'apply' = 'list'): CfPlan {
  const databaseId = '22222222-2222-2222-2222-222222222222';
  const args = ['d1', 'migrations', operation, databaseId];
  if (operation === 'apply') args.push('--dir', 'migrations');
  args.push('--pattern', 'migrations/*.sql');

  return {
    command: 'cf',
    args,
    environment: 'preview',
    operation,
    databaseId,
    migrationsDir: 'migrations',
    pattern: 'migrations/*.sql',
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

describe('Cloudflare cf command runner', () => {
  it('executes only the validated plan shape without a shell and returns structured output', async () => {
    const child = makeChild();
    const spawnImpl = jest.fn(() => child);
    const env = { CLOUDFLARE_API_TOKEN: 'super-secret-token', SAFE_VALUE: 'visible' };

    const resultPromise = runCfPlan(makePlan(), {
      timeoutMs: 5_000,
      cwd: '/repo/smkc-score-app',
      env,
      spawnImpl,
      platform: 'linux',
    });

    child.stdout.write('[]\n');
    child.stderr.write('auth=super-secret-token\n');
    child.emit('close', 0, null);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      command: 'cf',
      args: ['d1', 'migrations', 'list', '22222222-2222-2222-2222-222222222222', '--pattern', 'migrations/*.sql'],
      environment: 'preview',
      operation: 'list',
      exitCode: 0,
      signal: null,
      timedOut: false,
      terminationSignal: null,
      spawnError: null,
      stdout: '[]\n',
      stderr: 'auth=[REDACTED]\n',
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      'cf',
      ['d1', 'migrations', 'list', '22222222-2222-2222-2222-222222222222', '--pattern', 'migrations/*.sql'],
      expect.objectContaining({
        cwd: '/repo/smkc-score-app',
        env,
        shell: false,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  });

  it('reports non-zero exit codes without treating them as success', async () => {
    const child = makeChild();
    const resultPromise = runCfPlan(makePlan(), {
      timeoutMs: 5_000,
      spawnImpl: jest.fn(() => child),
    });

    child.stderr.write('remote failure\n');
    child.emit('close', 2, null);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.signal).toBeNull();
    expect(result.stderr).toBe('remote failure\n');
  });

  it('reports signal exits distinctly', async () => {
    const child = makeChild();
    const resultPromise = runCfPlan(makePlan(), {
      timeoutMs: 5_000,
      spawnImpl: jest.fn(() => child),
    });

    child.emit('close', null, 'SIGTERM');

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBeNull();
    expect(result.signal).toBe('SIGTERM');
    expect(result.timedOut).toBe(false);
  });

  it('returns a structured ENOENT spawn failure', async () => {
    const child = makeChild();
    const resultPromise = runCfPlan(makePlan(), {
      timeoutMs: 5_000,
      spawnImpl: jest.fn(() => child),
    });
    const error = Object.assign(new Error('spawn cf ENOENT'), { code: 'ENOENT' });

    child.emit('error', error);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    expect(result.spawnError).toBe('ENOENT');
    expect(result.exitCode).toBeNull();
  });

  it('bounds a hung process with TERM then KILL and resolves even without close', async () => {
    const child = makeChild();
    const terminateImpl = jest.fn();
    const scheduled: Array<{ callback: () => void; delay: number; handle: object }> = [];
    const setTimeoutImpl = jest.fn((callback: () => void, delay: number) => {
      const handle = {};
      scheduled.push({ callback, delay, handle });
      return handle;
    });
    const clearTimeoutImpl = jest.fn();

    const resultPromise = runCfPlan(makePlan(), {
      timeoutMs: 30_000,
      killGraceMs: 1_500,
      spawnImpl: jest.fn(() => child),
      terminateImpl,
      setTimeoutImpl,
      clearTimeoutImpl,
    });

    expect(scheduled[0].delay).toBe(30_000);
    scheduled[0].callback();
    expect(terminateImpl).toHaveBeenNthCalledWith(1, child, 'SIGTERM');
    expect(scheduled[1].delay).toBe(1_500);

    scheduled[1].callback();
    const result = await resultPromise;

    expect(terminateImpl).toHaveBeenNthCalledWith(2, child, 'SIGKILL');
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.terminationSignal).toBe('SIGKILL');
    expect(result.exitCode).toBeNull();
  });

  it('kills the POSIX process group instead of only the direct child', () => {
    const child = makeChild(9876);
    const killFn = jest.fn();

    terminateProcessTree(child, 'SIGTERM', { platform: 'linux', killFn });

    expect(killFn).toHaveBeenCalledWith(-9876, 'SIGTERM');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('uses child.kill on Windows where negative process-group PIDs are unavailable', () => {
    const child = makeChild(9876);
    const killFn = jest.fn();

    terminateProcessTree(child, 'SIGTERM', { platform: 'win32', killFn });

    expect(killFn).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('fails closed for a tampered command or argument vector', () => {
    expect(() => validateCfPlan({ ...makePlan(), command: 'sh' as 'cf' })).toThrow('plan.command must be exactly "cf"');
    expect(() => validateCfPlan({ ...makePlan(), args: ['d1', 'delete', 'everything'] })).toThrow(
      'plan.args does not match the repository-owned D1 migration command shape',
    );
  });

  it('requires a finite positive timeout', () => {
    expect(() => runCfPlan(makePlan(), { timeoutMs: 0 })).toThrow('timeoutMs must be a positive integer');
    expect(() => runCfPlan(makePlan(), { timeoutMs: Number.POSITIVE_INFINITY })).toThrow(
      'timeoutMs must be a positive integer',
    );
  });
});

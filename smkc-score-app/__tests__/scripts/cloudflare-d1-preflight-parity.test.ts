import fs from 'fs';
import path from 'path';

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

type ParityModule = {
  compareColumnLabels: (a: Set<string>, b: Set<string>) => { ok: boolean; wranglerOnly: string[]; cfOnly: string[] };
  hasEmptyOutput: (r: CommandResult) => boolean;
  isCfAuthOrSetupFailure: (r: CommandResult) => boolean;
  parseCfQueryLabels: (stdout: string) => Set<string>;
  runPreviewPreflightParity: (options: {
    source: string;
    env: NodeJS.ProcessEnv;
    timeoutMs?: number;
    cfRunner?: (plan: unknown, options: { timeoutMs: number; env: NodeJS.ProcessEnv }) => Promise<CommandResult>;
    wranglerRunner?: (options: { sql: string; timeoutMs: number; env: NodeJS.ProcessEnv }) => Promise<CommandResult>;
    warn?: (message: string) => void;
  }) => Promise<{
    ok: boolean;
    environment: string;
    queriesCompared: number;
    queriesSkipped: number;
    matchedColumns: readonly string[];
  }>;
  wranglerPreflightArgs: (sql: string) => string[];
};

type QueryPlanModule = {
  planD1Query: (source: string, environment: string, sql: string, allowedSql: readonly string[]) => unknown;
  previewSchemaCheckQueries: () => readonly string[];
};

type RunnerModule = {
  validateCfPlan: (plan: unknown) => unknown;
};

const parity = jest.requireActual('../../scripts/cloudflare-d1-preflight-parity.cjs') as ParityModule;
const queryPlan = jest.requireActual('../../scripts/cloudflare-d1-query-plan.cjs') as QueryPlanModule;
const runner = jest.requireActual('../../scripts/cloudflare-cf-runner.cjs') as RunnerModule;

const WRANGLER_SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'wrangler.toml'), 'utf8');
const AUTH_ENV = { CLOUDFLARE_API_TOKEN: 'test-token-value', CLOUDFLARE_ACCOUNT_ID: 'test-account-id' };
const LABEL = 'Tournament.publicModes';
const QUERY_COUNT = 10;

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

const wranglerJson = (labels: string[]) => JSON.stringify([{ results: labels.map((l) => ({ required_column: l })) }]);
const cfJson = (labels: string[]) =>
  JSON.stringify({ success: true, errors: [], result: [{ results: labels.map((l) => ({ required_column: l })) }] });

describe('preview D1 schema-preflight parity', () => {
  it('parses cf v4 envelope and bare result arrays into required_column labels', () => {
    expect([...parity.parseCfQueryLabels(cfJson([LABEL]))]).toEqual([LABEL]);
    expect([...parity.parseCfQueryLabels(JSON.stringify([{ results: [{ required_column: LABEL }] }]))]).toEqual([
      LABEL,
    ]);
  });

  it('fails closed for malformed or unexpected cf output', () => {
    for (const bad of [
      '',
      'not json',
      '{"result":[{"rows":[]}]}',
      '[{"results":[{"required_column":1}]}]',
      '[{"results":[{}]}]',
    ]) {
      expect(() => parity.parseCfQueryLabels(bad)).toThrow();
    }
  });

  it('compares required_column label sets exactly', () => {
    expect(parity.compareColumnLabels(new Set([LABEL]), new Set([LABEL])).ok).toBe(true);
    const mismatch = parity.compareColumnLabels(new Set([LABEL]), new Set(['Other.col']));
    expect(mismatch.ok).toBe(false);
    expect(mismatch.wranglerOnly).toEqual([LABEL]);
    expect(mismatch.cfOnly).toEqual(['Other.col']);
  });

  it('builds the exact ten generated schema-check queries as the allowlist', () => {
    const queries = queryPlan.previewSchemaCheckQueries();
    expect(queries).toHaveLength(QUERY_COUNT);
    expect(new Set(queries).size).toBe(QUERY_COUNT);
    const plan = queryPlan.planD1Query(WRANGLER_SOURCE, 'preview', queries[0], queries) as {
      operation: string;
      environment: string;
      sql: string;
    };
    expect(plan.operation).toBe('query');
    expect(plan.environment).toBe('preview');
    expect(() => runner.validateCfPlan(plan)).not.toThrow();
  });

  it('validator rejects query plans outside the allowlist or outside preview', () => {
    const queries = queryPlan.previewSchemaCheckQueries();
    const plan = queryPlan.planD1Query(WRANGLER_SOURCE, 'preview', queries[0], queries) as Record<string, unknown>;
    expect(() => runner.validateCfPlan({ ...plan, sql: 'DROP TABLE x' })).toThrow(/allowedSql/);
    expect(() => runner.validateCfPlan({ ...plan, environment: 'production' })).toThrow(/preview-only/);
    expect(() => runner.validateCfPlan({ ...plan, allowedSql: [] })).toThrow(/allowedSql/);
    expect(() => queryPlan.planD1Query(WRANGLER_SOURCE, 'production', queries[0], queries)).toThrow(/preview-only/);
  });

  it('compares every schema-check query and collects matched labels', async () => {
    const wranglerRunner = jest.fn(async () => result({ stdout: wranglerJson([LABEL]) }));
    const cfRunner = jest.fn(async () => result({ stdout: cfJson([LABEL]) }));
    const outcome = await parity.runPreviewPreflightParity({
      source: WRANGLER_SOURCE,
      env: AUTH_ENV,
      wranglerRunner,
      cfRunner,
    });
    expect(wranglerRunner).toHaveBeenCalledTimes(QUERY_COUNT);
    expect(cfRunner).toHaveBeenCalledTimes(QUERY_COUNT);
    expect(outcome).toEqual({
      ok: true,
      environment: 'preview',
      queriesCompared: QUERY_COUNT,
      queriesSkipped: 0,
      matchedColumns: [LABEL],
    });
  });

  it('retries once only on completely empty output, on both tools', async () => {
    const wranglerRunner = jest
      .fn()
      .mockResolvedValueOnce(result({ ok: false, exitCode: 1 }))
      .mockResolvedValue(result({ stdout: wranglerJson([LABEL]) }));
    const cfRunner = jest
      .fn()
      .mockResolvedValueOnce(result({ ok: false, exitCode: 1 }))
      .mockResolvedValue(result({ stdout: cfJson([LABEL]) }));
    const outcome = await parity.runPreviewPreflightParity({
      source: WRANGLER_SOURCE,
      env: AUTH_ENV,
      wranglerRunner,
      cfRunner,
    });
    expect(outcome.queriesCompared).toBe(QUERY_COUNT);
    expect(wranglerRunner).toHaveBeenCalledTimes(QUERY_COUNT + 1);
    expect(cfRunner).toHaveBeenCalledTimes(QUERY_COUNT + 1);
  });

  it('does not retry on non-empty failure output', async () => {
    const wranglerRunner = jest
      .fn()
      .mockResolvedValueOnce(result({ ok: false, exitCode: 1, stderr: 'boom' }))
      .mockResolvedValue(result({ stdout: wranglerJson([LABEL]) }));
    await expect(
      parity.runPreviewPreflightParity({ source: WRANGLER_SOURCE, env: AUTH_ENV, wranglerRunner }),
    ).rejects.toThrow(/Wrangler/);
    expect(wranglerRunner).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on timeout without retrying', async () => {
    const cfRunner = jest.fn().mockResolvedValue(result({ ok: false, exitCode: null, timedOut: true }));
    const wranglerRunner = jest.fn(async () => result({ stdout: wranglerJson([LABEL]) }));
    await expect(
      parity.runPreviewPreflightParity({ source: WRANGLER_SOURCE, env: AUTH_ENV, wranglerRunner, cfRunner }),
    ).rejects.toThrow(/timed out/);
    expect(cfRunner).toHaveBeenCalledTimes(1);
  });

  it('warns and continues on cf auth/setup failure instead of reporting drift', async () => {
    const warnings: string[] = [];
    const wranglerRunner = jest.fn(async () => result({ stdout: wranglerJson([LABEL]) }));
    const cfRunner = jest.fn(async () =>
      result({ ok: false, exitCode: 1, stderr: '┌ APIError │ [error] 401 Unauthorized' }),
    );
    const outcome = await parity.runPreviewPreflightParity({
      source: WRANGLER_SOURCE,
      env: AUTH_ENV,
      wranglerRunner,
      cfRunner,
      warn: (m) => warnings.push(m),
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.queriesSkipped).toBe(QUERY_COUNT);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('fails closed on cf non-auth operational failure', async () => {
    const wranglerRunner = jest.fn(async () => result({ stdout: wranglerJson([LABEL]) }));
    const cfRunner = jest.fn(async () => result({ ok: false, exitCode: 2, stderr: 'something exploded' }));
    await expect(
      parity.runPreviewPreflightParity({ source: WRANGLER_SOURCE, env: AUTH_ENV, wranglerRunner, cfRunner }),
    ).rejects.toThrow(/cf preview schema-check query failed/);
  });

  it('fails closed on label-set mismatch', async () => {
    const wranglerRunner = jest.fn(async () => result({ stdout: wranglerJson([LABEL]) }));
    const cfRunner = jest.fn(async () => result({ stdout: cfJson(['Other.col']) }));
    await expect(
      parity.runPreviewPreflightParity({ source: WRANGLER_SOURCE, env: AUTH_ENV, wranglerRunner, cfRunner }),
    ).rejects.toThrow(/mismatch/);
  });

  it('fails closed when both sides return no rows at all', async () => {
    const wranglerRunner = jest.fn(async () => result({ stdout: wranglerJson([]) }));
    const cfRunner = jest.fn(async () => result({ stdout: cfJson([]) }));
    await expect(
      parity.runPreviewPreflightParity({ source: WRANGLER_SOURCE, env: AUTH_ENV, wranglerRunner, cfRunner }),
    ).rejects.toThrow(/no required-column rows/);
  });

  it('requires explicit Cloudflare automation credentials before any command runs', async () => {
    await expect(parity.runPreviewPreflightParity({ source: WRANGLER_SOURCE, env: {} })).rejects.toThrow(
      /CLOUDFLARE_API_TOKEN/,
    );
  });
});

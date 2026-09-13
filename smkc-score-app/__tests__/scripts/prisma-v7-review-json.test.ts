import {
  PRISMA_V7_REVIEW_PROBES,
  PROBE_MAX_BUFFER_BYTES,
  PROBE_TIMEOUT_MS,
  REVIEW_SCHEMA_VERSION,
  collectPrismaV7ReviewEvidence,
  parseCliOptions,
  parseProbeJson,
  runProbe,
  validateProbeManifest,
} from '../../scripts/prisma-v7-review-json.cjs';

describe('Prisma 7 aggregate JSON review evidence', () => {
  it('collects all seven probes in a stable order without interpreting migration readiness', () => {
    const calls: string[] = [];
    const evidence = collectPrismaV7ReviewEvidence({
      run: (probe) => {
        calls.push(probe.key);
        return { observedBy: probe.key, ready: probe.key === 'readiness' ? false : true };
      },
    });

    expect(calls).toEqual([
      'readiness',
      'driverAdapter',
      'typescriptPrerequisites',
      'environmentLoading',
      'removedSurfaces',
      'supportSurface',
      'esmSurface',
    ]);
    expect(evidence).toEqual({
      schemaVersion: REVIEW_SCHEMA_VERSION,
      probeCount: 7,
      probes: {
        readiness: { observedBy: 'readiness', ready: false },
        driverAdapter: { observedBy: 'driverAdapter', ready: true },
        typescriptPrerequisites: { observedBy: 'typescriptPrerequisites', ready: true },
        environmentLoading: { observedBy: 'environmentLoading', ready: true },
        removedSurfaces: { observedBy: 'removedSurfaces', ready: true },
        supportSurface: { observedBy: 'supportSurface', ready: true },
        esmSurface: { observedBy: 'esmSurface', ready: true },
      },
    });
  });

  it('executes every current probe through its JSON CLI mode', () => {
    const evidence = collectPrismaV7ReviewEvidence();

    expect(evidence.schemaVersion).toBe(REVIEW_SCHEMA_VERSION);
    expect(evidence.probeCount).toBe(PRISMA_V7_REVIEW_PROBES.length);
    expect(Object.keys(evidence.probes)).toEqual(PRISMA_V7_REVIEW_PROBES.map((probe) => probe.key));
    for (const probeEvidence of Object.values(evidence.probes)) {
      expect(probeEvidence).toEqual(expect.any(Object));
    }
  });

  it('keeps probe script paths and JSON invocation surface explicit', () => {
    expect(PRISMA_V7_REVIEW_PROBES).toEqual([
      { key: 'readiness', script: 'prisma-v7-readiness.cjs' },
      { key: 'driverAdapter', script: 'prisma-v7-driver-adapter.cjs' },
      { key: 'typescriptPrerequisites', script: 'prisma-v7-typescript-prereqs.cjs' },
      { key: 'environmentLoading', script: 'prisma-v7-env-loading.cjs' },
      { key: 'removedSurfaces', script: 'prisma-v7-removed-surfaces.cjs' },
      { key: 'supportSurface', script: 'prisma-v7-support-surface.cjs' },
      { key: 'esmSurface', script: 'prisma-v7-esm-surface.cjs' },
    ]);
  });

  it('validates unique probe keys and scripts before running any child probe', () => {
    let calls = 0;
    const run = () => {
      calls += 1;
      return {};
    };

    expect(() =>
      collectPrismaV7ReviewEvidence({
        run,
        probes: [
          { key: 'readiness', script: 'first.cjs' },
          { key: 'readiness', script: 'second.cjs' },
        ],
      }),
    ).toThrow('duplicate key: readiness');
    expect(() =>
      collectPrismaV7ReviewEvidence({
        run,
        probes: [
          { key: 'first', script: 'shared.cjs' },
          { key: 'second', script: 'shared.cjs' },
        ],
      }),
    ).toThrow('duplicate script: shared.cjs');
    expect(calls).toBe(0);
  });

  it('rejects malformed probe manifest entries', () => {
    expect(() => validateProbeManifest([])).toThrow('must be a non-empty array');
    expect(() => validateProbeManifest([null])).toThrow('entry 0 must be an object');
    expect(() => validateProbeManifest([{ key: '', script: 'probe.cjs' }])).toThrow('non-empty key');
    expect(() => validateProbeManifest([{ key: 'probe', script: '   ' }])).toThrow('non-empty script');
  });

  it('bounds child probe execution and output while preserving JSON parsing', () => {
    const spawn = jest.fn(() => ({ status: 0, stdout: '{"ready":true}\n', stderr: '' }));
    const evidence = runProbe(
      { key: 'readiness', script: 'prisma-v7-readiness.cjs' },
      { cwd: '/tmp/review', env: {}, spawn },
    );

    expect(evidence).toEqual({ ready: true });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][0]).toBe(process.execPath);
    expect(spawn.mock.calls[0][1]).toEqual([expect.stringMatching(/prisma-v7-readiness\.cjs$/), '--json']);
    expect(spawn.mock.calls[0][2]).toMatchObject({
      cwd: '/tmp/review',
      env: {},
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: PROBE_TIMEOUT_MS,
      killSignal: 'SIGTERM',
      maxBuffer: PROBE_MAX_BUFFER_BYTES,
    });
  });

  it('reports child probe timeouts as fail-closed operational failures', () => {
    const timeoutError = Object.assign(new Error('spawnSync timed out'), { code: 'ETIMEDOUT' });
    const spawn = jest.fn(() => ({ error: timeoutError, status: null, stdout: '', stderr: '' }));

    expect(() =>
      runProbe({ key: 'readiness', script: 'prisma-v7-readiness.cjs' }, { spawn, timeoutMs: 1_234 }),
    ).toThrow('readiness probe timed out after 1234ms');
  });

  it('reports child probe output overflow as a fail-closed operational failure', () => {
    const bufferError = Object.assign(new Error('spawnSync ENOBUFS'), { code: 'ENOBUFS' });
    const spawn = jest.fn(() => ({ error: bufferError, status: null, stdout: '', stderr: '' }));

    expect(() =>
      runProbe({ key: 'readiness', script: 'prisma-v7-readiness.cjs' }, { spawn, maxBufferBytes: 4_096 }),
    ).toThrow('readiness probe output exceeded 4096 bytes');
  });

  it('reports child probe signal termination explicitly', () => {
    const spawn = jest.fn(() => ({ status: null, signal: 'SIGKILL', stdout: '', stderr: '' }));

    expect(() => runProbe({ key: 'readiness', script: 'prisma-v7-readiness.cjs' }, { spawn })).toThrow(
      'readiness probe terminated by signal SIGKILL',
    );
  });

  it('accepts one JSON object and rejects malformed or ambiguous probe evidence', () => {
    expect(parseProbeJson('readiness', '{"ready":false}\n')).toEqual({ ready: false });
    expect(() => parseProbeJson('readiness', '')).toThrow('returned empty JSON evidence');
    expect(() => parseProbeJson('readiness', 'not-json')).toThrow('returned invalid JSON');
    expect(() => parseProbeJson('readiness', '[]')).toThrow('must be an object');
    expect(() => parseProbeJson('readiness', 'null')).toThrow('must be an object');
  });

  it('rejects unsupported aggregate command arguments', () => {
    expect(parseCliOptions([])).toEqual({});
    expect(() => parseCliOptions(['--json'])).toThrow('unsupported option: --json');
  });
});

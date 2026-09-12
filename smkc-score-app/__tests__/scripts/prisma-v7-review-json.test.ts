import {
  PRISMA_V7_REVIEW_PROBES,
  REVIEW_SCHEMA_VERSION,
  collectPrismaV7ReviewEvidence,
  parseCliOptions,
  parseProbeJson,
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

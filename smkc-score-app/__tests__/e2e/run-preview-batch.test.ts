import { describe, expect, it, jest } from '@jest/globals';
import packageJson from '../../package.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const batchRunner = require('../../e2e/run-preview-batch') as typeof import('../../e2e/run-preview-batch');

describe('preview E2E batch runner', () => {
  it('requires at least one target script', () => {
    expect(() => batchRunner.parseTargetScripts([])).toThrow('Missing preview E2E target script names.');
  });

  it('runs target scripts sequentially with the same preview environment', async () => {
    const env = { E2E_BASE_URL: 'https://preview.example.com' };
    const runTarget = jest.fn<(targetScript: string, runtimeEnv: typeof env) => Promise<number>>()
      .mockResolvedValue(0);

    await expect(
      batchRunner.runTargetScripts(['tc-bm.js', 'tc-mr.js', 'tc-gp.js'], env, runTarget),
    ).resolves.toBe(0);

    expect(runTarget.mock.calls).toEqual([
      ['tc-bm.js', env],
      ['tc-mr.js', env],
      ['tc-gp.js', env],
    ]);
  });

  it('stops after the first failed target', async () => {
    const env = { E2E_BASE_URL: 'https://preview.example.com' };
    const runTarget = jest.fn<(targetScript: string, runtimeEnv: typeof env) => Promise<number>>()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);

    await expect(
      batchRunner.runTargetScripts(['tc-bm.js', 'tc-mr.js', 'tc-gp.js'], env, runTarget),
    ).resolves.toBe(2);

    expect(runTarget.mock.calls).toEqual([
      ['tc-bm.js', env],
      ['tc-mr.js', env],
    ]);
  });

  it('exposes a focused CDM reconciliation acceptance command', () => {
    expect(packageJson.scripts['e2e:preview:cdm-reconciliation']).toBe(
      'E2E_TESTS=TC-3040 node e2e/run-preview-batch.js tc-bm.js tc-mr.js tc-gp.js',
    );
  });
});

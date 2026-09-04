import { describe, expect, it } from '@jest/globals';
import packageJson from '../../package.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const batchRunner = require('../../e2e/run-preview-batch') as typeof import('../../e2e/run-preview-batch');

describe('preview E2E batch runner', () => {
  it('requires at least one target script', () => {
    expect(() => batchRunner.parseTargetScripts([])).toThrow('Missing preview E2E target script names.');
  });

  it('runs target scripts sequentially with the same preview environment', async () => {
    const env = { E2E_BASE_URL: 'https://preview.example.com' };
    const calls: Array<[string, typeof env]> = [];
    const runTarget = async (targetScript: string, runtimeEnv: typeof env) => {
      calls.push([targetScript, runtimeEnv]);
      return 0;
    };

    await expect(
      batchRunner.runTargetScripts(['tc-bm.js', 'tc-mr.js', 'tc-gp.js'], env, runTarget),
    ).resolves.toBe(0);

    expect(calls).toEqual([
      ['tc-bm.js', env],
      ['tc-mr.js', env],
      ['tc-gp.js', env],
    ]);
  });

  it('stops after the first failed target', async () => {
    const env = { E2E_BASE_URL: 'https://preview.example.com' };
    const calls: Array<[string, typeof env]> = [];
    const exitCodes = [0, 2, 0];
    const runTarget = async (targetScript: string, runtimeEnv: typeof env) => {
      calls.push([targetScript, runtimeEnv]);
      return exitCodes.shift() ?? 0;
    };

    await expect(
      batchRunner.runTargetScripts(['tc-bm.js', 'tc-mr.js', 'tc-gp.js'], env, runTarget),
    ).resolves.toBe(2);

    expect(calls).toEqual([
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

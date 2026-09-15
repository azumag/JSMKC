import { spawnSync } from 'child_process';
import path from 'path';

const appDir = path.resolve(__dirname, '../..');
const scriptPath = path.join(appDir, 'scripts', 'verify-required-status-checks.cjs');

function runVerifier(payload: unknown) {
  return spawnSync(process.execPath, [scriptPath, '--stdin', '--json'], {
    cwd: appDir,
    encoding: 'utf8',
    input: JSON.stringify(payload),
  });
}

describe('required status check verifier', () => {
  it('passes when main is protected and both standard CI checks are enforced', () => {
    const result = runVerifier({
      name: 'main',
      protected: true,
      protection: {
        enabled: true,
        required_status_checks: {
          enforcement_level: 'everyone',
          contexts: ['Lint & Test'],
          checks: [{ context: 'Prisma / D1 migration parity', app_id: null }],
        },
      },
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      branch: 'main',
      protectedBranch: true,
      enforcementLevel: 'everyone',
      missingChecks: [],
    });
  });

  it('fails closed when required-check enforcement is disabled', () => {
    const result = runVerifier({
      name: 'main',
      protected: true,
      protection: {
        enabled: true,
        required_status_checks: {
          enforcement_level: 'off',
          contexts: ['Lint & Test', 'Prisma / D1 migration parity'],
          checks: [],
        },
      },
    });

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      enforcementLevel: 'off',
      missingChecks: [],
    });
  });

  it('reports the exact required check that is missing', () => {
    const result = runVerifier({
      name: 'main',
      protected: true,
      protection: {
        enabled: true,
        required_status_checks: {
          enforcement_level: 'everyone',
          contexts: ['Lint & Test'],
          checks: [],
        },
      },
    });

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      observedChecks: ['Lint & Test'],
      missingChecks: ['Prisma / D1 migration parity'],
    });
  });
});

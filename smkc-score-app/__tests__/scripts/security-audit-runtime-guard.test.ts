import fs from 'fs';
import path from 'path';

describe('security audit npm runtime guard', () => {
  const helperPath = path.resolve(__dirname, '..', '..', 'scripts', 'security-audit.js');
  const helper = fs.readFileSync(helperPath, 'utf8');

  it('verifies the pinned npm runtime before invoking npm audit', () => {
    expect(helper).toContain("require('./verify-npm-version.js')");

    const runtimeGuardIndex = helper.indexOf('verifyNpmRuntime();');
    const auditSpawnIndex = helper.indexOf("spawnSync('npm', ['audit', '--json', '--audit-level=low']");

    expect(runtimeGuardIndex).toBeGreaterThanOrEqual(0);
    expect(auditSpawnIndex).toBeGreaterThan(runtimeGuardIndex);
  });
});

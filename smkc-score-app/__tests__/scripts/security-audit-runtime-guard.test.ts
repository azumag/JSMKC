import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
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

  it('validates the lockfile schema before invoking npm audit', () => {
    expect(helper).toContain("require('./security-audit-lockfile.js')");

    const lockfileGuardIndex = helper.indexOf('hasExpectedSecurityAuditLockfileShape(lockfile)');
    const auditSpawnIndex = helper.indexOf("spawnSync('npm', ['audit', '--json', '--audit-level=low']");

    expect(lockfileGuardIndex).toBeGreaterThanOrEqual(0);
    expect(auditSpawnIndex).toBeGreaterThan(lockfileGuardIndex);
  });

  it('fails before npm audit when direct execution sees unsupported lockfile schema', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-lockfile-'));
    const binDir = path.join(tempDir, 'bin');
    const npmPath = path.join(binDir, 'npm');
    const auditMarker = path.join(tempDir, 'audit-invoked');

    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ packageManager: 'npm@10.9.4' }));
    fs.writeFileSync(
      path.join(tempDir, 'package-lock.json'),
      JSON.stringify({ lockfileVersion: 2, packages: { '': {} } }),
    );
    fs.writeFileSync(
      npmPath,
      String.raw`#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] === '--version') {
  process.stdout.write('10.9.4\n');
  process.exit(0);
}
fs.writeFileSync(process.env.AUDIT_MARKER, 'invoked');
process.stdout.write('{}\n');
`,
      { mode: 0o755 },
    );

    try {
      const result = spawnSync(process.execPath, [helperPath], {
        cwd: tempDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          AUDIT_MARKER: auditMarker,
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Security audit requires package-lock.json lockfileVersion 3');
      expect(fs.existsSync(auditMarker)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

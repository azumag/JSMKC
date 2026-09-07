import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('security audit npm runtime guard', () => {
  const helperPath = path.resolve(__dirname, '..', '..', 'scripts', 'security-audit.js');
  const helper = fs.readFileSync(helperPath, 'utf8');

  it('verifies the pinned npm runtime before invoking npm audit', () => {
    expect(helper).toContain("require('./verify-npm-version.js')");

    const manifestLoadIndex = helper.indexOf('manifest = loadPackageManifest();');
    const runtimeGuardIndex = helper.indexOf('verifyNpmRuntime({ manifest });');
    const auditSpawnIndex = helper.indexOf(
      "spawnSync('npm', ['audit', '--json', '--audit-level=low', '--package-lock-only']",
    );

    expect(manifestLoadIndex).toBeGreaterThanOrEqual(0);
    expect(runtimeGuardIndex).toBeGreaterThan(manifestLoadIndex);
    expect(auditSpawnIndex).toBeGreaterThan(runtimeGuardIndex);
  });

  it('validates the lockfile schema before invoking npm audit', () => {
    expect(helper).toContain("require('./security-audit-lockfile.js')");

    const lockfileGuardIndex = helper.indexOf('hasExpectedSecurityAuditLockfileShape(lockfile)');
    const auditSpawnIndex = helper.indexOf(
      "spawnSync('npm', ['audit', '--json', '--audit-level=low', '--package-lock-only']",
    );

    expect(lockfileGuardIndex).toBeGreaterThanOrEqual(0);
    expect(auditSpawnIndex).toBeGreaterThan(lockfileGuardIndex);
  });

  it('passes the validated lockfile snapshot to npm audit instead of local node_modules state', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-lockfile-input-'));
    const binDir = path.join(tempDir, 'bin');
    const npmPath = path.join(binDir, 'npm');
    const auditArgsMarker = path.join(tempDir, 'audit-args.json');

    fs.mkdirSync(binDir);
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'example-app', version: '1.0.0', packageManager: 'npm@10.9.4' }),
    );
    fs.writeFileSync(
      path.join(tempDir, 'package-lock.json'),
      JSON.stringify({
        name: 'example-app',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: { '': { name: 'example-app', version: '1.0.0' } },
      }),
    );
    fs.writeFileSync(
      npmPath,
      String.raw`#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] === '--version') {
  process.stdout.write('10.9.4\n');
  process.exit(0);
}
fs.writeFileSync(process.env.AUDIT_ARGS_MARKER, JSON.stringify(process.argv.slice(2)));
process.stdout.write(JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    dependencies: { prod: 0, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 0 },
  },
}) + '\n');
`,
      { mode: 0o755 },
    );

    try {
      const result = spawnSync(process.execPath, [helperPath], {
        cwd: tempDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          AUDIT_ARGS_MARKER: auditArgsMarker,
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
        },
      });

      expect(result.status).toBe(0);
      expect(JSON.parse(fs.readFileSync(auditArgsMarker, 'utf8'))).toEqual([
        'audit',
        '--json',
        '--audit-level=low',
        '--package-lock-only',
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails before npm audit when package.json and lockfile package identity differ', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-package-identity-'));
    const binDir = path.join(tempDir, 'bin');
    const npmPath = path.join(binDir, 'npm');
    const auditMarker = path.join(tempDir, 'audit-invoked');

    fs.mkdirSync(binDir);
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'example-app', version: '1.0.0', packageManager: 'npm@10.9.4' }),
    );
    fs.writeFileSync(
      path.join(tempDir, 'package-lock.json'),
      JSON.stringify({
        name: 'stale-app',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: { '': { name: 'example-app', version: '1.0.0' } },
      }),
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
      expect(result.stderr).toContain('package.json name/version to match');
      expect(fs.existsSync(auditMarker)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails before npm audit when package.json and lockfile dependency snapshots differ', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-manifest-lockfile-'));
    const binDir = path.join(tempDir, 'bin');
    const npmPath = path.join(binDir, 'npm');
    const auditMarker = path.join(tempDir, 'audit-invoked');

    fs.mkdirSync(binDir);
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'example-app',
        version: '1.0.0',
        packageManager: 'npm@10.9.4',
        dependencies: { example: '^1.0.0' },
      }),
    );
    fs.writeFileSync(
      path.join(tempDir, 'package-lock.json'),
      JSON.stringify({
        name: 'example-app',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': { name: 'example-app', version: '1.0.0', dependencies: { example: '^2.0.0' } },
        },
      }),
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
      expect(result.stderr).toContain('package.json dependency declarations to match');
      expect(fs.existsSync(auditMarker)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails before npm audit when package.json overrides target the temporary exception chain', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-overrides-'));
    const binDir = path.join(tempDir, 'bin');
    const npmPath = path.join(binDir, 'npm');
    const auditMarker = path.join(tempDir, 'audit-invoked');

    fs.mkdirSync(binDir);
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'example-app',
        version: '1.0.0',
        packageManager: 'npm@10.9.4',
        overrides: { 'deepmerge-ts': '8.0.0' },
      }),
    );
    fs.writeFileSync(
      path.join(tempDir, 'package-lock.json'),
      JSON.stringify({
        name: 'example-app',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: { '': { name: 'example-app', version: '1.0.0' } },
      }),
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
      expect(result.stderr).toContain('package.json overrides targeting its dependency chain');
      expect(fs.existsSync(auditMarker)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it.each([
    ['unsupported lockfile version', { lockfileVersion: 2, packages: { '': {} } }],
    ['malformed non-root package entry', { lockfileVersion: 3, packages: { '': {}, 'node_modules/example': null } }],
  ])('fails before npm audit when direct execution sees %s', (_case, lockfile) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-lockfile-'));
    const binDir = path.join(tempDir, 'bin');
    const npmPath = path.join(binDir, 'npm');
    const auditMarker = path.join(tempDir, 'audit-invoked');

    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ packageManager: 'npm@10.9.4' }));
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify(lockfile));
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

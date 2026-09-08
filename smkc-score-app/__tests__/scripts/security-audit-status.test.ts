import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getSecurityAuditExceptionStatus,
  writeGitHubOutputs,
} from '../../scripts/security-audit-status.js';

const appRoot = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(path.join(appRoot, 'package-lock.json'), 'utf8'));

describe('security audit exception status', () => {
  it('reports the current #3114 exception context as active before its review deadline', () => {
    expect(
      getSecurityAuditExceptionStatus({
        manifest,
        lockfile,
        now: new Date('2026-09-08T00:00:00.000Z'),
      }),
    ).toEqual({
      state: 'active',
      deadline: '2026-10-06T00:00:00.000Z',
      message: 'the exact #3114 temporary exception context is still active',
    });
  });

  it('reports the same context as expired at the review deadline', () => {
    expect(
      getSecurityAuditExceptionStatus({
        manifest,
        lockfile,
        now: new Date('2026-10-06T00:00:00.000Z'),
      }).state,
    ).toBe('expired');
  });

  it('reports context-changed after a forward remediation changes the vulnerable dependency', () => {
    const remediatedLockfile = structuredClone(lockfile);
    remediatedLockfile.packages['node_modules/deepmerge-ts'].version = '8.0.1';
    remediatedLockfile.packages['node_modules/@prisma/config'].dependencies['deepmerge-ts'] = '8.0.1';

    expect(
      getSecurityAuditExceptionStatus({
        manifest,
        lockfile: remediatedLockfile,
        now: new Date('2026-09-08T00:00:00.000Z'),
      }).state,
    ).toBe('context-changed');
  });

  it('fails status evaluation when manifest and lockfile identity drift', () => {
    const mismatchedManifest = { ...manifest, version: '0.0.0-drift' };

    expect(
      getSecurityAuditExceptionStatus({
        manifest: mismatchedManifest,
        lockfile,
        now: new Date('2026-09-08T00:00:00.000Z'),
      }).state,
    ).toBe('invalid-input');
  });

  it('publishes the state and deadline as GitHub Actions step outputs', () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-status-'));
    const outputPath = path.join(outputDirectory, 'github-output');

    try {
      const status = getSecurityAuditExceptionStatus({
        manifest,
        lockfile,
        now: new Date('2026-09-08T00:00:00.000Z'),
      });

      writeGitHubOutputs(status, outputPath);

      expect(fs.readFileSync(outputPath, 'utf8')).toBe(
        'state=active\ndeadline=2026-10-06T00:00:00.000Z\n',
      );
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});

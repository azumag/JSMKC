import fs from 'node:fs';
import path from 'node:path';

import {
  formatSecurityAuditExceptionStatus,
  getSecurityAuditExceptionStatus,
} from '../../scripts/security-audit-status.js';

const appRoot = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(path.join(appRoot, 'package-lock.json'), 'utf8'));
const activeNow = new Date('2026-09-08T00:00:00.000Z');

describe('security audit status diagnostic reasons', () => {
  it('distinguishes the three fail-closed input preconditions', () => {
    const invalidLockfile = structuredClone(lockfile);
    delete invalidLockfile.packages;

    expect(
      getSecurityAuditExceptionStatus({ manifest, lockfile: invalidLockfile, now: activeNow }),
    ).toMatchObject({
      state: 'invalid-input',
      reason: 'lockfile-shape-invalid',
    });

    const mismatchedIdentityManifest = { ...manifest, version: '0.0.0-drift' };
    expect(
      getSecurityAuditExceptionStatus({ manifest: mismatchedIdentityManifest, lockfile, now: activeNow }),
    ).toMatchObject({
      state: 'invalid-input',
      reason: 'package-identity-mismatch',
    });

    const mismatchedSnapshotManifest = structuredClone(manifest);
    mismatchedSnapshotManifest.devDependencies.prisma = '^6.19.2';
    expect(
      getSecurityAuditExceptionStatus({ manifest: mismatchedSnapshotManifest, lockfile, now: activeNow }),
    ).toMatchObject({
      state: 'invalid-input',
      reason: 'manifest-lockfile-snapshot-mismatch',
    });
  });

  it('labels each non-active exception transition without changing the active shape', () => {
    const remediatedLockfile = structuredClone(lockfile);
    remediatedLockfile.packages['node_modules/deepmerge-ts'].version = '8.0.2';
    remediatedLockfile.packages['node_modules/@prisma/config'].dependencies['deepmerge-ts'] = '8.0.2';
    expect(
      getSecurityAuditExceptionStatus({ manifest, lockfile: remediatedLockfile, now: activeNow }),
    ).toMatchObject({
      state: 'forward-remediation-candidate',
      reason: 'forward-remediation-candidate',
    });

    const changedLockfile = structuredClone(lockfile);
    changedLockfile.packages['node_modules/deepmerge-ts'].version = '7.1.6';
    expect(
      getSecurityAuditExceptionStatus({ manifest, lockfile: changedLockfile, now: activeNow }),
    ).toMatchObject({
      state: 'context-changed',
      reason: 'temporary-exception-context-changed',
    });

    expect(
      getSecurityAuditExceptionStatus({
        manifest,
        lockfile,
        now: new Date('2026-10-06T00:00:00.000Z'),
      }),
    ).toMatchObject({
      state: 'expired',
      reason: 'temporary-exception-expired',
    });

    expect(getSecurityAuditExceptionStatus({ manifest, lockfile, now: activeNow })).not.toHaveProperty('reason');
  });

  it('includes non-active reasons in both human-readable and JSON diagnostics', () => {
    const mismatchedManifest = { ...manifest, version: '0.0.0-drift' };
    const status = getSecurityAuditExceptionStatus({ manifest: mismatchedManifest, lockfile, now: activeNow });

    expect(formatSecurityAuditExceptionStatus(status)).toContain('status reason: package-identity-mismatch\n');
    expect(JSON.parse(formatSecurityAuditExceptionStatus(status, { json: true }))).toMatchObject({
      state: 'invalid-input',
      reason: 'package-identity-mismatch',
    });
  });
});

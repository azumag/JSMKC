import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getSecurityAuditExceptionStatus,
  getTrackedDependencyVersions,
  writeGitHubOutputs,
} from '../../scripts/security-audit-status.js';

const appRoot = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(path.join(appRoot, 'package-lock.json'), 'utf8'));

describe('security audit exception status', () => {
  it('reports the current #3114 exception context and tracked dependency versions as active before its review deadline', () => {
    expect(
      getSecurityAuditExceptionStatus({
        manifest,
        lockfile,
        now: new Date('2026-09-08T00:00:00.000Z'),
      }),
    ).toEqual({
      state: 'active',
      deadline: '2026-10-06T00:00:00.000Z',
      versions: {
        prisma: '6.19.3',
        prismaConfig: '6.19.3',
        deepmergeTs: '7.1.5',
      },
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

  it('reports context-changed with forward-remediation version evidence', () => {
    const remediatedLockfile = structuredClone(lockfile);
    remediatedLockfile.packages['node_modules/deepmerge-ts'].version = '8.0.1';
    remediatedLockfile.packages['node_modules/@prisma/config'].dependencies['deepmerge-ts'] = '8.0.1';

    const status = getSecurityAuditExceptionStatus({
      manifest,
      lockfile: remediatedLockfile,
      now: new Date('2026-09-08T00:00:00.000Z'),
    });

    expect(status.state).toBe('context-changed');
    expect(status.versions).toEqual({
      prisma: '6.19.3',
      prismaConfig: '6.19.3',
      deepmergeTs: '8.0.1',
    });
  });

  it('uses null when a tracked dependency version cannot be read', () => {
    const incompleteLockfile = structuredClone(lockfile);
    delete incompleteLockfile.packages['node_modules/@prisma/config'];

    expect(getTrackedDependencyVersions(incompleteLockfile)).toEqual({
      prisma: '6.19.3',
      prismaConfig: null,
      deepmergeTs: '7.1.5',
    });
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

  it('publishes status and dependency versions as GitHub Actions step outputs', () => {
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
        'state=active\n' +
          'deadline=2026-10-06T00:00:00.000Z\n' +
          'prisma_version=6.19.3\n' +
          'prisma_config_version=6.19.3\n' +
          'deepmerge_ts_version=7.1.5\n',
      );
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});

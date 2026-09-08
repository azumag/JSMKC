import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  formatSecurityAuditExceptionStatus,
  getDaysUntilReviewDeadline,
  getSecurityAuditExceptionStatus,
  getTrackedDependencyVersions,
  parseCliOptions,
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
      checkedAt: '2026-09-08T00:00:00.000Z',
      daysUntilDeadline: 28,
      versions: {
        prisma: '6.19.3',
        prismaConfig: '6.19.3',
        deepmergeTs: '7.1.5',
      },
      message: 'the exact #3114 temporary exception context is still active',
    });
  });

  it('accepts only the documented JSON output flag', () => {
    expect(parseCliOptions([])).toEqual({ json: false });
    expect(parseCliOptions(['--json'])).toEqual({ json: true });
    expect(parseCliOptions(['--json', '--json'])).toEqual({ json: true });
  });

  it('rejects unknown CLI arguments instead of silently falling back to human-readable output', () => {
    expect(() => parseCliOptions(['--jsno'])).toThrow('Unknown option: --jsno');
    expect(() => parseCliOptions(['--json', '--quiet'])).toThrow('Unknown option: --quiet');
    expect(() => parseCliOptions(['--quiet', '--pretty'])).toThrow('Unknown options: --quiet, --pretty');
  });

  it('formats the same evidence as machine-readable JSON for automation', () => {
    const status = getSecurityAuditExceptionStatus({
      manifest,
      lockfile,
      now: new Date('2026-09-08T00:00:00.000Z'),
    });

    expect(JSON.parse(formatSecurityAuditExceptionStatus(status, { json: true }))).toEqual(status);
  });

  it('keeps the existing human-readable output as the default format', () => {
    const status = getSecurityAuditExceptionStatus({
      manifest,
      lockfile,
      now: new Date('2026-09-08T00:00:00.000Z'),
    });

    expect(formatSecurityAuditExceptionStatus(status)).toContain('security audit exception status: active\n');
    expect(formatSecurityAuditExceptionStatus(status)).toContain('days until review deadline: 28\n');
    expect(formatSecurityAuditExceptionStatus(status)).toContain('deepmerge-ts: 7.1.5\n');
  });

  it('reports deadline distance without rounding an overdue partial day back to zero', () => {
    expect(getDaysUntilReviewDeadline('2026-10-06T00:00:00.000Z', new Date('2026-10-05T12:00:00.000Z'))).toBe(1);
    expect(getDaysUntilReviewDeadline('2026-10-06T00:00:00.000Z', new Date('2026-10-06T00:00:00.000Z'))).toBe(0);
    expect(getDaysUntilReviewDeadline('2026-10-06T00:00:00.000Z', new Date('2026-10-06T00:01:00.000Z'))).toBe(-1);
  });

  it('returns null when deadline distance cannot be computed safely', () => {
    expect(getDaysUntilReviewDeadline('not-a-date', new Date('2026-09-08T00:00:00.000Z'))).toBeNull();
    expect(getDaysUntilReviewDeadline('2026-10-06T00:00:00.000Z', new Date(Number.NaN))).toBeNull();
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

  it('rejects unsafe version text before publishing GitHub Actions outputs', () => {
    const unsafeLockfile = structuredClone(lockfile);
    unsafeLockfile.packages['node_modules/deepmerge-ts'].version = '7.1.5\nforged_output=1';

    expect(getTrackedDependencyVersions(unsafeLockfile)).toEqual({
      prisma: '6.19.3',
      prismaConfig: '6.19.3',
      deepmergeTs: null,
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
          'checked_at=2026-09-08T00:00:00.000Z\n' +
          'deadline=2026-10-06T00:00:00.000Z\n' +
          'days_until_deadline=28\n' +
          'prisma_version=6.19.3\n' +
          'prisma_config_version=6.19.3\n' +
          'deepmerge_ts_version=7.1.5\n',
      );
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});

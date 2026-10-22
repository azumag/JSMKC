import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getSecurityAuditExceptionStatus, writeGitHubOutputs } from '../../scripts/security-audit-status.js';

import { withPrisma6ExceptionContext } from '../helpers/prisma6-exception-context';

const appRoot = path.resolve(__dirname, '../..');
const repositoryManifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const repositoryLockfile = JSON.parse(fs.readFileSync(path.join(appRoot, 'package-lock.json'), 'utf8'));
// The classifier cases below describe the pre-#3114-fix Prisma 6 chain, which the
// repository itself no longer contains after the Prisma 7 migration.
const { manifest, lockfile } = withPrisma6ExceptionContext(repositoryManifest, repositoryLockfile);
const activeNow = new Date('2026-09-08T00:00:00.000Z');

function renderOutputs(status: ReturnType<typeof getSecurityAuditExceptionStatus>): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-status-reason-'));
  const outputPath = path.join(directory, 'github-output');

  try {
    writeGitHubOutputs(status, outputPath);
    return fs.readFileSync(outputPath, 'utf8');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe('security audit status GitHub Actions reason output', () => {
  it('preserves the existing active Actions output contract', () => {
    const status = getSecurityAuditExceptionStatus({ manifest, lockfile, now: activeNow });
    const output = renderOutputs(status);

    expect(status).not.toHaveProperty('reason');
    expect(output).toContain('state=active\n');
    expect(output).not.toContain('\nreason=');
  });

  it('publishes the machine-readable reason for fail-closed states', () => {
    const mismatchedManifest = { ...manifest, version: '0.0.0-drift' };
    const status = getSecurityAuditExceptionStatus({ manifest: mismatchedManifest, lockfile, now: activeNow });

    expect(status).toMatchObject({ state: 'invalid-input', reason: 'package-identity-mismatch' });
    expect(renderOutputs(status)).toContain('reason=package-identity-mismatch\n');
  });
});

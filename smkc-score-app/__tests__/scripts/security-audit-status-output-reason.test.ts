import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getSecurityAuditExceptionStatus, writeGitHubOutputs } from '../../scripts/security-audit-status.js';

const appRoot = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(path.join(appRoot, 'package-lock.json'), 'utf8'));
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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeGitHubOutputs } from '../../scripts/security-audit-status.js';

const baseStatus = {
  state: 'invalid-input',
  reason: 'lockfile-shape-invalid',
  trackingIssue: 3114,
  advisory: 'GHSA-ggr8-5vv4-36mx',
  advisoryRange: '<8.0.0',
  checkedAt: '2026-09-13T00:00:00.000Z',
  deadline: '2026-10-06T00:00:00.000Z',
  daysUntilDeadline: 23,
  versions: {
    prisma: '6.19.3',
    prismaConfig: '6.19.3',
    deepmergeTs: '7.1.5',
  },
  requirements: {
    prismaConfigDeepmergeTs: '7.1.5',
  },
};

describe('security audit status GitHub Actions output safety', () => {
  it('rejects line-breaking values before writing the output file', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-output-safety-'));
    const outputPath = path.join(directory, 'github-output');

    try {
      expect(() =>
        writeGitHubOutputs(
          {
            ...baseStatus,
            reason: 'lockfile-shape-invalid\ninjected=true',
          },
          outputPath,
        ),
      ).toThrow('refusing unsafe GitHub Actions output for reason');
      expect(fs.existsSync(outputPath)).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects oversized values before writing the output file', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-security-audit-output-size-'));
    const outputPath = path.join(directory, 'github-output');

    try {
      expect(() =>
        writeGitHubOutputs(
          {
            ...baseStatus,
            advisory: `GHSA-${'x'.repeat(201)}`,
          },
          outputPath,
        ),
      ).toThrow('refusing unsafe GitHub Actions output for advisory');
      expect(fs.existsSync(outputPath)).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

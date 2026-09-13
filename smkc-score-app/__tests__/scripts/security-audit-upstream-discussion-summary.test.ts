import fs from 'fs';
import os from 'os';
import path from 'path';

import { writeGitHubSummary } from '../../scripts/security-audit-upstream-issue.js';

const issue = {
  issueNumber: 30052,
  state: 'open',
  stateReason: null,
  commentCount: 12,
  checkedAt: '2026-09-13T06:30:00.000Z',
  updatedAt: '2026-09-11T06:16:42Z',
  closedAt: null,
  url: 'https://github.com/prisma/orm/issues/30052',
  latestComment: {
    id: 5630319995,
    author: 'DoingItNow',
    authorAssociation: 'NONE',
    createdAt: '2026-09-11T06:16:42Z',
    updatedAt: '2026-09-11T06:16:42Z',
    url: 'https://github.com/prisma/orm/issues/30052#issuecomment-5630319995',
    body: 'DO_NOT_LEAK_EXTERNAL_COMMENT_BODY',
  },
  fixPullRequest: {
    pullRequestNumber: 30189,
    state: 'closed',
    merged: true,
    baseRef: 'v7',
    mergeCommitSha: '93118fdeba185110fb7b0bd5e945461405baf65a',
    mergedAt: '2026-09-01T10:00:06Z',
    updatedAt: '2026-09-01T10:00:09Z',
    url: 'https://github.com/prisma/orm/pull/30189',
  },
};

describe('Prisma upstream discussion Job Summary', () => {
  let tempDir: string;
  let summaryPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-upstream-summary-'));
    summaryPath = path.join(tempDir, 'summary.md');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('publishes only validated latest-comment metadata to the Job Summary', () => {
    writeGitHubSummary(issue, summaryPath);

    const summary = fs.readFileSync(summaryPath, 'utf8');

    expect(summary).toContain('Prisma upstream discussion evidence (advisory only)');
    expect(summary).toContain('| Comment count | `12` |');
    expect(summary).toContain('| Latest comment ID | `5630319995` |');
    expect(summary).toContain('| Latest comment author | `DoingItNow` |');
    expect(summary).toContain('| Latest comment author association | `NONE` |');
    expect(summary).toContain('| Latest comment created at | `2026-09-11T06:16:42Z` |');
    expect(summary).toContain('| Latest comment updated at | `2026-09-11T06:16:42Z` |');
    expect(summary).toContain(
      '| Latest comment URL | `https://github.com/prisma/orm/issues/30052#issuecomment-5630319995` |',
    );
    expect(summary).not.toContain('DO_NOT_LEAK_EXTERNAL_COMMENT_BODY');
    expect(summary).toContain('discussion does not change the compatible remediation gate');
  });

  it('uses explicit none markers when the issue has no comments', () => {
    writeGitHubSummary({ ...issue, commentCount: 0, latestComment: null }, summaryPath);

    const summary = fs.readFileSync(summaryPath, 'utf8');
    expect(summary).toContain('| Comment count | `0` |');
    expect(summary).toContain('| Latest comment ID | `none` |');
    expect(summary).toContain('| Latest comment author | `none` |');
    expect(summary).toContain('| Latest comment URL | `none` |');
  });
});

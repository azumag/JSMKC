import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  UPSTREAM_FIX_PR_API_URL,
  UPSTREAM_FIX_PR_BASE_REF,
  UPSTREAM_FIX_PR_MERGE_COMMIT_SHA,
  UPSTREAM_ISSUE_API_URL,
  UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS,
  fetchUpstreamIssue,
  formatUpstreamIssue,
  getCheckedAt,
  normalizeUpstreamFixPullRequest,
  normalizeUpstreamIssue,
  parseCliOptions,
  writeGitHubOutputs,
} from '../../scripts/security-audit-upstream-issue.js';

const upstreamPayload = {
  number: 30052,
  state: 'open',
  state_reason: null,
  comments: 0,
  updated_at: '2026-09-11T12:34:56Z',
  closed_at: null,
  html_url: 'https://github.com/prisma/orm/issues/30052',
};

const upstreamFixPayload = {
  number: 30189,
  state: 'closed',
  merged: true,
  updated_at: '2026-09-01T10:00:09Z',
  merged_at: '2026-09-01T10:00:06Z',
  merge_commit_sha: '93118fdeba185110fb7b0bd5e945461405baf65a',
  html_url: 'https://github.com/prisma/orm/pull/30189',
  base: { ref: 'v7' },
};

const checkedAt = '2026-09-13T01:23:45.000Z';
const clock = () => new Date(checkedAt);

function createFetchMock(issuePayload = upstreamPayload, fixPayload = upstreamFixPayload) {
  return jest
    .fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue(issuePayload) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue(fixPayload) });
}

describe('Prisma upstream issue probe', () => {
  it('fetches the tracked issue and merged fix PR with one bounded read-only request contract', async () => {
    const fetchImpl = createFetchMock();

    await expect(fetchUpstreamIssue({ fetchImpl, token: 'test-token', clock })).resolves.toEqual({
      issueNumber: 30052,
      state: 'open',
      stateReason: null,
      commentCount: 0,
      checkedAt,
      updatedAt: '2026-09-11T12:34:56Z',
      closedAt: null,
      url: 'https://github.com/prisma/orm/issues/30052',
      latestComment: null,
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
    });

    expect(UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([UPSTREAM_ISSUE_API_URL, UPSTREAM_FIX_PR_API_URL]);

    for (const [, request] of fetchImpl.mock.calls) {
      expect(request).toEqual(
        expect.objectContaining({
          redirect: 'error',
          signal: expect.any(AbortSignal),
          headers: expect.objectContaining({
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer test-token',
            'User-Agent': 'jsmkc-security-audit-review',
            'X-GitHub-Api-Version': '2022-11-28',
          }),
        }),
      );
    }
    expect(fetchImpl.mock.calls[0][1].signal).toBe(fetchImpl.mock.calls[1][1].signal);
  });

  it('preserves an explicitly supplied abort signal for both upstream requests', async () => {
    const controller = new AbortController();
    const fetchImpl = createFetchMock();

    await fetchUpstreamIssue({ fetchImpl, signal: controller.signal, clock });

    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal);
    expect(fetchImpl.mock.calls[1][1].signal).toBe(controller.signal);
  });

  it('does not require a token for public upstream review', async () => {
    const fetchImpl = createFetchMock();

    await fetchUpstreamIssue({ fetchImpl, token: '', clock });

    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    expect(fetchImpl.mock.calls[1][1].headers).not.toHaveProperty('Authorization');
  });

  it('captures closure reason and timestamp without treating closure as remediation', () => {
    expect(
      normalizeUpstreamIssue({
        ...upstreamPayload,
        state: 'closed',
        state_reason: 'not_planned',
        updated_at: '2026-09-14T10:00:00Z',
        closed_at: '2026-09-14T09:59:00Z',
      }),
    ).toEqual({
      issueNumber: 30052,
      state: 'closed',
      stateReason: 'not_planned',
      commentCount: 0,
      updatedAt: '2026-09-14T10:00:00Z',
      closedAt: '2026-09-14T09:59:00Z',
      url: 'https://github.com/prisma/orm/issues/30052',
    });
  });

  it('accepts reopened issue evidence only while the issue is open', () => {
    expect(normalizeUpstreamIssue({ ...upstreamPayload, state_reason: 'reopened' })).toMatchObject({
      state: 'open',
      stateReason: 'reopened',
      closedAt: null,
    });
  });

  it('pins the historical Prisma fix PR to the merged v7 change', () => {
    expect(normalizeUpstreamFixPullRequest(upstreamFixPayload)).toEqual({
      pullRequestNumber: 30189,
      state: 'closed',
      merged: true,
      baseRef: UPSTREAM_FIX_PR_BASE_REF,
      mergeCommitSha: UPSTREAM_FIX_PR_MERGE_COMMIT_SHA,
      mergedAt: '2026-09-01T10:00:06Z',
      updatedAt: '2026-09-01T10:00:09Z',
      url: 'https://github.com/prisma/orm/pull/30189',
    });
  });

  it('fails closed on issue HTTP errors and malformed issue evidence', async () => {
    const failedFetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(fetchUpstreamIssue({ fetchImpl: failedFetch, clock })).rejects.toThrow('HTTP 403');

    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, number: 1 })).toThrow('unexpected upstream issue number');
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, state: 'unknown' })).toThrow(
      'unexpected upstream issue state',
    );
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, updated_at: 'yesterday' })).toThrow(
      'must be a valid UTC timestamp',
    );
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, updated_at: '2026-02-31T12:34:56Z' })).toThrow(
      'must be a valid UTC timestamp',
    );
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, html_url: 'https://example.test/30052' })).toThrow(
      'does not match prisma/orm#30052',
    );
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, state_reason: 'superseded' })).toThrow(
      'unexpected upstream issue state_reason',
    );
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, state_reason: 'completed' })).toThrow(
      'open upstream issue cannot have state_reason completed',
    );
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, closed_at: '2026-09-14T09:59:00Z' })).toThrow(
      'open upstream issue must have closed_at=null',
    );
    expect(() =>
      normalizeUpstreamIssue({
        ...upstreamPayload,
        state: 'closed',
        state_reason: 'reopened',
        closed_at: '2026-09-14T09:59:00Z',
      }),
    ).toThrow('closed upstream issue cannot have state_reason reopened');
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, state: 'closed' })).toThrow(
      'closed upstream issue must include closed_at',
    );
    expect(() =>
      normalizeUpstreamIssue({
        ...upstreamPayload,
        state: 'closed',
        state_reason: 'completed',
        closed_at: 'yesterday',
      }),
    ).toThrow('closed_at must be null or a valid UTC timestamp');
    expect(() =>
      normalizeUpstreamIssue({
        ...upstreamPayload,
        state: 'closed',
        state_reason: 'completed',
        closed_at: '2026-02-31T09:59:00Z',
      }),
    ).toThrow('closed_at must be null or a valid UTC timestamp');
    expect(() =>
      normalizeUpstreamIssue({
        ...upstreamPayload,
        state: 'closed',
        state_reason: 'completed',
        updated_at: '2026-09-14T09:58:00Z',
        closed_at: '2026-09-14T09:59:00Z',
      }),
    ).toThrow('closed_at after updated_at');
    expect(() => getCheckedAt(() => new Date('invalid'))).toThrow('clock returned an invalid date');
  });

  it('fails closed when the merged fix PR can no longer be attested', async () => {
    const failedFixFetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue(upstreamPayload) })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchUpstreamIssue({ fetchImpl: failedFixFetch, clock })).rejects.toThrow(
      'upstream fix pull request request failed with HTTP 503',
    );

    expect(() => normalizeUpstreamFixPullRequest({ ...upstreamFixPayload, number: 1 })).toThrow(
      'unexpected upstream fix pull request number',
    );
    expect(() => normalizeUpstreamFixPullRequest({ ...upstreamFixPayload, state: 'open', merged: false })).toThrow(
      'must remain merged and closed',
    );
    expect(() => normalizeUpstreamFixPullRequest({ ...upstreamFixPayload, base: { ref: 'main' } })).toThrow(
      'base must remain v7',
    );
    expect(() => normalizeUpstreamFixPullRequest({ ...upstreamFixPayload, merge_commit_sha: 'a'.repeat(40) })).toThrow(
      'merge commit changed unexpectedly',
    );
    expect(() => normalizeUpstreamFixPullRequest({ ...upstreamFixPayload, merged_at: '2026-02-31T10:00:06Z' })).toThrow(
      'merged_at must be a valid UTC timestamp',
    );
    expect(() =>
      normalizeUpstreamFixPullRequest({
        ...upstreamFixPayload,
        updated_at: '2026-09-01T10:00:05Z',
      }),
    ).toThrow('merged_at after updated_at');
  });

  it('fails closed when the observation clock predates any upstream evidence update', async () => {
    const fetchImpl = createFetchMock(upstreamPayload, {
      ...upstreamFixPayload,
      updated_at: '2026-09-12T12:34:56Z',
    });

    await expect(fetchUpstreamIssue({ fetchImpl, clock: () => new Date('2026-09-12T12:34:55.999Z') })).rejects.toThrow(
      'check clock is earlier than upstream evidence updated_at',
    );
  });

  it('supports human and JSON output without conflating observation and upstream timestamps', async () => {
    const issue = await fetchUpstreamIssue({ fetchImpl: createFetchMock(), clock });
    const human = formatUpstreamIssue(issue);

    expect(human).toContain('Prisma upstream issue: #30052');
    expect(human).toContain('state: open');
    expect(human).toContain('state reason: none');
    expect(human).toContain('comment count: 0');
    expect(human).toContain(`checked at: ${checkedAt}`);
    expect(human).toContain('updated at: 2026-09-11T12:34:56Z');
    expect(human).toContain('closed at: none');
    expect(human).toContain('latest comment id: none');
    expect(human).toContain('upstream fix PR: #30189');
    expect(human).toContain('fix PR base: v7');
    expect(human).toContain(`fix PR merge commit: ${UPSTREAM_FIX_PR_MERGE_COMMIT_SHA}`);
    expect(JSON.parse(formatUpstreamIssue(issue, { json: true }))).toEqual(issue);
  });

  it('publishes validated GitHub Actions outputs atomically', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-upstream-issue-'));
    const outputPath = path.join(tempDir, 'github-output');
    const issue = await fetchUpstreamIssue({ fetchImpl: createFetchMock(), clock });

    try {
      writeGitHubOutputs(issue, outputPath);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe(
        'issue_number=30052\n' +
          'state=open\n' +
          'state_reason=none\n' +
          'comment_count=0\n' +
          `checked_at=${checkedAt}\n` +
          'updated_at=2026-09-11T12:34:56Z\n' +
          'closed_at=none\n' +
          'url=https://github.com/prisma/orm/issues/30052\n' +
          'latest_comment_id=none\n' +
          'latest_comment_author=none\n' +
          'latest_comment_author_association=none\n' +
          'latest_comment_created_at=none\n' +
          'latest_comment_updated_at=none\n' +
          'latest_comment_url=none\n' +
          'fix_pr_number=30189\n' +
          'fix_pr_state=closed\n' +
          'fix_pr_merged=true\n' +
          'fix_pr_base_ref=v7\n' +
          `fix_pr_merge_commit_sha=${UPSTREAM_FIX_PR_MERGE_COMMIT_SHA}\n` +
          'fix_pr_merged_at=2026-09-01T10:00:06Z\n' +
          'fix_pr_updated_at=2026-09-01T10:00:09Z\n' +
          'fix_pr_url=https://github.com/prisma/orm/pull/30189\n',
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects unsupported CLI arguments', () => {
    expect(parseCliOptions([])).toEqual({ json: false });
    expect(parseCliOptions(['--json'])).toEqual({ json: true });
    expect(() => parseCliOptions(['--pretty'])).toThrow('Unknown option: --pretty');
  });
});

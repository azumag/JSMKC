import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  UPSTREAM_ISSUE_API_URL,
  fetchUpstreamIssue,
  formatUpstreamIssue,
  normalizeUpstreamIssue,
  parseCliOptions,
  writeGitHubOutputs,
} from '../../scripts/security-audit-upstream-issue.js';

const upstreamPayload = {
  number: 30052,
  state: 'open',
  updated_at: '2026-09-11T12:34:56Z',
  html_url: 'https://github.com/prisma/orm/issues/30052',
};

describe('Prisma upstream issue probe', () => {
  it('fetches the tracked issue with a read-only GitHub API request', async () => {
    const json = jest.fn().mockResolvedValue(upstreamPayload);
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, json });

    await expect(fetchUpstreamIssue({ fetchImpl, token: 'test-token' })).resolves.toEqual({
      issueNumber: 30052,
      state: 'open',
      updatedAt: '2026-09-11T12:34:56Z',
      url: 'https://github.com/prisma/orm/issues/30052',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      UPSTREAM_ISSUE_API_URL,
      expect.objectContaining({
        redirect: 'follow',
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer test-token',
          'User-Agent': 'jsmkc-security-audit-review',
          'X-GitHub-Api-Version': '2022-11-28',
        }),
      }),
    );
  });

  it('does not require a token for public issue review', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(upstreamPayload),
    });

    await fetchUpstreamIssue({ fetchImpl, token: '' });

    const request = fetchImpl.mock.calls[0][1];
    expect(request.headers).not.toHaveProperty('Authorization');
  });

  it('fails closed on HTTP errors and malformed evidence', async () => {
    const failedFetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(fetchUpstreamIssue({ fetchImpl: failedFetch })).rejects.toThrow('HTTP 403');

    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, number: 1 })).toThrow('unexpected upstream issue number');
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, state: 'unknown' })).toThrow(
      'unexpected upstream issue state',
    );
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, updated_at: 'yesterday' })).toThrow(
      'must be a UTC timestamp',
    );
    expect(() => normalizeUpstreamIssue({ ...upstreamPayload, html_url: 'https://example.test/30052' })).toThrow(
      'does not match prisma/orm#30052',
    );
  });

  it('supports human and JSON output without changing issue semantics', () => {
    const issue = normalizeUpstreamIssue(upstreamPayload);

    expect(formatUpstreamIssue(issue)).toContain('Prisma upstream issue: #30052');
    expect(formatUpstreamIssue(issue)).toContain('state: open');
    expect(JSON.parse(formatUpstreamIssue(issue, { json: true }))).toEqual(issue);
  });

  it('publishes validated GitHub Actions outputs atomically', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-upstream-issue-'));
    const outputPath = path.join(tempDir, 'github-output');

    try {
      writeGitHubOutputs(normalizeUpstreamIssue(upstreamPayload), outputPath);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe(
        'issue_number=30052\n' +
          'state=open\n' +
          'updated_at=2026-09-11T12:34:56Z\n' +
          'url=https://github.com/prisma/orm/issues/30052\n',
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

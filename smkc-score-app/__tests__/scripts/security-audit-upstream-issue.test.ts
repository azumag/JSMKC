import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  UPSTREAM_ISSUE_API_URL,
  UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS,
  fetchUpstreamIssue,
  formatUpstreamIssue,
  getCheckedAt,
  normalizeUpstreamIssue,
  parseCliOptions,
  writeGitHubOutputs,
} from '../../scripts/security-audit-upstream-issue.js';

const upstreamPayload = {
  number: 30052,
  state: 'open',
  state_reason: null,
  updated_at: '2026-09-11T12:34:56Z',
  closed_at: null,
  html_url: 'https://github.com/prisma/orm/issues/30052',
};

const checkedAt = '2026-09-13T01:23:45.000Z';
const clock = () => new Date(checkedAt);

describe('Prisma upstream issue probe', () => {
  it('fetches the tracked issue with a read-only GitHub API request and observation timestamp', async () => {
    const json = jest.fn().mockResolvedValue(upstreamPayload);
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, json });

    await expect(fetchUpstreamIssue({ fetchImpl, token: 'test-token', clock })).resolves.toEqual({
      issueNumber: 30052,
      state: 'open',
      stateReason: null,
      checkedAt,
      updatedAt: '2026-09-11T12:34:56Z',
      closedAt: null,
      url: 'https://github.com/prisma/orm/issues/30052',
    });

    expect(UPSTREAM_ISSUE_REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(fetchImpl).toHaveBeenCalledWith(
      UPSTREAM_ISSUE_API_URL,
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
  });

  it('preserves an explicitly supplied abort signal for deterministic callers', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(upstreamPayload),
    });

    await fetchUpstreamIssue({ fetchImpl, signal: controller.signal, clock });

    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('does not require a token for public issue review', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(upstreamPayload),
    });

    await fetchUpstreamIssue({ fetchImpl, token: '', clock });

    const request = fetchImpl.mock.calls[0][1];
    expect(request.headers).not.toHaveProperty('Authorization');
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

  it('fails closed on HTTP errors and malformed evidence', async () => {
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

  it('fails closed when the observation clock predates the upstream update', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(upstreamPayload),
    });

    await expect(fetchUpstreamIssue({ fetchImpl, clock: () => new Date('2026-09-11T12:34:55.999Z') })).rejects.toThrow(
      'check clock is earlier than upstream updated_at',
    );
  });

  it('supports human and JSON output without conflating checked and upstream update times', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(upstreamPayload),
    });
    const issue = await fetchUpstreamIssue({ fetchImpl, clock });

    expect(formatUpstreamIssue(issue)).toContain('Prisma upstream issue: #30052');
    expect(formatUpstreamIssue(issue)).toContain('state: open');
    expect(formatUpstreamIssue(issue)).toContain('state reason: none');
    expect(formatUpstreamIssue(issue)).toContain(`checked at: ${checkedAt}`);
    expect(formatUpstreamIssue(issue)).toContain('updated at: 2026-09-11T12:34:56Z');
    expect(formatUpstreamIssue(issue)).toContain('closed at: none');
    expect(JSON.parse(formatUpstreamIssue(issue, { json: true }))).toEqual(issue);
  });

  it('publishes validated GitHub Actions outputs atomically', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsmkc-upstream-issue-'));
    const outputPath = path.join(tempDir, 'github-output');
    const issue = {
      ...normalizeUpstreamIssue(upstreamPayload),
      checkedAt,
    };

    try {
      writeGitHubOutputs(issue, outputPath);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe(
        'issue_number=30052\n' +
          'state=open\n' +
          'state_reason=none\n' +
          `checked_at=${checkedAt}\n` +
          'updated_at=2026-09-11T12:34:56Z\n' +
          'closed_at=none\n' +
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

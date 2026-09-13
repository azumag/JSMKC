import {
  UPSTREAM_FIX_PR_API_URL,
  UPSTREAM_ISSUE_API_URL,
  UPSTREAM_ISSUE_COMMENTS_API_URL,
  fetchUpstreamIssue,
  getLatestCommentApiUrl,
  normalizeLatestUpstreamIssueComment,
} from '../../scripts/security-audit-upstream-issue.js';

const issuePayload = {
  number: 30052,
  state: 'open',
  state_reason: null,
  comments: 1,
  updated_at: '2026-09-11T06:16:42Z',
  closed_at: null,
  html_url: 'https://github.com/prisma/orm/issues/30052',
};

const fixPayload = {
  number: 30189,
  state: 'closed',
  merged: true,
  updated_at: '2026-09-01T10:00:09Z',
  merged_at: '2026-09-01T10:00:06Z',
  merge_commit_sha: '93118fdeba185110fb7b0bd5e945461405baf65a',
  html_url: 'https://github.com/prisma/orm/pull/30189',
  base: { ref: 'v7' },
};

const comment = {
  id: 5630319995,
  issue_url: UPSTREAM_ISSUE_API_URL,
  html_url: 'https://github.com/prisma/orm/issues/30052#issuecomment-5630319995',
  user: { login: 'DoingItNow' },
  author_association: 'NONE',
  created_at: '2026-09-11T06:16:42Z',
  updated_at: '2026-09-11T06:16:42Z',
};

const response = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: jest.fn().mockResolvedValue(payload),
});

describe('Prisma upstream discussion evidence', () => {
  it('derives a stable latest-comment URL from the issue snapshot count', () => {
    expect(getLatestCommentApiUrl(0)).toBeNull();
    expect(getLatestCommentApiUrl(3)).toBe(`${UPSTREAM_ISSUE_COMMENTS_API_URL}?per_page=1&page=3`);
    expect(() => getLatestCommentApiUrl(-1)).toThrow('non-negative safe integer');
  });

  it('normalizes canonical metadata without carrying the comment body', () => {
    expect(normalizeLatestUpstreamIssueComment([{ ...comment, body: 'external text' }])).toEqual({
      id: 5630319995,
      author: 'DoingItNow',
      authorAssociation: 'NONE',
      createdAt: '2026-09-11T06:16:42Z',
      updatedAt: '2026-09-11T06:16:42Z',
      url: 'https://github.com/prisma/orm/issues/30052#issuecomment-5630319995',
    });
  });

  it('fails closed when canonical comment identity or timestamps do not match', () => {
    expect(() => normalizeLatestUpstreamIssueComment([])).toThrow('exactly one comment');
    expect(() =>
      normalizeLatestUpstreamIssueComment([{ ...comment, issue_url: 'https://example.test/issue' }]),
    ).toThrow('issue_url does not match');
    expect(() =>
      normalizeLatestUpstreamIssueComment([{ ...comment, updated_at: '2026-02-31T06:16:42Z' }]),
    ).toThrow('updated_at must be a valid UTC timestamp');
  });

  it('fetches the latest discussion using the same bounded request contract', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(issuePayload))
      .mockResolvedValueOnce(response(fixPayload))
      .mockResolvedValueOnce(response([comment]));

    const result = await fetchUpstreamIssue({
      fetchImpl,
      token: 'test-token',
      clock: () => new Date('2026-09-13T06:30:00Z'),
    });

    expect(result.commentCount).toBe(1);
    expect(result.latestComment?.id).toBe(5630319995);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      UPSTREAM_ISSUE_API_URL,
      UPSTREAM_FIX_PR_API_URL,
      `${UPSTREAM_ISSUE_COMMENTS_API_URL}?per_page=1&page=1`,
    ]);
    expect(fetchImpl.mock.calls[2][1].signal).toBe(fetchImpl.mock.calls[0][1].signal);
    expect(fetchImpl.mock.calls[2][1].redirect).toBe('error');
  });
});

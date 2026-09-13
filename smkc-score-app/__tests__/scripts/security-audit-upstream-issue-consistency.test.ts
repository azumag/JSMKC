import {
  assertConsistentUpstreamIssueEvidence,
  fetchConsistentUpstreamIssue,
  toStableSnapshot,
} from '../../scripts/security-audit-upstream-issue-consistency.js';

const evidence = {
  issueNumber: 30052,
  state: 'open',
  stateReason: null,
  commentCount: 3,
  checkedAt: '2026-09-13T07:15:00.000Z',
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

describe('Prisma upstream evidence snapshot consistency', () => {
  it('ignores probe-local checkedAt while comparing upstream evidence', () => {
    const later = { ...evidence, checkedAt: '2026-09-13T07:16:00.000Z' };

    expect(toStableSnapshot(evidence)).toEqual(toStableSnapshot(later));
    expect(() => assertConsistentUpstreamIssueEvidence(evidence, later)).not.toThrow();
  });

  it('fails closed when issue metadata changes between reads', () => {
    expect(() =>
      assertConsistentUpstreamIssueEvidence(evidence, {
        ...evidence,
        commentCount: evidence.commentCount + 1,
      }),
    ).toThrow('changed during consistency check');
  });

  it('fails closed when latest-comment or fix-PR evidence changes between reads', () => {
    expect(() =>
      assertConsistentUpstreamIssueEvidence(evidence, {
        ...evidence,
        latestComment: { ...evidence.latestComment, id: evidence.latestComment.id + 1 },
      }),
    ).toThrow('changed during consistency check');

    expect(() =>
      assertConsistentUpstreamIssueEvidence(evidence, {
        ...evidence,
        fixPullRequest: { ...evidence.fixPullRequest, updatedAt: '2026-09-01T10:01:09Z' },
      }),
    ).toThrow('changed during consistency check');
  });

  it('returns only the second snapshot after two equivalent reads', async () => {
    const second = { ...evidence, checkedAt: '2026-09-13T07:16:00.000Z' };
    const fetchIssue = jest.fn().mockResolvedValueOnce(evidence).mockResolvedValueOnce(second);

    await expect(fetchConsistentUpstreamIssue({ fetchIssue })).resolves.toBe(second);
    expect(fetchIssue).toHaveBeenCalledTimes(2);
  });

  it('does not publish evidence when the two reads disagree', async () => {
    const fetchIssue = jest
      .fn()
      .mockResolvedValueOnce(evidence)
      .mockResolvedValueOnce({ ...evidence, state: 'closed', closedAt: '2026-09-13T07:15:30Z' });

    await expect(fetchConsistentUpstreamIssue({ fetchIssue })).rejects.toThrow('changed during consistency check');
  });
});

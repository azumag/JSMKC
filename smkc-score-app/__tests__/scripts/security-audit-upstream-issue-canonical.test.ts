import {
  fetchConsistentUpstreamIssue,
  fetchUpstreamIssue,
  normalizeUpstreamIssue,
  parseCliOptions,
} from '../../scripts/security-audit-upstream-issue.js';

describe('canonical Prisma upstream issue probe entrypoint', () => {
  it('preserves the legacy probe API while exposing the consistency probe', () => {
    expect(typeof fetchUpstreamIssue).toBe('function');
    expect(typeof normalizeUpstreamIssue).toBe('function');
    expect(typeof parseCliOptions).toBe('function');
    expect(typeof fetchConsistentUpstreamIssue).toBe('function');
  });
});

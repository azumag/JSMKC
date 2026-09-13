import { getTemporaryExceptionReviewDeadline } from '../../scripts/security-audit.js';
import { readRepoFile } from '../helpers/e2e-cases';

describe('security audit review deadline documentation contract', () => {
  it('documents the runtime temporary-exception review deadline', () => {
    const policy = readRepoFile('docs', 'security-audit-policy.md');
    const reviewDeadline = getTemporaryExceptionReviewDeadline();

    expect(policy).toContain(reviewDeadline);
    expect(policy).toContain('再レビュー期限');
    expect(policy).toContain('例外を自動延長しない');
  });
});

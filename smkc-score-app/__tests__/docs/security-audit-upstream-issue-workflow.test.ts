import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  id?: string;
  if?: string;
  'continue-on-error'?: boolean;
  env?: Record<string, string>;
  name?: string;
  run?: string;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface WorkflowConfig {
  jobs?: Record<string, WorkflowJob>;
}

describe('Prisma upstream issue workflow evidence', () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
  const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'security-audit-review.yml');
  const runbookPath = path.join(repositoryRoot, 'docs', 'security-audit-review-runbook.md');

  let steps: WorkflowStep[];
  let runbook: string;

  beforeAll(() => {
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    steps = workflow.jobs?.audit?.steps ?? [];
    runbook = fs.readFileSync(runbookPath, 'utf8');

    if (steps.length === 0) {
      throw new Error('security-audit-review.yml の jobs.audit.steps が見つかりません');
    }
  });

  it('collects issue and merged-fix-PR evidence as advisory-only data', () => {
    const nextMajorTimestampStep = steps.find((step) => step.id === 'next_major_upstream_timestamp');
    const upstreamIssueStep = steps.find((step) => step.id === 'upstream_issue');
    const prismaReadinessStep = steps.find((step) => step.id === 'prisma_v7_readiness');

    expect(upstreamIssueStep?.if).toBe('always()');
    expect(upstreamIssueStep?.['continue-on-error']).toBe(true);
    expect(upstreamIssueStep?.env).toEqual({
      GITHUB_TOKEN: '${{ github.token }}',
    });
    expect(upstreamIssueStep?.run?.trim()).toBe('node scripts/security-audit-upstream-issue.js');
    expect(steps.indexOf(nextMajorTimestampStep as WorkflowStep)).toBeLessThan(
      steps.indexOf(upstreamIssueStep as WorkflowStep),
    );
    expect(steps.indexOf(upstreamIssueStep as WorkflowStep)).toBeLessThan(
      steps.indexOf(prismaReadinessStep as WorkflowStep),
    );
  });

  it('publishes issue/fix-PR outputs in the Job summary without changing the compatible gate', () => {
    const upstreamIssueStep = steps.find((step) => step.id === 'upstream_issue');
    const mainSummaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');
    const upstreamSummaryStep = steps.find((step) => step.name === 'Summarize upstream issue and fix PR evidence');
    const gateStep = steps.find((step) => step.id === 'compatible_upstream_gate');

    expect(upstreamSummaryStep?.if).toBe('always()');
    expect(upstreamSummaryStep?.env).toMatchObject({
      UPSTREAM_ISSUE_OUTCOME: '${{ steps.upstream_issue.outcome }}',
      UPSTREAM_ISSUE_NUMBER: '${{ steps.upstream_issue.outputs.issue_number }}',
      UPSTREAM_ISSUE_STATE: '${{ steps.upstream_issue.outputs.state }}',
      UPSTREAM_ISSUE_STATE_REASON: '${{ steps.upstream_issue.outputs.state_reason }}',
      UPSTREAM_ISSUE_CHECKED_AT: '${{ steps.upstream_issue.outputs.checked_at }}',
      UPSTREAM_ISSUE_UPDATED_AT: '${{ steps.upstream_issue.outputs.updated_at }}',
      UPSTREAM_ISSUE_CLOSED_AT: '${{ steps.upstream_issue.outputs.closed_at }}',
      UPSTREAM_FIX_PR_NUMBER: '${{ steps.upstream_issue.outputs.fix_pr_number }}',
      UPSTREAM_FIX_PR_BASE_REF: '${{ steps.upstream_issue.outputs.fix_pr_base_ref }}',
      UPSTREAM_FIX_PR_MERGE_COMMIT_SHA: '${{ steps.upstream_issue.outputs.fix_pr_merge_commit_sha }}',
      UPSTREAM_FIX_PR_MERGED_AT: '${{ steps.upstream_issue.outputs.fix_pr_merged_at }}',
    });
    expect(upstreamSummaryStep?.run).toContain('Prisma upstream issue and fix PR evidence (advisory only)');
    expect(upstreamSummaryStep?.run).toContain('UPSTREAM_ISSUE_OUTCOME');
    expect(upstreamSummaryStep?.run).toContain('UPSTREAM_ISSUE_STATE');
    expect(upstreamSummaryStep?.run).toContain('UPSTREAM_ISSUE_CHECKED_AT');
    expect(upstreamSummaryStep?.run).toContain('UPSTREAM_FIX_PR_MERGE_COMMIT_SHA');
    expect(upstreamSummaryStep?.run).toContain('UPSTREAM_FIX_PR_MERGED_AT');

    expect(steps.indexOf(upstreamIssueStep as WorkflowStep)).toBeLessThan(
      steps.indexOf(upstreamSummaryStep as WorkflowStep),
    );
    expect(steps.indexOf(mainSummaryStep as WorkflowStep)).toBeLessThan(
      steps.indexOf(upstreamSummaryStep as WorkflowStep),
    );
    expect(steps.indexOf(upstreamSummaryStep as WorkflowStep)).toBeLessThan(steps.indexOf(gateStep as WorkflowStep));

    expect(gateStep?.env).toEqual({
      COMPATIBLE_UPSTREAM_OUTCOME: '${{ steps.compatible_upstream.outcome }}',
      COMPATIBLE_UPSTREAM_STATE: '${{ steps.compatible_upstream.outputs.state }}',
    });
    expect(gateStep?.env).not.toHaveProperty('UPSTREAM_ISSUE_OUTCOME');
    expect(gateStep?.run).not.toContain('upstream_issue');
  });

  it('documents the advisory boundary and evidence fields in the review runbook', () => {
    expect(runbook).toContain('`security-audit-upstream-issue.js`');
    expect(runbook).toContain('prisma/orm#30052');
    expect(runbook).toContain('prisma/orm#30189');
    expect(runbook).toContain('`issue_number`');
    expect(runbook).toContain('`state_reason`');
    expect(runbook).toContain('`checked_at`');
    expect(runbook).toContain('`fix_pr_merge_commit_sha`');
    expect(runbook).toContain('compatible upstream gate');
    expect(runbook).toContain('advisory-only');
  });
});

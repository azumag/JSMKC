import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  id?: string;
  if?: string;
  env?: Record<string, string>;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  defaults?: { run?: { 'working-directory'?: string } };
  steps?: WorkflowStep[];
}

interface WorkflowConfig {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
}

interface PackageManifest {
  packageManager?: string;
}

describe('manual security audit review workflow', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');
  const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
  const runbookPath = path.resolve(__dirname, '..', '..', '..', 'docs', 'security-audit-review-runbook.md');

  let workflow: WorkflowConfig;
  let auditJob: WorkflowJob;
  let packageManifest: PackageManifest;
  let runbook: string;

  beforeAll(() => {
    workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    packageManifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;
    runbook = fs.readFileSync(runbookPath, 'utf8');
    auditJob = workflow.jobs?.audit ?? {};

    if (!auditJob.steps?.length) {
      throw new Error('security-audit-review.yml の jobs.audit.steps が見つかりません');
    }
  });

  it('is manual-only and does not add recurring Actions usage', () => {
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(workflow.on).not.toHaveProperty('schedule');
  });

  it('uses read-only repository permissions', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });

  it('runs from the application working directory', () => {
    expect(auditJob.defaults?.run?.['working-directory']).toBe('smkc-score-app');
  });

  it('pins the same npm runtime as package.json before npm ci', () => {
    const packageManager = packageManifest.packageManager;
    expect(packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);

    const steps = auditJob.steps ?? [];
    const pinStep = steps.find((step) => step.run?.includes('npm install --global npm@'));
    const installStep = steps.find((step) => step.run?.trim() === 'npm ci');

    expect(pinStep).toBeDefined();
    expect(installStep).toBeDefined();
    expect(pinStep?.run).toContain(`npm install --global ${packageManager}`);
    expect(pinStep?.run).toContain(`test "$(npm --version)" = "${packageManager?.replace(/^npm@/, '')}"`);
    expect(steps.indexOf(pinStep as WorkflowStep)).toBeLessThan(steps.indexOf(installStep as WorkflowStep));
  });

  it('keeps the fail-closed preflight/status/audit order', () => {
    const steps = auditJob.steps ?? [];
    const preflightStep = steps.find((step) => step.id === 'lockfile_preflight');
    const statusStep = steps.find((step) => step.id === 'exception_status');
    const auditStep = steps.find((step) => step.id === 'canonical_audit');

    expect(preflightStep?.run?.trim()).toBe('node scripts/security-audit-lockfile.js');
    expect(statusStep?.run?.trim()).toBe('node scripts/security-audit-status.js');
    expect(auditStep?.run?.trim()).toBe('node scripts/security-audit.js');
    expect(steps.indexOf(preflightStep as WorkflowStep)).toBeLessThan(steps.indexOf(statusStep as WorkflowStep));
    expect(steps.indexOf(statusStep as WorkflowStep)).toBeLessThan(steps.indexOf(auditStep as WorkflowStep));
  });

  it('still runs the canonical audit when only the temporary exception status changes', () => {
    const auditStep = auditJob.steps?.find((step) => step.id === 'canonical_audit');

    expect(auditStep?.if).toContain('always()');
    expect(auditStep?.if).toContain("steps.lockfile_preflight.outcome == 'success'");
    expect(auditStep?.if).not.toContain('steps.exception_status.outcome');
  });

  it('documents the deadline-distance output published by the review workflow', () => {
    expect(runbook).toContain('`days_until_deadline`');
    expect(runbook).toContain('期限前を正数');
    expect(runbook).toContain('期限当日を `0`');
    expect(runbook).toContain('期限超過後を負数');
  });

  it('always publishes read-only review evidence, exception details, and tracked dependency versions', () => {
    const summaryStep = auditJob.steps?.find((step) => step.name === 'Summarize #3114 review evidence');

    expect(summaryStep?.if).toBe('always()');
    expect(summaryStep?.env).toEqual({
      LOCKFILE_PREFLIGHT_OUTCOME: '${{ steps.lockfile_preflight.outcome }}',
      EXCEPTION_STATUS_OUTCOME: '${{ steps.exception_status.outcome }}',
      EXCEPTION_STATUS_STATE: '${{ steps.exception_status.outputs.state }}',
      EXCEPTION_REVIEW_DEADLINE: '${{ steps.exception_status.outputs.deadline }}',
      EXCEPTION_DAYS_UNTIL_DEADLINE: '${{ steps.exception_status.outputs.days_until_deadline }}',
      PRISMA_VERSION: '${{ steps.exception_status.outputs.prisma_version }}',
      PRISMA_CONFIG_VERSION: '${{ steps.exception_status.outputs.prisma_config_version }}',
      DEEPMERGE_TS_VERSION: '${{ steps.exception_status.outputs.deepmerge_ts_version }}',
      CANONICAL_AUDIT_OUTCOME: '${{ steps.canonical_audit.outcome }}',
    });
    expect(summaryStep?.run).toContain('Temporary exception state');
    expect(summaryStep?.run).toContain('Review deadline');
    expect(summaryStep?.run).toContain('Days until review deadline');
    expect(summaryStep?.run).toContain('Tracked dependency');
    expect(summaryStep?.run).toContain('PRISMA_VERSION');
    expect(summaryStep?.run).toContain('PRISMA_CONFIG_VERSION');
    expect(summaryStep?.run).toContain('DEEPMERGE_TS_VERSION');
    expect(summaryStep?.run).toContain('$GITHUB_STEP_SUMMARY');
    expect(summaryStep?.run).toContain('does not modify, extend, or remove the #3114 exception');
  });
});

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

const REVIEWED_SETUP_NODE_V5_SHA = 'a0853c24544627f65ddf259abe73b1d18a591444';

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

  it('pins the same npm runtime as package.json without installing the dependency tree', () => {
    const packageManager = packageManifest.packageManager;
    expect(packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);

    const steps = auditJob.steps ?? [];
    const setupNodeStep = steps.find((step) => step.uses === `actions/setup-node@${REVIEWED_SETUP_NODE_V5_SHA}`);
    const pinStep = steps.find((step) => step.run?.includes('npm install --global npm@'));
    const installStep = steps.find((step) => step.run?.trim() === 'npm ci');

    expect(setupNodeStep?.with).toEqual({ 'node-version': '22' });
    expect(pinStep).toBeDefined();
    expect(installStep).toBeUndefined();
    expect(pinStep?.run).toContain(`npm install --global ${packageManager}`);
    expect(pinStep?.run).toContain(`test "$(npm --version)" = "${packageManager?.replace(/^npm@/, '')}"`);
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

  it('checks the latest compatible Prisma release without changing the canonical audit gate', () => {
    const steps = auditJob.steps ?? [];
    const auditStep = steps.find((step) => step.id === 'canonical_audit');
    const upstreamStep = steps.find((step) => step.id === 'compatible_upstream');

    expect(upstreamStep?.if).toBe('always()');
    expect(upstreamStep?.run?.trim()).toBe('node scripts/security-audit-upstream.js');
    expect(steps.indexOf(auditStep as WorkflowStep)).toBeLessThan(steps.indexOf(upstreamStep as WorkflowStep));
  });

  it('fails closed when the compatible upstream probe needs explicit follow-up', () => {
    const steps = auditJob.steps ?? [];
    const summaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');
    const gateStep = steps.find((step) => step.id === 'compatible_upstream_gate');

    expect(gateStep?.if).toBe('always()');
    expect(gateStep?.env).toEqual({
      COMPATIBLE_UPSTREAM_OUTCOME: '${{ steps.compatible_upstream.outcome }}',
      COMPATIBLE_UPSTREAM_STATE: '${{ steps.compatible_upstream.outputs.state }}',
    });
    expect(gateStep?.run).toContain('COMPATIBLE_UPSTREAM_OUTCOME');
    expect(gateStep?.run).toContain('compatible-forward-remediation-available');
    expect(gateStep?.run).toContain('compatible-release-still-vulnerable');
    expect(gateStep?.run).toContain('exit 1');
    expect(steps.indexOf(summaryStep as WorkflowStep)).toBeLessThan(steps.indexOf(gateStep as WorkflowStep));
  });

  it('documents the self-describing exception identity, deadline distance, dependency edge outputs, and compatible upstream probe', () => {
    expect(runbook).toContain('`tracking_issue`');
    expect(runbook).toContain('`advisory`');
    expect(runbook).toContain('`advisory_range`');
    expect(runbook).toContain('`days_until_deadline`');
    expect(runbook).toContain('`prisma_config_deepmerge_requirement`');
    expect(runbook).toContain('`prisma_config_selector`');
    expect(runbook).toContain('`latest_compatible_prisma_config_version`');
    expect(runbook).toContain('`security-audit-upstream.js`');
    expect(runbook).toContain('compatible-forward-remediation-available');
    expect(runbook).toContain('compatible upstream gate');
    expect(runbook).toContain('`npm ci` は実行しません');
    expect(runbook).toContain('期限前を正数');
    expect(runbook).toContain('期限当日を `0`');
    expect(runbook).toContain('期限超過後を負数');
  });

  it('always publishes read-only review evidence, exception identity, dependency versions, and the Prisma dependency edge', () => {
    const summaryStep = auditJob.steps?.find((step) => step.name === 'Summarize #3114 review evidence');

    expect(summaryStep?.if).toBe('always()');
    expect(summaryStep?.env).toEqual({
      LOCKFILE_PREFLIGHT_OUTCOME: '${{ steps.lockfile_preflight.outcome }}',
      EXCEPTION_STATUS_OUTCOME: '${{ steps.exception_status.outcome }}',
      EXCEPTION_STATUS_STATE: '${{ steps.exception_status.outputs.state }}',
      EXCEPTION_TRACKING_ISSUE: '${{ steps.exception_status.outputs.tracking_issue }}',
      EXCEPTION_ADVISORY: '${{ steps.exception_status.outputs.advisory }}',
      EXCEPTION_ADVISORY_RANGE: '${{ steps.exception_status.outputs.advisory_range }}',
      EXCEPTION_CHECKED_AT: '${{ steps.exception_status.outputs.checked_at }}',
      EXCEPTION_REVIEW_DEADLINE: '${{ steps.exception_status.outputs.deadline }}',
      EXCEPTION_DAYS_UNTIL_DEADLINE: '${{ steps.exception_status.outputs.days_until_deadline }}',
      PRISMA_VERSION: '${{ steps.exception_status.outputs.prisma_version }}',
      PRISMA_CONFIG_VERSION: '${{ steps.exception_status.outputs.prisma_config_version }}',
      PRISMA_CONFIG_DEEPMERGE_REQUIREMENT: '${{ steps.exception_status.outputs.prisma_config_deepmerge_requirement }}',
      DEEPMERGE_TS_VERSION: '${{ steps.exception_status.outputs.deepmerge_ts_version }}',
      CANONICAL_AUDIT_OUTCOME: '${{ steps.canonical_audit.outcome }}',
      COMPATIBLE_UPSTREAM_OUTCOME: '${{ steps.compatible_upstream.outcome }}',
      COMPATIBLE_UPSTREAM_STATE: '${{ steps.compatible_upstream.outputs.state }}',
      COMPATIBLE_UPSTREAM_REGISTRY: '${{ steps.compatible_upstream.outputs.registry }}',
      PRISMA_SELECTOR: '${{ steps.compatible_upstream.outputs.prisma_selector }}',
      LATEST_COMPATIBLE_PRISMA_VERSION: '${{ steps.compatible_upstream.outputs.latest_compatible_prisma_version }}',
      PRISMA_CONFIG_SELECTOR: '${{ steps.compatible_upstream.outputs.prisma_config_selector }}',
      LATEST_COMPATIBLE_PRISMA_CONFIG_VERSION:
        '${{ steps.compatible_upstream.outputs.latest_compatible_prisma_config_version }}',
      LATEST_COMPATIBLE_DEEPMERGE_REQUIREMENT:
        '${{ steps.compatible_upstream.outputs.prisma_config_deepmerge_requirement }}',
    });
    expect(summaryStep?.run).toContain('Tracking issue');
    expect(summaryStep?.run).toContain('Tracked advisory');
    expect(summaryStep?.run).toContain('EXCEPTION_TRACKING_ISSUE');
    expect(summaryStep?.run).toContain('EXCEPTION_ADVISORY');
    expect(summaryStep?.run).toContain('EXCEPTION_ADVISORY_RANGE');
    expect(summaryStep?.run).toContain('Temporary exception state');
    expect(summaryStep?.run).toContain('Status checked at');
    expect(summaryStep?.run).toContain('Review deadline');
    expect(summaryStep?.run).toContain('Days until review deadline');
    expect(summaryStep?.run).toContain('Tracked evidence');
    expect(summaryStep?.run).toContain('PRISMA_VERSION');
    expect(summaryStep?.run).toContain('PRISMA_CONFIG_VERSION');
    expect(summaryStep?.run).toContain('PRISMA_CONFIG_DEEPMERGE_REQUIREMENT');
    expect(summaryStep?.run).toContain('DEEPMERGE_TS_VERSION');
    expect(summaryStep?.run).toContain('Compatible Prisma release probe');
    expect(summaryStep?.run).toContain('COMPATIBLE_UPSTREAM_STATE');
    expect(summaryStep?.run).toContain('LATEST_COMPATIBLE_PRISMA_VERSION');
    expect(summaryStep?.run).toContain('PRISMA_CONFIG_SELECTOR');
    expect(summaryStep?.run).toContain('LATEST_COMPATIBLE_PRISMA_CONFIG_VERSION');
    expect(summaryStep?.run).toContain('LATEST_COMPATIBLE_DEEPMERGE_REQUIREMENT');
    expect(summaryStep?.run).toContain('$GITHUB_STEP_SUMMARY');
    expect(summaryStep?.run).toContain('does not modify, extend, or remove the #3114 exception');
  });
});

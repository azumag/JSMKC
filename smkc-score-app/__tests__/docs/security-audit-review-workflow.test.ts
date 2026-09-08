import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
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

  let workflow: WorkflowConfig;
  let auditJob: WorkflowJob;
  let packageManifest: PackageManifest;

  beforeAll(() => {
    workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    packageManifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;
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

  it('runs the same fail-closed audit sequence as CI', () => {
    const auditStep = auditJob.steps?.find((step) => step.run?.includes('node scripts/security-audit.js'));
    const run = auditStep?.run ?? '';

    expect(run).toContain('node scripts/security-audit-lockfile.js');
    expect(run).toContain('node scripts/security-audit-status.js');
    expect(run).toContain('node scripts/security-audit.js');
    expect(run.indexOf('node scripts/security-audit-lockfile.js')).toBeLessThan(
      run.indexOf('node scripts/security-audit-status.js'),
    );
    expect(run.indexOf('node scripts/security-audit-status.js')).toBeLessThan(
      run.indexOf('node scripts/security-audit.js'),
    );
  });
});

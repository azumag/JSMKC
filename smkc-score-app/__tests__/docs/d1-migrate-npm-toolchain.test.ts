import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

interface WorkflowJob {
  defaults?: {
    run?: {
      'working-directory'?: string;
    };
  };
  steps?: WorkflowStep[];
}

interface WorkflowDocument {
  jobs?: Record<string, WorkflowJob>;
}

interface PackageManifest {
  packageManager?: string;
}

describe('D1 migration npm toolchain', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'd1-migrate.yml');
  const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');

  it('pins packageManager npm before npm ci and skips Husky hooks without changing migration order', () => {
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowDocument;
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;
    const applyJob = workflow.jobs?.apply;
    const steps = applyJob?.steps;
    const packageManager = manifest.packageManager;

    expect(steps?.length).toBeGreaterThan(0);
    expect(packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);
    expect(applyJob?.defaults?.run?.['working-directory']).toBe('smkc-score-app');

    const pinStep = steps?.find((step) => step.name === 'Pin npm');
    const installStep = steps?.find((step) => step.name === 'Install dependencies');
    const listStep = steps?.find((step) => step.name === 'List pending migrations');
    const applyStep = steps?.find((step) => step.name === 'Apply migrations');

    expect(pinStep).toBeDefined();
    expect(installStep).toBeDefined();
    expect(listStep).toBeDefined();
    expect(applyStep).toBeDefined();
    expect(pinStep?.run).toContain(`npm install --global --ignore-scripts --no-audit --no-fund ${packageManager}`);

    const expectedVersion = packageManager?.replace(/^npm@/, '');
    expect(pinStep?.run).toContain(`test "$(npm --version)" = "${expectedVersion}"`);
    expect(installStep?.run?.trim()).toBe('npm ci');
    expect(installStep?.env?.HUSKY).toBe('0');

    const pinIndex = steps?.indexOf(pinStep as WorkflowStep) ?? -1;
    const installIndex = steps?.indexOf(installStep as WorkflowStep) ?? -1;
    const listIndex = steps?.indexOf(listStep as WorkflowStep) ?? -1;
    const applyIndex = steps?.indexOf(applyStep as WorkflowStep) ?? -1;

    expect(pinIndex).toBeGreaterThanOrEqual(0);
    expect(pinIndex).toBeLessThan(installIndex);
    expect(installIndex).toBeLessThan(listIndex);
    expect(listIndex).toBeLessThan(applyIndex);
  });
});

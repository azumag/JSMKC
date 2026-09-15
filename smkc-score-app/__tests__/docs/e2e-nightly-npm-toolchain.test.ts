import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
  'working-directory'?: string;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface WorkflowDocument {
  jobs?: Record<string, WorkflowJob>;
}

interface PackageManifest {
  packageManager?: string;
}

describe('nightly E2E npm toolchain', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'e2e-nightly.yml');
  const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');

  it('pins packageManager npm before npm ci without bootstrap side effects and skips Husky hooks', () => {
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowDocument;
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;
    const steps = workflow.jobs?.e2e?.steps;
    const packageManager = manifest.packageManager;

    expect(steps?.length).toBeGreaterThan(0);
    expect(packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);

    const pinStep = steps?.find((step) => step.name === 'Pin npm');
    const installStep = steps?.find((step) => step.name === 'Install dependencies');

    expect(pinStep).toBeDefined();
    expect(installStep).toBeDefined();
    expect(pinStep?.['working-directory']).toBe('smkc-score-app');
    expect(installStep?.['working-directory']).toBe('smkc-score-app');
    expect(pinStep?.run).toContain(
      `npm install --global --ignore-scripts --no-audit --no-fund ${packageManager}`,
    );

    const expectedVersion = packageManager?.replace(/^npm@/, '');
    expect(pinStep?.run).toContain(`test "$(npm --version)" = "${expectedVersion}"`);
    expect(installStep?.run?.trim()).toBe('npm ci');
    expect(installStep?.env?.HUSKY).toBe('0');

    expect(steps?.indexOf(pinStep as WorkflowStep)).toBeLessThan(steps?.indexOf(installStep as WorkflowStep) ?? -1);
  });
});

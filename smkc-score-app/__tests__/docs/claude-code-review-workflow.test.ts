import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface WorkflowConfig {
  jobs?: Record<string, WorkflowJob>;
}

describe('Claude Code Review workflow configuration', () => {
  const workflowPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '.github',
    'workflows',
    'claude-code-review.yml',
  );

  let lintAndTestSteps: WorkflowStep[];

  beforeAll(() => {
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    lintAndTestSteps = workflow.jobs?.['lint-and-test']?.steps ?? [];
    if (lintAndTestSteps.length === 0) {
      throw new Error(
        "claude-code-review.yml の jobs['lint-and-test'].steps が見つかりません",
      );
    }
  });

  it('disables Husky hook installation during dependency setup', () => {
    const installSteps = lintAndTestSteps.filter(
      (step) => step.run?.trim() === 'npm ci',
    );
    expect(installSteps).toHaveLength(1);
    expect(installSteps[0].env?.['HUSKY']).toBe('0');
  });
});

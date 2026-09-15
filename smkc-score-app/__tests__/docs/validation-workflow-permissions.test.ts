import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  run?: string;
}

interface WorkflowJob {
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
}

interface Workflow {
  permissions?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
}

const readWorkflow = (name: string): Workflow => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', name);
  return parse(fs.readFileSync(workflowPath, 'utf8')) as Workflow;
};

describe('validation workflow token permissions', () => {
  it('keeps regular CI read-only by default', () => {
    const workflow = readWorkflow('ci.yml');

    expect(workflow.permissions).toEqual({ contents: 'read' });
  });

  it('keeps PR validation read-only and does not enable auto-merge', () => {
    const workflow = readWorkflow('claude-code-review.yml');

    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs?.['lint-and-test']?.permissions).toBeUndefined();
    expect(workflow.jobs?.['wait-cloudflare-build']?.permissions).toBeUndefined();
    expect(workflow.jobs?.['claude-review']?.permissions).toBeUndefined();

    const commands = Object.values(workflow.jobs ?? {})
      .flatMap((job) => job.steps ?? [])
      .flatMap((step) => (step.run ? [step.run] : []))
      .join('\n');

    expect(commands).not.toContain('gh pr merge');
    expect(commands).not.toContain('--auto');
  });
});

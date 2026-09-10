import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowConfig {
  permissions?: Record<string, string>;
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

describe('security audit review checkout credential boundary', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');

  it('does not persist the GitHub token after checkout', () => {
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    const checkoutStep = workflow.jobs?.audit?.steps?.find((step) => step.uses === 'actions/checkout@v5');

    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(checkoutStep).toBeDefined();
    expect(checkoutStep?.with?.['persist-credentials']).toBe(false);
  });
});

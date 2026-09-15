import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

const REVIEWED_CHECKOUT_V5_SHA = 'fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09';
const REVIEWED_CLAUDE_CODE_ACTION_V1_SHA = 'bf38e86e58df9ebf3420326d019f955bb3be64dd';

interface WorkflowStep {
  name?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
}

interface WorkflowDocument {
  jobs?: Record<string, WorkflowJob>;
}

describe('Claude Code workflow action pins', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'claude.yml');

  it('uses reviewed immutable commits without widening permissions', () => {
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowDocument;
    const job = workflow.jobs?.claude;
    const checkoutStep = job?.steps?.find((step) => step.name === 'Checkout repository');
    const claudeStep = job?.steps?.find((step) => step.name === 'Run Claude Code');

    expect(checkoutStep?.uses).toBe(`actions/checkout@${REVIEWED_CHECKOUT_V5_SHA}`);
    expect(claudeStep?.uses).toBe(`anthropics/claude-code-action@${REVIEWED_CLAUDE_CODE_ACTION_V1_SHA}`);
    expect(checkoutStep?.uses).toMatch(/@[0-9a-f]{40}$/);
    expect(claudeStep?.uses).toMatch(/@[0-9a-f]{40}$/);
    expect(checkoutStep?.with?.['persist-credentials']).toBe(false);

    expect(job?.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
      issues: 'read',
      'id-token': 'write',
      actions: 'read',
    });
  });
});

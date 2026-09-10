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

const REVIEWED_CHECKOUT_V5_SHA = 'fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09';
const REVIEWED_SETUP_NODE_V5_SHA = 'a0853c24544627f65ddf259abe73b1d18a591444';

describe('security audit review action and credential boundary', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');

  it('pins reviewed action revisions and does not persist the GitHub token', () => {
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    const checkoutStep = workflow.jobs?.audit?.steps?.find((step) => step.uses?.startsWith('actions/checkout@'));
    const setupNodeStep = workflow.jobs?.audit?.steps?.find((step) => step.uses?.startsWith('actions/setup-node@'));

    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(checkoutStep?.uses).toBe(`actions/checkout@${REVIEWED_CHECKOUT_V5_SHA}`);
    expect(checkoutStep?.with?.['persist-credentials']).toBe(false);
    expect(setupNodeStep?.uses).toBe(`actions/setup-node@${REVIEWED_SETUP_NODE_V5_SHA}`);
  });
});

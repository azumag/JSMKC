import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowConfig {
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

const REVIEWED_CHECKOUT_V5_SHA = 'fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09';

describe('security audit review action trust boundary', () => {
  it('pins checkout to the reviewed v5 commit while keeping credentials non-persistent', () => {
    const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    const steps = workflow.jobs?.audit?.steps ?? [];
    const checkoutStep = steps.find((step) => step.uses?.startsWith('actions/checkout@'));

    expect(checkoutStep?.uses).toBe(`actions/checkout@${REVIEWED_CHECKOUT_V5_SHA}`);
    expect(checkoutStep?.uses).not.toMatch(/@v\d+$/);
    expect(checkoutStep?.with).toMatchObject({ 'persist-credentials': false });
  });
});

import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

const REVIEWED_CHECKOUT_V5_SHA = 'fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09';
const REVIEWED_SETUP_NODE_V5_SHA = 'a0853c24544627f65ddf259abe73b1d18a591444';
const REVIEWED_CACHE_V5_SHA = 'caa296126883cff596d87d8935842f9db880ef25';
const REVIEWED_UPLOAD_ARTIFACT_V6_SHA = 'b7c566a772e6b6bfb58ed0dc250532a479d7789f';

interface WorkflowStep {
  uses?: string;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface WorkflowDocument {
  jobs?: Record<string, WorkflowJob>;
}

const workflowDirectory = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows');

function workflowActions(workflowName: string): string[] {
  const workflow = parse(fs.readFileSync(path.join(workflowDirectory, workflowName), 'utf8')) as WorkflowDocument;

  return Object.values(workflow.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
  );
}

describe('non-production workflow action pins', () => {
  it.each([
    [
      'ci.yml',
      [
        `actions/checkout@${REVIEWED_CHECKOUT_V5_SHA}`,
        `actions/checkout@${REVIEWED_CHECKOUT_V5_SHA}`,
        `actions/setup-node@${REVIEWED_SETUP_NODE_V5_SHA}`,
      ],
    ],
    [
      'claude-code-review.yml',
      [`actions/checkout@${REVIEWED_CHECKOUT_V5_SHA}`, `actions/setup-node@${REVIEWED_SETUP_NODE_V5_SHA}`],
    ],
    [
      'e2e-nightly.yml',
      [
        `actions/checkout@${REVIEWED_CHECKOUT_V5_SHA}`,
        `actions/setup-node@${REVIEWED_SETUP_NODE_V5_SHA}`,
        `actions/cache@${REVIEWED_CACHE_V5_SHA}`,
        `actions/upload-artifact@${REVIEWED_UPLOAD_ARTIFACT_V6_SHA}`,
      ],
    ],
  ])('%s uses only reviewed immutable action commits', (workflowName, expectedActions) => {
    const actions = workflowActions(workflowName as string);

    expect(actions).toEqual(expectedActions);
    expect(actions).not.toHaveLength(0);
    for (const action of actions) {
      expect(action).toMatch(/@[0-9a-f]{40}$/);
    }
  });
});

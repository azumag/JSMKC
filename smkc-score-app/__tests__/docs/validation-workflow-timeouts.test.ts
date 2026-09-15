import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowJob {
  'timeout-minutes'?: number;
}

interface WorkflowDocument {
  jobs?: Record<string, WorkflowJob>;
}

const workflowsDir = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows');

function readWorkflow(name: string): WorkflowDocument {
  return parse(fs.readFileSync(path.join(workflowsDir, name), 'utf8')) as WorkflowDocument;
}

describe('validation workflow runtime bounds', () => {
  it('caps regular CI jobs at 30 minutes', () => {
    const workflow = readWorkflow('ci.yml');

    expect(workflow.jobs?.['migration-parity']?.['timeout-minutes']).toBe(30);
    expect(workflow.jobs?.['lint-and-test']?.['timeout-minutes']).toBe(30);
  });

  it('caps PR compatibility jobs according to their workload', () => {
    const workflow = readWorkflow('claude-code-review.yml');

    expect(workflow.jobs?.['lint-and-test']?.['timeout-minutes']).toBe(30);
    expect(workflow.jobs?.['wait-cloudflare-build']?.['timeout-minutes']).toBe(5);
    expect(workflow.jobs?.['claude-review']?.['timeout-minutes']).toBe(5);
  });
});

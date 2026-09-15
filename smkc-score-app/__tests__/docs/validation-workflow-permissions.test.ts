import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowJob {
  permissions?: Record<string, string>;
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

  it('keeps PR validation read-only while limiting write access to auto-merge', () => {
    const workflow = readWorkflow('claude-code-review.yml');

    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs?.['lint-and-test']?.permissions).toBeUndefined();
    expect(workflow.jobs?.['wait-cloudflare-build']?.permissions).toBeUndefined();
    expect(workflow.jobs?.['claude-review']?.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
    });
  });
});

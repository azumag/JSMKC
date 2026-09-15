import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  name?: string;
  run?: string;
}

interface WorkflowJob {
  if?: string;
  'timeout-minutes'?: number;
  steps?: WorkflowStep[];
}

interface WorkflowDocument {
  permissions?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
}

describe('merged branch cleanup workflow', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'delete-merged-branch.yml');
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowDocument;
  const deleteJob = workflow.jobs?.delete;
  const deleteStep = deleteJob?.steps?.find((step) => step.name === 'Delete head branch');

  it('keeps branch deletion limited to merged same-repository pull requests', () => {
    expect(workflow.permissions).toEqual({ contents: 'write' });
    expect(deleteJob?.if).toContain('github.event.pull_request.merged == true');
    expect(deleteJob?.if).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(deleteJob?.['timeout-minutes']).toBe(5);
  });

  it('treats only HTTP 404 as an idempotent deletion result', () => {
    expect(deleteStep?.run).toContain('delete_status=$?');
    expect(deleteStep?.run).toContain("grep -Fq '(HTTP 404)'");
    expect(deleteStep?.run).toContain('Branch already deleted or not found');
    expect(deleteStep?.run).toContain('exit "$delete_status"');
    expect(deleteStep?.run).not.toContain('||');
  });
});

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

  it('uses GET probes to distinguish missing refs from real cleanup failures', () => {
    const script = deleteStep?.run ?? '';

    expect(script).toContain('ref_api="repos/$REPO/git/ref/heads/$BRANCH"');
    expect(script).toContain('delete_api="repos/$REPO/git/refs/heads/$BRANCH"');
    expect(script).toContain('probe_output=$(gh api --silent "$ref_api" 2>&1)');
    expect(script).toContain('post_probe_output=$(gh api --silent "$ref_api" 2>&1)');
    expect(script.match(/grep -Fq '\(HTTP 404\)'/g)).toHaveLength(2);
    expect(script).toContain('Branch already deleted or not found');
    expect(script).toContain('Branch was deleted concurrently');
    expect(script).toContain('Failed to inspect branch before deletion');
    expect(script).toContain('Failed to delete branch');
    expect(script).toContain('exit "$probe_status"');
    expect(script).toContain('exit "$delete_status"');
    expect(script).not.toContain('||');
  });
});

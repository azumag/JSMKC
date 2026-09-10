import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowConfig {
  jobs?: {
    audit?: {
      'timeout-minutes'?: number;
    };
  };
}

describe('manual security audit review runtime budget', () => {
  it('bounds the complete audit job to avoid hung manual reviews', () => {
    const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;

    expect(workflow.jobs?.audit?.['timeout-minutes']).toBe(30);
  });
});

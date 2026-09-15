import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowJob {
  name?: string;
}

interface WorkflowConfig {
  jobs?: Record<string, WorkflowJob>;
}

function readWorkflow(name: string): WorkflowConfig {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', name);
  return parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
}

describe('required status check names', () => {
  it('keeps standard CI required-check candidates distinct from PR compatibility checks', () => {
    const ci = readWorkflow('ci.yml');
    const compatibility = readWorkflow('claude-code-review.yml');

    expect(ci.jobs?.['lint-and-test']?.name).toBe('Lint & Test');
    expect(ci.jobs?.['migration-parity']?.name).toBe('Prisma / D1 migration parity');
    expect(compatibility.jobs?.['lint-and-test']?.name).toBe('PR Compatibility Lint & Test');

    const ciNames = Object.values(ci.jobs ?? {}).flatMap((job) => (job.name ? [job.name] : []));
    const compatibilityNames = Object.values(compatibility.jobs ?? {}).flatMap((job) =>
      job.name ? [job.name] : [],
    );

    expect(ciNames).toContain('Lint & Test');
    expect(ciNames).toContain('Prisma / D1 migration parity');
    expect(compatibilityNames).not.toContain('Lint & Test');
    expect(compatibilityNames).not.toContain('Prisma / D1 migration parity');
    expect(ciNames.filter((name) => compatibilityNames.includes(name))).toEqual([]);
  });
});

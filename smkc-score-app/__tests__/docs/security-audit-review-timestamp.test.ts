import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  id?: string;
  if?: string;
  name?: string;
  run?: string;
}

interface WorkflowConfig {
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

describe('security audit upstream evidence timestamp', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');

  it('records a UTC timestamp after the registry probe and before the summary', () => {
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    const steps = workflow.jobs?.audit?.steps ?? [];
    const upstreamStep = steps.find((step) => step.id === 'compatible_upstream');
    const timestampStep = steps.find((step) => step.id === 'compatible_upstream_timestamp');
    const summaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');

    expect(upstreamStep).toBeDefined();
    expect(timestampStep?.if).toBe('always()');
    expect(timestampStep?.run).toContain("date -u +'%Y-%m-%dT%H:%M:%SZ'");
    expect(timestampStep?.run).toContain('$GITHUB_OUTPUT');
    expect(steps.indexOf(upstreamStep as WorkflowStep)).toBeLessThan(steps.indexOf(timestampStep as WorkflowStep));
    expect(steps.indexOf(timestampStep as WorkflowStep)).toBeLessThan(steps.indexOf(summaryStep as WorkflowStep));
    expect(summaryStep?.run).toContain('Compatible upstream checked at');
    expect(summaryStep?.run).toContain('steps.compatible_upstream_timestamp.outputs.checked_at');
  });
});

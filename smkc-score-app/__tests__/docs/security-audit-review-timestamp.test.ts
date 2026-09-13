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

  it('publishes the UTC timestamp only after the compatible registry probe succeeds', () => {
    const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    const steps = workflow.jobs?.audit?.steps ?? [];
    const upstreamStep = steps.find((step) => step.id === 'compatible_upstream');
    const standaloneTimestampStep = steps.find((step) => step.id === 'compatible_upstream_timestamp');
    const summaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');

    expect(upstreamStep?.if).toBe('always()');
    expect(upstreamStep?.run).toContain('node scripts/security-audit-upstream.js');
    expect(upstreamStep?.run).toContain("date -u +'%Y-%m-%dT%H:%M:%SZ'");
    expect(upstreamStep?.run).toContain('$GITHUB_OUTPUT');
    expect(upstreamStep?.run?.indexOf('node scripts/security-audit-upstream.js')).toBeLessThan(
      upstreamStep?.run?.indexOf("date -u +'%Y-%m-%dT%H:%M:%SZ'") ?? -1,
    );
    expect(standaloneTimestampStep).toBeUndefined();
    expect(steps.indexOf(upstreamStep as WorkflowStep)).toBeLessThan(steps.indexOf(summaryStep as WorkflowStep));
    expect(summaryStep?.run).toContain('Compatible upstream checked at');
    expect(summaryStep?.run).toContain("steps.compatible_upstream.outputs.checked_at || 'unavailable'");
  });
});

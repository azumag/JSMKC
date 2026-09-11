import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  id?: string;
  if?: string;
  'continue-on-error'?: boolean;
  env?: Record<string, string>;
  name?: string;
  run?: string;
}

interface WorkflowConfig {
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

describe('Prisma 7 environment loading review evidence', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
  const steps = workflow.jobs?.audit?.steps ?? [];

  it('runs the environment-loading probe as advisory evidence before the summary', () => {
    const probe = steps.find((step) => step.id === 'prisma_v7_env_loading');
    const summary = steps.find((step) => step.name === 'Summarize #3114 review evidence');

    expect(probe).toBeDefined();
    expect(probe?.if).toBe('always()');
    expect(probe?.['continue-on-error']).toBe(true);
    expect(probe?.run?.trim()).toBe('node scripts/prisma-v7-env-loading.cjs');
    expect(steps.indexOf(probe as WorkflowStep)).toBeLessThan(steps.indexOf(summary as WorkflowStep));
  });

  it('publishes the probe outcome without changing the compatible remediation gate', () => {
    const summary = steps.find((step) => step.name === 'Summarize #3114 review evidence');
    const gate = steps.find((step) => step.id === 'compatible_upstream_gate');

    expect(summary?.run).toContain('Prisma 7 environment loading probe');
    expect(summary?.run).toContain('steps.prisma_v7_env_loading.outcome');
    expect(summary?.run).toContain('environment-loading');
    expect(gate?.env).not.toHaveProperty('PRISMA_V7_ENV_LOADING_OUTCOME');
    expect(gate?.run).not.toContain('prisma_v7_env_loading');
  });
});

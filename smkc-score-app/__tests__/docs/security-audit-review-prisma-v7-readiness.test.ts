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
  jobs?: { audit?: { steps?: WorkflowStep[] } };
}

describe('security audit review Prisma 7 readiness evidence', () => {
  const workflowPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '.github',
    'workflows',
    'security-audit-review.yml',
  );
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
  const steps = workflow.jobs?.audit?.steps ?? [];

  it('collects local migration readiness as advisory evidence before the main summary', () => {
    const nextMajorTimestampStep = steps.find((step) => step.id === 'next_major_upstream_timestamp');
    const readinessStep = steps.find((step) => step.id === 'prisma_v7_readiness');
    const summaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');

    expect(nextMajorTimestampStep).toBeDefined();
    expect(readinessStep).toBeDefined();
    expect(summaryStep).toBeDefined();
    expect(readinessStep?.if).toBe('always()');
    expect(readinessStep?.['continue-on-error']).toBe(true);
    expect(readinessStep?.run?.trim()).toBe('node scripts/prisma-v7-readiness.cjs');
    expect(steps.indexOf(nextMajorTimestampStep as WorkflowStep)).toBeLessThan(
      steps.indexOf(readinessStep as WorkflowStep),
    );
    expect(steps.indexOf(readinessStep as WorkflowStep)).toBeLessThan(steps.indexOf(summaryStep as WorkflowStep));
  });

  it('surfaces probe failure without turning migration readiness into the compatible-range gate', () => {
    const summaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');
    const gateStep = steps.find((step) => step.id === 'compatible_upstream_gate');

    expect(summaryStep).toBeDefined();
    expect(gateStep).toBeDefined();
    expect(summaryStep?.env?.PRISMA_V7_READINESS_OUTCOME).toBe('${{ steps.prisma_v7_readiness.outcome }}');
    expect(summaryStep?.run).toContain('Prisma 7 migration readiness probe');
    expect(summaryStep?.run).toContain('PRISMA_V7_READINESS_OUTCOME');
    expect(summaryStep?.run).toContain('Prisma 7 readiness evidence are advisory only');
    expect(gateStep?.env).not.toHaveProperty('PRISMA_V7_READINESS_OUTCOME');
  });
});

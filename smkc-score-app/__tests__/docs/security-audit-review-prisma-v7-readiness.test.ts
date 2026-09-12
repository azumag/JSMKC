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
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
  const steps = workflow.jobs?.audit?.steps ?? [];

  it('collects local Prisma 7 migration evidence before the main summary', () => {
    const nextMajorTimestampStep = steps.find((step) => step.id === 'next_major_upstream_timestamp');
    const readinessStep = steps.find((step) => step.id === 'prisma_v7_readiness');
    const driverAdapterStep = steps.find((step) => step.id === 'prisma_v7_driver_adapter');
    const supportSurfaceStep = steps.find((step) => step.id === 'prisma_v7_support_surface');
    const esmSurfaceStep = steps.find((step) => step.id === 'prisma_v7_esm_surface');
    const summaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');

    expect(nextMajorTimestampStep).toBeDefined();
    expect(readinessStep).toBeDefined();
    expect(driverAdapterStep).toBeDefined();
    expect(supportSurfaceStep).toBeDefined();
    expect(esmSurfaceStep).toBeDefined();
    expect(summaryStep).toBeDefined();
    expect(readinessStep?.if).toBe('always()');
    expect(readinessStep?.['continue-on-error']).toBe(true);
    expect(readinessStep?.run?.trim()).toBe('node scripts/prisma-v7-readiness.cjs');
    expect(driverAdapterStep?.if).toBe('always()');
    expect(driverAdapterStep?.['continue-on-error']).toBe(true);
    expect(driverAdapterStep?.run?.trim()).toBe('node scripts/prisma-v7-driver-adapter.cjs');
    expect(supportSurfaceStep?.if).toBe('always()');
    expect(supportSurfaceStep?.['continue-on-error']).toBe(true);
    expect(supportSurfaceStep?.run?.trim()).toBe('node scripts/prisma-v7-support-surface.cjs');
    expect(esmSurfaceStep?.if).toBe('always()');
    expect(esmSurfaceStep?.['continue-on-error']).toBe(true);
    expect(esmSurfaceStep?.run?.trim()).toBe('node scripts/prisma-v7-esm-surface.cjs');
    expect(steps.indexOf(nextMajorTimestampStep as WorkflowStep)).toBeLessThan(
      steps.indexOf(readinessStep as WorkflowStep),
    );
    expect(steps.indexOf(readinessStep as WorkflowStep)).toBeLessThan(steps.indexOf(driverAdapterStep as WorkflowStep));
    expect(steps.indexOf(driverAdapterStep as WorkflowStep)).toBeLessThan(
      steps.indexOf(supportSurfaceStep as WorkflowStep),
    );
    expect(steps.indexOf(supportSurfaceStep as WorkflowStep)).toBeLessThan(
      steps.indexOf(esmSurfaceStep as WorkflowStep),
    );
    expect(steps.indexOf(esmSurfaceStep as WorkflowStep)).toBeLessThan(steps.indexOf(summaryStep as WorkflowStep));
  });

  it('keeps Prisma 7 advisory evidence outside the compatible-range gate', () => {
    const summaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');
    const gateStep = steps.find((step) => step.id === 'compatible_upstream_gate');

    expect(summaryStep).toBeDefined();
    expect(gateStep).toBeDefined();
    expect(summaryStep?.run).toContain('Prisma 7 D1 driver-adapter');
    expect(summaryStep?.env).toHaveProperty(
      'PRISMA_V7_DRIVER_ADAPTER_OUTCOME',
      '${{ steps.prisma_v7_driver_adapter.outcome }}',
    );
    expect(gateStep?.env).not.toHaveProperty('PRISMA_V7_READINESS_OUTCOME');
    expect(gateStep?.env).not.toHaveProperty('PRISMA_V7_DRIVER_ADAPTER_OUTCOME');
    expect(gateStep?.env).not.toHaveProperty('PRISMA_V7_SUPPORT_SURFACE_OUTCOME');
    expect(gateStep?.env).not.toHaveProperty('PRISMA_V7_ESM_SURFACE_OUTCOME');
  });
});

import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  id?: string;
  env?: Record<string, string>;
  name?: string;
  run?: string;
}

interface WorkflowConfig {
  jobs?: { audit?: { steps?: WorkflowStep[] } };
}

describe('security audit review Prisma 7 advisory outcomes', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
  const steps = workflow.jobs?.audit?.steps ?? [];

  it('surfaces each Prisma 7 advisory probe outcome in the review summary', () => {
    const summaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');

    expect(summaryStep).toBeDefined();
    expect(summaryStep?.env).toMatchObject({
      PRISMA_V7_READINESS_OUTCOME: '${{ steps.prisma_v7_readiness.outcome }}',
      PRISMA_V7_SUPPORT_SURFACE_OUTCOME: '${{ steps.prisma_v7_support_surface.outcome }}',
      PRISMA_V7_ESM_SURFACE_OUTCOME: '${{ steps.prisma_v7_esm_surface.outcome }}',
    });
    expect(summaryStep?.run).toContain('| Prisma 7 migration readiness probe |');
    expect(summaryStep?.run).toContain('| Prisma 7 support-code surface probe |');
    expect(summaryStep?.run).toContain('| Prisma 7 ESM surface probe |');
  });

  it('keeps advisory outcomes out of the compatible-range gate', () => {
    const gateStep = steps.find((step) => step.id === 'compatible_upstream_gate');

    expect(gateStep).toBeDefined();
    expect(gateStep?.env).not.toHaveProperty('PRISMA_V7_READINESS_OUTCOME');
    expect(gateStep?.env).not.toHaveProperty('PRISMA_V7_SUPPORT_SURFACE_OUTCOME');
    expect(gateStep?.env).not.toHaveProperty('PRISMA_V7_ESM_SURFACE_OUTCOME');
  });
});

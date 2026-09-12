import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

import { PRISMA_V7_REVIEW_PROBES } from '../../scripts/prisma-v7-review-json.cjs';

interface WorkflowStep {
  id?: string;
  if?: string;
  'continue-on-error'?: boolean;
  run?: string;
}

interface WorkflowConfig {
  jobs?: { audit?: { steps?: WorkflowStep[] } };
}

const PRISMA_V7_PROBES = PRISMA_V7_REVIEW_PROBES.map((probe) => probe.script);

describe('security audit review Prisma 7 runbook', () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
  const workflowSource = fs.readFileSync(
    path.join(repositoryRoot, '.github', 'workflows', 'security-audit-review.yml'),
    'utf8',
  );
  const workflow = parse(workflowSource) as WorkflowConfig;
  const workflowSteps = workflow.jobs?.audit?.steps ?? [];
  const runbook = fs.readFileSync(path.join(repositoryRoot, 'docs', 'security-audit-review-runbook.md'), 'utf8');
  const outcomesDoc = fs.readFileSync(
    path.join(repositoryRoot, 'docs', 'security-audit-review-prisma-v7-outcomes.md'),
    'utf8',
  );

  it('keeps the workflow probe set aligned with the aggregate JSON manifest', () => {
    const workflowProbeSteps = workflowSteps.filter((step) =>
      /^node scripts\/prisma-v7-[\w-]+\.cjs$/.test(step.run?.trim() ?? ''),
    );

    expect(workflowProbeSteps.map((step) => step.run?.trim())).toEqual(
      PRISMA_V7_REVIEW_PROBES.map((probe) => `node scripts/${probe.script}`),
    );

    for (const step of workflowProbeSteps) {
      expect(step.if).toBe('always()');
      expect(step['continue-on-error']).toBe(true);
    }
  });

  it('documents every Prisma 7 advisory probe executed by the workflow', () => {
    for (const probe of PRISMA_V7_PROBES) {
      expect(workflowSource).toContain(`run: node scripts/${probe}`);
      expect(runbook).toContain(`\`${probe}\``);
    }
  });

  it('keeps the advisory outcomes doc aligned with the seven workflow probes', () => {
    expect(outcomesDoc).toContain('collects seven local Prisma 7 migration probes');
    expect(outcomesDoc).toContain('all seven Prisma 7 probes');
    expect(outcomesDoc).toContain('`npm run prisma:v7:review:json`');

    for (const probe of PRISMA_V7_PROBES) {
      expect(outcomesDoc).toContain(`\`${probe}\``);
    }
  });

  it('documents the aggregate local command without changing compatible gate semantics', () => {
    expect(runbook).toContain('`npm run prisma:v7:review`');
    expect(runbook).toContain('D1 driver-adapter wiring');
    expect(runbook).toContain('current compatible-range gate の成功・失敗条件には含めない');
    expect(runbook).toContain('Prisma 7 への upgrade');
  });
});

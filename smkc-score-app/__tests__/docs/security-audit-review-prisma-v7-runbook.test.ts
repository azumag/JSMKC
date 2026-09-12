import fs from 'fs';
import path from 'path';

const PRISMA_V7_PROBES = [
  'prisma-v7-readiness.cjs',
  'prisma-v7-driver-adapter.cjs',
  'prisma-v7-typescript-prereqs.cjs',
  'prisma-v7-env-loading.cjs',
  'prisma-v7-removed-surfaces.cjs',
  'prisma-v7-support-surface.cjs',
  'prisma-v7-esm-surface.cjs',
] as const;

describe('security audit review Prisma 7 runbook', () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'security-audit-review.yml'), 'utf8');
  const runbook = fs.readFileSync(path.join(repositoryRoot, 'docs', 'security-audit-review-runbook.md'), 'utf8');

  it('documents every Prisma 7 advisory probe executed by the workflow', () => {
    for (const probe of PRISMA_V7_PROBES) {
      expect(workflow).toContain(`run: node scripts/${probe}`);
      expect(runbook).toContain(`\`${probe}\``);
    }
  });

  it('documents the aggregate local command without changing compatible gate semantics', () => {
    expect(runbook).toContain('`npm run prisma:v7:review`');
    expect(runbook).toContain('D1 driver-adapter wiring');
    expect(runbook).toContain('current compatible-range gate の成功・失敗条件には含めない');
    expect(runbook).toContain('Prisma 7 への upgrade');
  });
});

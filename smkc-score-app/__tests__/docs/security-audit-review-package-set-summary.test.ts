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
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

describe('security audit review package-set summary', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
  const steps = workflow.jobs?.audit?.steps ?? [];
  const summaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');
  const gateStep = steps.find((step) => step.id === 'compatible_upstream_gate');

  it('publishes current-compatible runtime selector and version evidence in the job summary', () => {
    expect(summaryStep?.env).toMatchObject({
      COMPATIBLE_PUBLISHED_PRISMA_CLIENT_SELECTOR:
        '${{ steps.compatible_upstream.outputs.published_remediation_prisma_client_selector }}',
      COMPATIBLE_PUBLISHED_PRISMA_CLIENT_VERSION:
        '${{ steps.compatible_upstream.outputs.published_remediation_prisma_client_version }}',
      COMPATIBLE_PUBLISHED_ADAPTER_D1_SELECTOR:
        '${{ steps.compatible_upstream.outputs.published_remediation_adapter_d1_selector }}',
      COMPATIBLE_PUBLISHED_ADAPTER_D1_VERSION:
        '${{ steps.compatible_upstream.outputs.published_remediation_adapter_d1_version }}',
    });

    expect(summaryStep?.run).toContain('Manifest @prisma/client selector');
    expect(summaryStep?.run).toContain('COMPATIBLE_PUBLISHED_PRISMA_CLIENT_SELECTOR');
    expect(summaryStep?.run).toContain('Latest manifest-compatible @prisma/client');
    expect(summaryStep?.run).toContain('COMPATIBLE_PUBLISHED_PRISMA_CLIENT_VERSION');
    expect(summaryStep?.run).toContain('Manifest @prisma/adapter-d1 selector');
    expect(summaryStep?.run).toContain('COMPATIBLE_PUBLISHED_ADAPTER_D1_SELECTOR');
    expect(summaryStep?.run).toContain('Latest manifest-compatible @prisma/adapter-d1');
    expect(summaryStep?.run).toContain('COMPATIBLE_PUBLISHED_ADAPTER_D1_VERSION');
  });

  it('publishes the matching next-major Prisma client and D1 adapter evidence in the job summary', () => {
    expect(summaryStep?.env).toMatchObject({
      NEXT_MAJOR_PUBLISHED_PACKAGE_SET_STATE:
        '${{ steps.next_major_upstream.outputs.published_remediation_package_set_state }}',
      NEXT_MAJOR_PUBLISHED_PRISMA_CLIENT_VERSION:
        '${{ steps.next_major_upstream.outputs.published_remediation_prisma_client_version }}',
      NEXT_MAJOR_PUBLISHED_ADAPTER_D1_VERSION:
        '${{ steps.next_major_upstream.outputs.published_remediation_adapter_d1_version }}',
    });

    expect(summaryStep?.run).toContain('Published remediation package set');
    expect(summaryStep?.run).toContain('NEXT_MAJOR_PUBLISHED_PACKAGE_SET_STATE');
    expect(summaryStep?.run).toContain('Candidate @prisma/client');
    expect(summaryStep?.run).toContain('NEXT_MAJOR_PUBLISHED_PRISMA_CLIENT_VERSION');
    expect(summaryStep?.run).toContain('Candidate @prisma/adapter-d1');
    expect(summaryStep?.run).toContain('NEXT_MAJOR_PUBLISHED_ADAPTER_D1_VERSION');
  });

  it('keeps next-major package-set evidence advisory-only', () => {
    expect(gateStep?.env).not.toHaveProperty('NEXT_MAJOR_PUBLISHED_PACKAGE_SET_STATE');
    expect(gateStep?.env).not.toHaveProperty('NEXT_MAJOR_PUBLISHED_PRISMA_CLIENT_VERSION');
    expect(gateStep?.env).not.toHaveProperty('NEXT_MAJOR_PUBLISHED_ADAPTER_D1_VERSION');
  });
});

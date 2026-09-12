import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  id?: string;
  if?: string;
  env?: Record<string, string>;
  name?: string;
  run?: string;
}

interface WorkflowConfig {
  jobs?: { audit?: { steps?: WorkflowStep[] } };
}

describe('security audit review reason summary', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
  const steps = workflow.jobs?.audit?.steps ?? [];

  it('surfaces existing reason and next-major selector outputs without changing gate inputs', () => {
    const summaryStep = steps.find((step) => step.name === 'Summarize probe reason evidence');
    const gateStep = steps.find((step) => step.id === 'compatible_upstream_gate');

    expect(summaryStep?.if).toBe('always()');
    expect(summaryStep?.env).toEqual({
      EXCEPTION_STATUS_REASON: '${{ steps.exception_status.outputs.reason }}',
      COMPATIBLE_PACKAGE_SET_REASON: '${{ steps.compatible_upstream.outputs.published_remediation_package_set_reason }}',
      NEXT_MAJOR_PACKAGE_SET_REASON: '${{ steps.next_major_upstream.outputs.published_remediation_package_set_reason }}',
      NEXT_MAJOR_PRISMA_CLIENT_SELECTOR:
        '${{ steps.next_major_upstream.outputs.published_remediation_prisma_client_selector }}',
      NEXT_MAJOR_ADAPTER_D1_SELECTOR:
        '${{ steps.next_major_upstream.outputs.published_remediation_adapter_d1_selector }}',
    });
    expect(summaryStep?.run).toContain('Temporary exception reason');
    expect(summaryStep?.run).toContain('Compatible package-set reason');
    expect(summaryStep?.run).toContain('Next-major package-set reason');
    expect(summaryStep?.run).toContain('Next-major @prisma/client selector');
    expect(summaryStep?.run).toContain('Next-major @prisma/adapter-d1 selector');
    expect(steps.indexOf(summaryStep as WorkflowStep)).toBeLessThan(steps.indexOf(gateStep as WorkflowStep));

    expect(gateStep?.env).toEqual({
      COMPATIBLE_UPSTREAM_OUTCOME: '${{ steps.compatible_upstream.outcome }}',
      COMPATIBLE_UPSTREAM_STATE: '${{ steps.compatible_upstream.outputs.state }}',
    });
  });
});

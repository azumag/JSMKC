import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  id?: string;
  name?: string;
  run?: string;
}

interface WorkflowConfig {
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

describe('compatible Prisma remediation package-set workflow contract', () => {
  const workflowPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'security-audit-review.yml');
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
  const steps = workflow.jobs?.audit?.steps ?? [];

  it('surfaces the current-compatible package-set evidence in the job summary', () => {
    const summaryStep = steps.find((step) => step.name === 'Summarize #3114 review evidence');

    expect(summaryStep?.run).toContain('steps.compatible_upstream.outputs.published_remediation_candidate');
    expect(summaryStep?.run).toContain('steps.compatible_upstream.outputs.published_remediation_package_set_state');
    expect(summaryStep?.run).toContain('steps.compatible_upstream.outputs.published_remediation_prisma_client_version');
    expect(summaryStep?.run).toContain('steps.compatible_upstream.outputs.published_remediation_adapter_d1_version');
  });

  it('only raises the actionable remediation gate for a complete published package set', () => {
    const gateStep = steps.find((step) => step.id === 'compatible_upstream_gate');

    expect(gateStep?.run).toContain(
      'compatible_candidate="${{ steps.compatible_upstream.outputs.published_remediation_candidate }}"',
    );
    expect(gateStep?.run).toContain(
      'compatible_package_set_state="${{ steps.compatible_upstream.outputs.published_remediation_package_set_state }}"',
    );
    expect(gateStep?.run).toContain(
      '[ "$compatible_candidate" != "none" ] && [ "$compatible_package_set_state" = "ready" ]',
    );
    expect(gateStep?.run).toContain(
      '[ "$compatible_candidate" = "none" ] && [ "$compatible_package_set_state" = "incomplete" ]',
    );
    expect(gateStep?.run).toContain('Compatible remediation evidence is unavailable or inconsistent');
  });

  it('explains incomplete evidence using the manifest-compatible runtime versions', () => {
    const gateStep = steps.find((step) => step.id === 'compatible_upstream_gate');

    expect(gateStep?.run).toContain(
      'compatible_client="${{ steps.compatible_upstream.outputs.published_remediation_prisma_client_version }}"',
    );
    expect(gateStep?.run).toContain(
      'compatible_adapter="${{ steps.compatible_upstream.outputs.published_remediation_adapter_d1_version }}"',
    );
    expect(gateStep?.run).toContain('manifest-compatible @prisma/client (${compatible_client:-unavailable})');
    expect(gateStep?.run).toContain('@prisma/adapter-d1 evidence is ${compatible_adapter:-unavailable}');
    expect(gateStep?.run).not.toContain('same-version runtime package set');
  });
});

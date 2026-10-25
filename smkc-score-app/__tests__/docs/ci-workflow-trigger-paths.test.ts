import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface TriggerConfig {
  paths?: string[];
}

interface WorkflowStep {
  id?: string;
  name?: string;
  run?: string;
  if?: string;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface CiWorkflow {
  on?: {
    push?: TriggerConfig;
    pull_request?: TriggerConfig;
  };
  jobs?: Record<string, WorkflowJob>;
}

const scopeCondition = "steps.scope.outputs.relevant == 'true'";

describe('CI workflow trigger paths', () => {
  const ciPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml');
  const workflow = parse(fs.readFileSync(ciPath, 'utf8')) as CiWorkflow;

  it('has no pull-request path filter, so the required checks are reported on every PR', () => {
    // #3499: `main` requires `Lint & Test` and `Prisma / D1 migration parity`.
    // A workflow skipped by path filtering reports no check at all, which
    // leaves those required contexts "expected" and makes the pull request
    // unmergeable. The pull_request trigger must therefore stay unfiltered.
    expect(workflow.on?.pull_request?.paths).toBeUndefined();
  });

  it('keeps the push path filter for app and workflow changes', () => {
    // Required status checks only apply to pull requests, so pushes to main
    // keep the narrower path filter.
    const expectedPaths = ['smkc-score-app/**', '.github/workflows/**'];

    expect(workflow.on?.push?.paths).toEqual(expect.arrayContaining(expectedPaths));
  });

  it('keeps documentation-only pull requests cheap by gating the heavy validation steps', () => {
    const steps = workflow.jobs?.['lint-and-test']?.steps ?? [];
    const scopeStep = steps.find((step) => step.id === 'scope');

    // The detecting step must always run: if it were conditional the whole job
    // could be reported as skipped instead of successful for a docs-only pull
    // request, leaving the required context unsatisfied.
    expect(scopeStep?.name).toBe('Detect validated path changes');
    expect(scopeStep?.if).toBeUndefined();
    expect(scopeStep?.run).toContain('smkc-score-app/');
    expect(scopeStep?.run).toContain('relevant=');

    // Every shell step after the gate must be skipped unless a validated path
    // changed, so an unfiltered trigger cannot run the full suite for a
    // documentation-only pull request.
    const ungatedRunSteps = steps.filter(
      (step) => step.run !== undefined && step.id !== 'scope' && step.if !== scopeCondition,
    );
    expect(ungatedRunSteps.map((step) => step.name)).toEqual([]);

    const gatedCommands = steps
      .filter((step) => step.if === scopeCondition)
      .flatMap((step) => (step.run ? [step.run] : []));

    expect(gatedCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining('npm ci'),
        expect.stringContaining('npm run lint'),
        expect.stringContaining('npm test'),
        expect.stringContaining('node scripts/security-audit.js'),
      ]),
    );
  });
});

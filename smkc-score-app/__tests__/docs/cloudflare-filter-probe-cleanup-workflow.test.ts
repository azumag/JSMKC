import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  env?: Record<string, string>;
  name?: string;
  run?: string;
  shell?: string;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface WorkflowConfig {
  on?: {
    push?: {
      branches?: string[];
      paths?: string[];
    };
  };
  permissions?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
}

describe('Cloudflare filter probe cleanup workflow', () => {
  const workflowPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '.github',
    'workflows',
    'cleanup-cloudflare-filter-probe.yml',
  );

  let workflow: WorkflowConfig;
  let cleanupStep: WorkflowStep;

  beforeAll(() => {
    workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    cleanupStep =
      workflow.jobs?.cleanup?.steps?.find((step) => step.name === 'Verify and delete exact probe branch') ?? {};

    if (!cleanupStep.run) {
      throw new Error('probe cleanup workflow の削除ステップが見つかりません');
    }
  });

  it('is a one-shot main workflow scoped to its own file', () => {
    expect(workflow.on?.push?.branches).toEqual(['main']);
    expect(workflow.on?.push?.paths).toEqual(['.github/workflows/cleanup-cloudflare-filter-probe.yml']);
  });

  it('limits permissions and pins the exact #3278 probe evidence', () => {
    expect(workflow.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'read',
    });
    expect(cleanupStep.env).toEqual({
      GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
      TARGET_BRANCH: 'ops/verify-cloudflare-build-filter',
      EXPECTED_HEAD: '6fa0fdc882604a8f9e2bde043f285cd98a66c45d',
      EXPECTED_FILE: 'smkc-score-app/docs/.cloudflare-build-filter-probe-2026-09-11.md',
    });
  });

  it('fails closed unless the branch still matches the verified probe and has no open PR', () => {
    const run = cleanupStep.run ?? '';

    expect(run).toContain('protected');
    expect(run).toContain('head_sha');
    expect(run).toContain('ahead_by');
    expect(run).toContain('files_length');
    expect(run).toContain('only_filename');
    expect(run).toContain('only_status');
    expect(run).toContain('--data-urlencode "head=${owner}:${TARGET_BRANCH}"');
    expect(run).toContain('final_head_sha');
    expect(run).toContain('exit 1');
  });

  it('deletes only the encoded target ref and verifies a 404 afterward', () => {
    const run = cleanupStep.run ?? '';

    expect(run).toContain('/git/refs/heads/${encoded_branch}');
    expect(run).toContain('-X DELETE');
    expect(run).toContain('verify_status');
    expect(run).toContain('deleted and verified absent');
    expect(run).not.toContain('git push --delete');
    expect(run).not.toContain('force');
  });
});

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

const TARGET_BRANCHES = [
  'ops/cloudflare-build-cost-audit',
  'ops/cloudflare-build-cost-audit-2',
  'ops/cloudflare-build-cost-audit-3',
  'ops/cloudflare-build-cost-audit-actual',
  'ops/cloudflare-build-cost-audit-final',
  'ops/cloudflare-build-cost-audit-live',
  'ops/cloudflare-build-cost-audit-please',
  'ops/cloudflare-build-cost-audit-run',
];

describe('Cloudflare audit branch cleanup workflow', () => {
  const workflowPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '.github',
    'workflows',
    'cleanup-cloudflare-audit-branches.yml',
  );

  let workflow: WorkflowConfig;
  let cleanupStep: WorkflowStep;

  beforeAll(() => {
    workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as WorkflowConfig;
    cleanupStep =
      workflow.jobs?.cleanup?.steps?.find((step) => step.name === 'Verify and delete exact temporary branches') ?? {};

    if (!cleanupStep.run) {
      throw new Error('cleanup workflow の削除ステップが見つかりません');
    }
  });

  it('runs only when the one-shot workflow file changes on main', () => {
    expect(workflow.on?.push?.branches).toEqual(['main']);
    expect(workflow.on?.push?.paths).toEqual(['.github/workflows/cleanup-cloudflare-audit-branches.yml']);
  });

  it('requests only the repository permissions required for verified branch cleanup', () => {
    expect(workflow.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'read',
    });
    expect(cleanupStep.env).toEqual({ GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}' });
    expect(cleanupStep.shell).toBe('bash');
  });

  it('contains exactly the eight #3280 branch names in its deletion whitelist', () => {
    const whitelist = cleanupStep.run?.match(/branches=\(\n([\s\S]*?)\n\s*\)/)?.[1];
    expect(whitelist).toBeDefined();

    const listedBranches = (whitelist ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^"|"$/g, ''));

    expect(listedBranches).toEqual(TARGET_BRANCHES);
    expect(listedBranches).not.toContain('main');
    expect(listedBranches).not.toContain('preview');
  });

  it('fails closed on protection, branch-only changes, branch movement, and open PR use before deletion', () => {
    const run = cleanupStep.run ?? '';

    expect(run).toContain('protected');
    expect(run).toContain('ahead_by');
    expect(run).toContain('changed_files');
    expect(run).toContain('initial_head_sha');
    expect(run).toContain('verified_head_sha');
    expect(run).toContain('final_head_sha');
    expect(run).toContain('Refusing to delete branch that moved during verification');
    expect(run).toContain('Refusing to delete branch whose state changed immediately before deletion');
    expect(run).toContain('--data-urlencode "head=${owner}:${branch}"');
    expect(run).toContain('open_pr_count');
    expect(run).toContain('exit 1');
  });

  it('uses the refs API for deletion and verifies every target is absent afterward', () => {
    const run = cleanupStep.run ?? '';

    expect(run).toContain('-X DELETE');
    expect(run).toContain('/git/refs/heads/${encoded_branch}');
    expect(run).toContain('verify_status');
    expect(run).toContain('All eight whitelisted temporary audit branches are absent');
    expect(run).not.toContain('git push --delete');
    expect(run).not.toContain('force');
  });
});

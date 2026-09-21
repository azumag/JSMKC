import { readRepoFile } from '../helpers/e2e-cases';

describe('Cloudflare build cost policy documentation', () => {
  const policy = readRepoFile('smkc-score-app', 'docs', 'cloudflare-build-cost.md');

  it('pins the production trigger and intentional push suppression contract', () => {
    expect(policy).toContain('`smkc-score-app`');
    expect(policy).toContain('`npm run build:cf`');
    expect(policy).toContain('`npx wrangler deploy`');
    expect(policy).toContain('`path_excludes=["*"]`');
    expect(policy).toContain('Non-production branch builds must remain disabled (`previews_enabled=false`)');
    expect(policy).toContain('not a GitHub CI failure');
  });

  it('documents the rolling production gate without claiming a hard billing cap', () => {
    expect(policy).toContain('rolling 24-hour');
    expect(policy).toContain('Docs/tests-only changes do not justify a production build');
    expect(policy).toContain('Do not periodically retry a SHA that already failed in production');
    expect(policy).toContain('not a Cloudflare billing cap');
  });

  it('pins manual starts to the validated main SHA and forbids blind retries', () => {
    expect(policy).toContain('"branch": "main"');
    expect(policy).toContain('"commit_hash": "<verified exact main SHA>"');
    expect(policy).toContain('Do not omit `commit_hash`');
    expect(policy).toContain('same SHA whose CI and deploy-relevant diff were just');
    expect(policy).toContain('Do not send the start request a second time');
  });

  it('documents Build watch path exceptions and their safe handling', () => {
    expect(policy).toContain('zero changed files');
    expect(policy).toContain('3,000 or more changed files');
    expect(policy).toContain('20 or more commits in the push');
    expect(policy).toContain('empty commits or empty pushes');
    expect(policy).toContain('force-push');
    expect(policy).toMatch(/real\s+attempt in the rolling 24-hour history/);
  });

  it('keeps deployment scheduling and D1 migration outside the cost-control gate', () => {
    expect(policy).toContain('do not replace it with\n`npm run deploy:cf`');
    expect(policy).toContain('D1 migration execution is governed separately');
    expect(policy).toContain('Cron Worker');
    expect(policy).toContain('Deploy Hook');
  });
});

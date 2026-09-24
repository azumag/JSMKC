import { readRepoFile } from '../helpers/e2e-cases';

describe('Cloudflare build cost policy documentation', () => {
  const policy = readRepoFile('smkc-score-app', 'docs', 'cloudflare-build-cost.md');

  it('pins the production identity and intentional push suppression contract', () => {
    expect(policy).toContain('`b9ab93f1f71640b6965a60c646b2392b`');
    expect(policy).toContain('`smkc`');
    expect(policy).toContain('`37f13913c5ef48419dc2b0b8946d76ed`');
    expect(policy).toContain('`9655dde5-b315-4557-90ca-a9ada811bfaf`');
    expect(policy).toContain('`azumag/JSMKC`');
    expect(policy).toContain('`main`');
    expect(policy).toContain('`smkc-score-app`');
    expect(policy).toContain('`npm run build:cf`');
    expect(policy).toContain('`npx wrangler deploy`');
    expect(policy).toContain('`path_excludes=["*"]`');
    expect(policy).toContain('Non-production branch builds must remain disabled (`previews_enabled=false`)');
    expect(policy).toContain('not a GitHub CI failure');
  });

  it('documents the rolling production gate without claiming a hard billing cap', () => {
    expect(policy).toContain('rolling 24-hour');
    expect(policy).toContain('`queued`, `initializing`, or `running`');
    expect(policy).toContain('`605d4579-b9a7-4941-a9b6-582b22b35d4d`');
    expect(policy).toContain('single documented exception');
    expect(policy).toContain('Docs/tests-only changes do not justify a production build');
    expect(policy).toContain('Do not periodically retry a SHA that already failed in production');
    expect(policy).toContain('not a Cloudflare billing cap');
  });

  it('fails closed when production preconditions cannot be verified', () => {
    expect(policy).toMatch(
      /If GitHub or Cloudflare data cannot be read, API\s+authorization is missing, CI state is unknown/,
    );
    expect(policy).toMatch(/target identity\/configuration\s+differs from the required values/);
    expect(policy).toContain('fail closed and do not start');
    expect(policy).toMatch(/Do not infer the current `main` SHA from\s+stale Cloudflare history/);
    expect(policy).toContain('work around missing checks or permissions');
  });

  it('pins the operational reporting evidence and cost wording', () => {
    expect(policy).toContain('## Operational reporting');
    expect(policy).toMatch(
      /whether a production build was started and, if not, the concrete gate that stopped\s+it/,
    );
    expect(policy).toContain('the verified exact `main` SHA and the build UUID');
    expect(policy).toContain('build timestamps and durations actually returned by Cloudflare');
    expect(policy).toMatch(
      /earliest timestamp at which the rolling 24-hour time gate could permit another\s+attempt/,
    );
    expect(policy).toMatch(
      /configuration state only;\s+it does not prove that the ongoing production-promotion process has operated\s+successfully/,
    );
    expect(policy).toMatch(
      /distinguish actual billed or invoiced amounts from estimates\s+derived from measured build runtime/,
    );
  });

  it('pins manual starts to the validated main SHA and forbids blind retries', () => {
    expect(policy).toContain('"branch": "main"');
    expect(policy).toContain('"commit_hash": "<verified exact main SHA>"');
    expect(policy).toContain('Do not omit `commit_hash`');
    expect(policy).toContain('same SHA whose CI and deploy-relevant diff were just');
    expect(policy).toContain('Do not send the start request a second time');
    expect(policy).toContain('Record the returned build UUID');
  });

  it('requires deployment reconciliation before reporting production success', () => {
    expect(policy).toContain('not, by itself, proof that production deployment');
    expect(policy).toContain('latest production deployment');
    expect(policy).toContain('active version');
    expect(policy).toContain('preserve\nthe last successful production deployment');
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
    expect(policy).toMatch(/must not be used as a reason to change D1 migrations,\s+runtime bindings or secrets, domains/);
    expect(policy).toMatch(/billing\s+plans, or any other Worker/);
  });
});

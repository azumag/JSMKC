import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = join(__dirname, '../..');
const buildGuard = join(appRoot, 'scripts/cloudflare-build.sh');
const deployGuard = join(appRoot, 'scripts/cloudflare-deploy.sh');

function workersCiEnv(branch: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    WORKERS_CI: '1',
    WORKERS_CI_BRANCH: branch,
  };
}

describe('Cloudflare Workers Build cost guard', () => {
  it('keeps Cloudflare build/deploy package scripts behind branch guards', () => {
    const packageJson = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['build:cf']).toBe('bash scripts/cloudflare-build.sh');
    expect(packageJson.scripts['deploy:cf']).toBe('bash scripts/cloudflare-deploy.sh production');
    expect(packageJson.scripts['deploy:cf:preview']).toBe('bash scripts/cloudflare-deploy.sh preview');
  });

  it('skips the expensive OpenNext build on feature branches in Workers CI', () => {
    const result = spawnSync('bash', [buildGuard], {
      cwd: appRoot,
      env: workersCiEnv('feature/cost-test'),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipping OpenNext build');
  });

  it('skips preview migrations and deploy on feature branches in Workers CI', () => {
    const result = spawnSync('bash', [deployGuard, 'preview'], {
      cwd: appRoot,
      env: workersCiEnv('feature/cost-test'),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipping Cloudflare preview deploy');
    expect(result.stdout).toContain("only 'preview' is deployable");
  });
});

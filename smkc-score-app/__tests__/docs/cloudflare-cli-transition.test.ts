import fs from 'fs';
import path from 'path';

interface PackageManifest {
  scripts?: Record<string, string>;
}

describe('Cloudflare CLI transition safety contracts', () => {
  const appRoot = path.resolve(__dirname, '..', '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')) as PackageManifest;
  const wranglerConfig = fs.readFileSync(path.join(appRoot, 'wrangler.toml'), 'utf8');
  const buildCostPolicy = fs.readFileSync(path.join(appRoot, 'docs', 'cloudflare-build-cost.md'), 'utf8');
  const transitionPolicy = fs.readFileSync(path.join(appRoot, 'docs', 'cloudflare-cli-transition.md'), 'utf8');
  const normalizedTransitionPolicy = transitionPolicy.replace(/\s+/g, ' ');

  it('keeps D1 migration list/apply explicit for production and preview', () => {
    expect(packageJson.scripts?.['db:migrations:list']).toBe('wrangler d1 migrations list DB --remote');
    expect(packageJson.scripts?.['db:migrations:apply']).toBe('wrangler d1 migrations apply DB --remote');
    expect(packageJson.scripts?.['db:migrations:list:preview']).toBe(
      'wrangler d1 migrations list DB --remote --env preview',
    );
    expect(packageJson.scripts?.['db:migrations:apply:preview']).toBe(
      'wrangler d1 migrations apply DB --remote --env preview',
    );
  });

  it('preserves migrate-before-deploy ordering while cf parity is evaluated', () => {
    expect(packageJson.scripts?.['deploy:cf']).toBe('npm run db:migrations:apply && wrangler deploy');
    expect(packageJson.scripts?.['deploy:cf:preview']).toBe(
      'npm run db:migrations:apply:preview && wrangler deploy --env preview',
    );
  });

  it('keeps production and preview D1 configuration separate', () => {
    expect(wranglerConfig).toContain('name = "smkc"');
    expect(wranglerConfig).toContain('[env.preview]');
    expect(wranglerConfig).toContain('name = "smkc-preview"');

    const migrationDirOccurrences = wranglerConfig.match(/migrations_dir = "migrations"/g) ?? [];
    expect(migrationDirOccurrences).toHaveLength(2);

    const databaseIdOccurrences = wranglerConfig.match(/database_id = "[^"]+"/g) ?? [];
    expect(databaseIdOccurrences).toHaveLength(2);
    expect(new Set(databaseIdOccurrences).size).toBe(2);
  });

  it('does not couple CLI migration work to the Workers Builds cost gate', () => {
    expect(buildCostPolicy).toContain('| Root directory               | `smkc-score-app`      |');
    expect(buildCostPolicy).toContain('| Build command                | `npm run build:cf`    |');
    expect(buildCostPolicy).toContain('| Deploy command               | `npx wrangler deploy` |');
    expect(buildCostPolicy).toContain('`path_excludes=["*"]` is intentional');
    expect(buildCostPolicy).toContain('Non-production branch builds must remain disabled');
  });

  it('documents Wrangler as a verified-parity fallback rather than a blind replacement', () => {
    expect(normalizedTransitionPolicy).toContain(
      'existing production, preview, D1, and OpenNext commands must stay on Wrangler',
    );
    expect(normalizedTransitionPolicy).toContain('Do not weaken Prisma/D1 migration parity CI');
    expect(normalizedTransitionPolicy).toContain('Workers Builds cost gate is separate');
    expect(normalizedTransitionPolicy).toContain(
      'keep a documented Wrangler fallback for unsupported or unverified behavior',
    );
  });

  it('locks the current cf D1 targeting boundary before replacing Wrangler', () => {
    expect(normalizedTransitionPolicy).toContain('cf d1 migrations list <DATABASE_ID>');
    expect(normalizedTransitionPolicy).toContain('cf d1 migrations apply <DATABASE_ID> --dir migrations');
    expect(normalizedTransitionPolicy).toContain('the remote database is the default');
    expect(normalizedTransitionPolicy).toContain(
      'repository-owned fail-closed mapping selects the exact database ID for each environment',
    );
    expect(normalizedTransitionPolicy).toContain(
      'must never fall back to production when preview identity is missing or invalid',
    );
  });
});

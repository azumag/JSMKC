import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '../..');
const scriptsDir = path.join(appRoot, 'scripts');

const guardedEntrypoints = [
  'security-audit.js',
  'security-audit-status.js',
  'security-audit-upstream.js',
  'security-audit-next-major.js',
];

const guardedAuxiliaryEntrypoints = [
  'security-audit-lockfile.js',
  'verify-npm-version.js',
  'prisma-v7-review-json.cjs',
  'prisma-v7-readiness.cjs',
  'prisma-v7-driver-adapter.cjs',
  'prisma-v7-typescript-prereqs.cjs',
  'prisma-v7-removed-surfaces.cjs',
  'prisma-v7-support-surface.cjs',
  'prisma-v7-esm-surface.cjs',
  'prisma-v7-env-loading.cjs',
  'prisma-v7-defineconfig-alias-guard.cjs',
  'prisma-v7-env-loading-template-guard.cjs',
  'prisma-v7-env-loading-deferred-params.cjs',
  'prisma-v7-require-binding-guard.cjs',
];

describe('security audit CLI diagnostic safety', () => {
  it.each(guardedEntrypoints)('%s routes top-level errors through the bounded diagnostic sanitizer', (filename) => {
    const source = fs.readFileSync(path.join(scriptsDir, filename), 'utf8');

    expect(source).toContain("require('./security-audit-upstream-diagnostic.js')");
    expect(source).toContain('formatUpstreamProbeFailure(');
    expect(source).not.toContain('${error.message}');
  });

  it.each(guardedAuxiliaryEntrypoints)(
    '%s keeps direct stderr error diagnostics on the bounded formatter',
    (filename) => {
      const source = fs.readFileSync(path.join(scriptsDir, filename), 'utf8');

      expect(source).toContain("require('./security-audit-upstream-diagnostic.js')");
      expect(source).toContain('formatUpstreamProbeFailure(');
      expect(source).not.toMatch(/process\.stderr\.write\(\s*`[^`]*\$\{error\.message\}[^`]*`\s*\)/);
    },
  );

  it('keeps npm view JSON parse failures away from arbitrary thrown-value coercion', () => {
    const source = fs.readFileSync(path.join(scriptsDir, 'security-audit-upstream.js'), 'utf8');

    expect(source).toContain('sanitizeNpmViewDiagnostic(getUpstreamDiagnosticMessage(error))');
    expect(source).not.toContain('String(error)');
  });

  it('sanitizes npm audit stderr before emitting it from the core audit entrypoint', () => {
    const source = fs.readFileSync(path.join(scriptsDir, 'security-audit.js'), 'utf8');

    expect(source).toContain("sanitizeUpstreamDiagnostic(audit.stderr || '')");
    expect(source).not.toContain("process.stderr.write(audit.stderr || '')");
  });
});

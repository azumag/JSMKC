import fs from 'node:fs';
import path from 'node:path';

interface PackageManifest {
  scripts?: Record<string, string>;
}

const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');

describe('security audit package scripts', () => {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;

  it('exposes stable entrypoints for the remediation probes', () => {
    expect(packageJson.scripts).toMatchObject({
      'security:audit:upstream': 'node scripts/security-audit-upstream.js',
      'security:audit:upstream:json': 'node scripts/security-audit-upstream.js --json',
      'security:audit:next-major': 'node scripts/security-audit-next-major.js',
      'security:audit:next-major:json': 'node scripts/security-audit-next-major.js --json',
    });
  });
});

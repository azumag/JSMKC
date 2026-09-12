import fs from 'node:fs';
import path from 'node:path';

interface PackageManifest {
  scripts?: Record<string, string>;
}

const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');

describe('security audit package scripts', () => {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;

  it('exposes stable entrypoints for the remediation probes', () => {
    expect(packageJson.scripts?.['security:audit:upstream']).toBe(
      'node scripts/security-audit-upstream.js',
    );
    expect(packageJson.scripts?.['security:audit:upstream:json']).toBe(
      'node scripts/security-audit-upstream.js --json',
    );
    expect(packageJson.scripts?.['security:audit:next-major']).toBe(
      'node scripts/security-audit-next-major.js',
    );
    expect(packageJson.scripts?.['security:audit:next-major:json']).toBe(
      'node scripts/security-audit-next-major.js --json',
    );
  });
});

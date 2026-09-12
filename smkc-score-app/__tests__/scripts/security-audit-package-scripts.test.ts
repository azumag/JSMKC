import fs from 'node:fs';
import path from 'node:path';

describe('security audit package scripts', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> };

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

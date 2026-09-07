import fs from 'fs';
import path from 'path';

import {
  hasExpectedSecurityAuditLockfileShape,
  hasMatchingSecurityAuditManifestSnapshot,
} from '../../scripts/security-audit-lockfile.js';

describe('security audit lockfile preflight', () => {
  it('accepts the repository package-lock schema used by the temporary audit exception', () => {
    const lockfile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package-lock.json'), 'utf8'));

    expect(hasExpectedSecurityAuditLockfileShape(lockfile)).toBe(true);
  });

  it('accepts a minimal v3 lockfile with an object root package snapshot', () => {
    expect(hasExpectedSecurityAuditLockfileShape({ lockfileVersion: 3, packages: { '': {} } })).toBe(true);
  });

  it('requires package.json dependency maps to match the lockfile root snapshot', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
    const lockfile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package-lock.json'), 'utf8'));

    expect(hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)).toBe(true);
  });

  it.each(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const)(
    'fails closed when %s differs between package.json and the lockfile root snapshot',
    (field) => {
      const manifest = { [field]: { example: '^1.0.0' } };
      const lockfile = { lockfileVersion: 3, packages: { '': { [field]: { example: '^2.0.0' } } } };

      expect(hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)).toBe(false);
    },
  );

  it('treats omitted dependency maps as empty on both sides', () => {
    expect(hasMatchingSecurityAuditManifestSnapshot({}, { lockfileVersion: 3, packages: { '': {} } })).toBe(true);
  });

  it('fails closed when package.json has a dependency missing from the lockfile root snapshot', () => {
    const manifest = { dependencies: { example: '^1.0.0' } };
    const lockfile = { lockfileVersion: 3, packages: { '': {} } };

    expect(hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)).toBe(false);
  });

  it('fails closed when the lockfile root snapshot has a dependency missing from package.json', () => {
    const manifest = {};
    const lockfile = { lockfileVersion: 3, packages: { '': { dependencies: { example: '^1.0.0' } } } };

    expect(hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)).toBe(false);
  });

  it.each([null, [], 'invalid', 1])('fails closed for malformed manifest dependency maps: %p', (dependencies) => {
    const manifest = { dependencies };
    const lockfile = { lockfileVersion: 3, packages: { '': {} } };

    expect(hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)).toBe(false);
  });

  it.each([null, [], 'invalid', 1])('fails closed for malformed lockfile dependency maps: %p', (dependencies) => {
    const manifest = {};
    const lockfile = { lockfileVersion: 3, packages: { '': { dependencies } } };

    expect(hasMatchingSecurityAuditManifestSnapshot(manifest, lockfile)).toBe(false);
  });

  it.each([
    null,
    [],
    {},
    { lockfileVersion: 2, packages: {} },
    { lockfileVersion: 4, packages: {} },
    { lockfileVersion: '3', packages: {} },
    { lockfileVersion: 3 },
    { lockfileVersion: 3, packages: null },
    { lockfileVersion: 3, packages: [] },
    { lockfileVersion: 3, packages: {} },
    { lockfileVersion: 3, packages: { '': null } },
    { lockfileVersion: 3, packages: { '': [] } },
    { lockfileVersion: 3, packages: { '': 'smkc-score-app' } },
  ])('fails closed for unsupported package-lock schema: %p', (lockfile) => {
    expect(hasExpectedSecurityAuditLockfileShape(lockfile)).toBe(false);
  });

  it('runs the lockfile schema preflight before the npm audit helper in CI', () => {
    const ci = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');
    const preflight = 'node scripts/security-audit-lockfile.js';
    const audit = 'node scripts/security-audit.js';

    expect(ci).toContain(preflight);
    expect(ci).toContain(audit);
    expect(ci.indexOf(preflight)).toBeLessThan(ci.indexOf(audit));
  });
});

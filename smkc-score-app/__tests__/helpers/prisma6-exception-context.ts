/**
 * Frozen Prisma 6 dependency context for the #3114 audit-exception classifier tests.
 *
 * The classifier in scripts/security-audit-status.js used to be exercised against the
 * repository's own package.json / package-lock.json, which described the vulnerable
 * Prisma 6.19.3 -> @prisma/config 6.19.3 -> deepmerge-ts 7.1.5 chain. After the
 * Prisma 7 migration the repository no longer has that chain, so the tests rebuild it
 * here from the exact lock entries main had before the migration (copied verbatim from
 * package-lock.json at d167ba7e) on top of the current manifest/lockfile, keeping the
 * root package snapshot consistent so the shape/identity guards still pass.
 *
 * The result is a deliberate hybrid: only the three entries the classifier inspects go
 * back to Prisma 6, while unrelated packages (e.g. node_modules/@prisma/client) stay at
 * the migrated 7.x versions. Delete this helper together with security-audit-status.js
 * when the #3114 temporary exception is removed.
 */

type JsonMap = Record<string, unknown>;
type Lockfile = { packages: Record<string, JsonMap> } & JsonMap;
type Manifest = { dependencies: Record<string, string>; devDependencies: Record<string, string> } & JsonMap;

const PRISMA6_LOCK_ENTRIES: Record<string, JsonMap> = {
  'node_modules/prisma': {
    version: '6.19.3',
    resolved: 'https://registry.npmjs.org/prisma/-/prisma-6.19.3.tgz',
    integrity: 'sha512-++ZJ0ijLrDJF6hNB4t4uxg2br3fC4H9Yc9tcbjr2fcNFP3rh/SBNrAgjhsqBU4Ght8JPrVofG/ZkXfnSfnYsFg==',
    devOptional: true,
    hasInstallScript: true,
    license: 'Apache-2.0',
    dependencies: { '@prisma/config': '6.19.3', '@prisma/engines': '6.19.3' },
    bin: { prisma: 'build/index.js' },
    engines: { node: '>=18.18' },
    peerDependencies: { typescript: '>=5.1.0' },
    peerDependenciesMeta: { typescript: { optional: true } },
  },
  'node_modules/@prisma/config': {
    version: '6.19.3',
    resolved: 'https://registry.npmjs.org/@prisma/config/-/config-6.19.3.tgz',
    integrity: 'sha512-CBPT44BjlQxEt8kiMEauji2WHTDoVBOKl7UlewXmUgBPnr/oPRZC3psci5chJnYmH0ivEIog2OU9PGWoki3DLQ==',
    devOptional: true,
    license: 'Apache-2.0',
    dependencies: { c12: '3.1.0', 'deepmerge-ts': '7.1.5', effect: '3.21.0', empathic: '2.0.0' },
  },
  'node_modules/deepmerge-ts': {
    version: '7.1.5',
    resolved: 'https://registry.npmjs.org/deepmerge-ts/-/deepmerge-ts-7.1.5.tgz',
    integrity: 'sha512-HOJkrhaYsweh+W+e74Yn7YStZOilkoPb6fycpwNLKzSPtruFs48nYis0zy5yJz1+ktUhHxoRDJ27RQAWLIJVJw==',
    devOptional: true,
    license: 'BSD-3-Clause',
    engines: { node: '>=16.0.0' },
  },
};

const PRISMA6_SELECTOR = '^6.19.3';

export function withPrisma6ExceptionContext<M extends Manifest, L extends Lockfile>(
  manifest: M,
  lockfile: L,
): { manifest: M; lockfile: L } {
  const nextManifest = structuredClone(manifest);
  nextManifest.devDependencies.prisma = PRISMA6_SELECTOR;
  nextManifest.dependencies['@prisma/client'] = PRISMA6_SELECTOR;

  const nextLockfile = structuredClone(lockfile);
  const root = nextLockfile.packages[''] as Manifest;
  root.devDependencies.prisma = PRISMA6_SELECTOR;
  root.dependencies['@prisma/client'] = PRISMA6_SELECTOR;
  Object.assign(nextLockfile.packages, structuredClone(PRISMA6_LOCK_ENTRIES));

  return { manifest: nextManifest, lockfile: nextLockfile };
}

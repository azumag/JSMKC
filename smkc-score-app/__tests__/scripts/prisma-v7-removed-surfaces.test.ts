import {
  findRemovedPrismaV7Surfaces,
  formatPrismaV7RemovedSurfaces,
  inspectDbExecuteFlags,
  inspectLines,
  inspectMetricsPreviewFeature,
  inspectPrismaV7RemovedSurfaces,
  REMOVED_COMMAND_PATTERNS,
  REMOVED_RUNTIME_PATTERNS,
} from '../../scripts/prisma-v7-removed-surfaces.cjs';

describe('Prisma 7 removed-surface readiness', () => {
  it('detects removed client middleware and metrics APIs while ignoring comment-only examples', () => {
    const findings = inspectLines(
      'src/lib/prisma.ts',
      [
        '// prisma.$use(async () => {})',
        'prisma.$use(async (_params, next) => next(_params));',
        'const metrics = await prisma.$metrics.json();',
      ].join('\n'),
      REMOVED_RUNTIME_PATTERNS,
    );

    expect(findings).toEqual([
      { path: 'src/lib/prisma.ts', line: 2, kind: 'removed-client-middleware', token: '$use' },
      { path: 'src/lib/prisma.ts', line: 3, kind: 'removed-client-metrics', token: '$metrics' },
    ]);
  });

  it('detects Prisma 7 removed migration flags without treating comments as commands', () => {
    const findings = inspectLines(
      'scripts/migrate.sh',
      [
        '# prisma migrate dev --skip-generate',
        'prisma migrate dev --skip-generate --skip-seed',
        'prisma migrate diff --from-url "$A" --to-url "$B"',
      ].join('\n'),
      REMOVED_COMMAND_PATTERNS,
    );

    expect(findings).toEqual([
      { path: 'scripts/migrate.sh', line: 2, kind: 'removed-cli-flag', token: '--skip-generate' },
      { path: 'scripts/migrate.sh', line: 2, kind: 'removed-cli-flag', token: '--skip-seed' },
      { path: 'scripts/migrate.sh', line: 3, kind: 'removed-migrate-diff-flag', token: '--from-url' },
      { path: 'scripts/migrate.sh', line: 3, kind: 'removed-migrate-diff-flag', token: '--to-url' },
    ]);
  });

  it('detects removed db execute connection flags across a wrapped command and ignores comments', () => {
    const findings = inspectDbExecuteFlags(
      'scripts/execute.sh',
      [
        '# prisma db execute --schema prisma/comment-only.prisma',
        'prisma db execute \\',
        '  --file ./repair.sql \\',
        '  --schema prisma/schema.prisma',
      ].join('\n'),
    );

    expect(findings).toEqual([
      { path: 'scripts/execute.sh', line: 2, kind: 'removed-db-execute-flag', token: '--schema' },
    ]);
  });

  it('detects the removed metrics preview feature only inside the client generator', () => {
    expect(
      inspectMetricsPreviewFeature(
        'prisma/schema.prisma',
        [
          'generator client {',
          '  provider = "prisma-client-js"',
          '  previewFeatures = ["metrics"]',
          '}',
          '',
          'model metrics {',
          '  id Int @id',
          '}',
        ].join('\n'),
      ),
    ).toEqual([{ path: 'prisma/schema.prisma', line: 3, kind: 'removed-metrics-preview', token: 'metrics' }]);

    expect(
      inspectMetricsPreviewFeature(
        'prisma/schema.prisma',
        ['generator client {', '  provider = "prisma-client-js"', '}', '', 'model Metrics {', '  id Int @id', '}'].join(
          '\n',
        ),
      ),
    ).toEqual([]);
  });

  it('keeps the current repository free of unhandled Prisma 7 removed surfaces', () => {
    const status = inspectPrismaV7RemovedSurfaces({ findings: findRemovedPrismaV7Surfaces() });

    expect(status).toEqual({ ready: true, findingCount: 0, findings: [] });
  });

  it('emits machine-readable advisory evidence', () => {
    const status = inspectPrismaV7RemovedSurfaces({
      findings: [{ path: 'src/a.ts', line: 4, kind: 'removed-client-middleware', token: '$use' }],
    });

    expect(JSON.parse(formatPrismaV7RemovedSurfaces(status, { json: true }))).toEqual(status);
  });
});

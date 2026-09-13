import fs from 'fs';
import path from 'path';

function extractImplementationReasons(source: string): string[] {
  const functionStart = source.indexOf('function inspectPublishedRemediationPackageSet(');
  const functionEnd = source.indexOf('\nfunction enrichCompatiblePrismaReleaseWithPublishedPackageSet', functionStart);

  expect(functionStart).toBeGreaterThanOrEqual(0);
  expect(functionEnd).toBeGreaterThan(functionStart);

  return Array.from(source.slice(functionStart, functionEnd).matchAll(/reason: '([^']+)'/g), (match) => match[1]);
}

function extractDocumentedReasons(documentation: string): string[] {
  return Array.from(documentation.matchAll(/^- `([^`]+)`: /gm), (match) => match[1]);
}

describe('compatible Prisma package-set reason catalog', () => {
  it('keeps the documented reason catalog synchronized with implementation output', () => {
    const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
    const source = fs.readFileSync(
      path.join(repositoryRoot, 'smkc-score-app', 'scripts', 'security-audit-upstream.js'),
      'utf8',
    );
    const documentation = fs.readFileSync(
      path.join(repositoryRoot, 'docs', 'security-audit-compatible-package-set-reasons.md'),
      'utf8',
    );

    const implementationReasons = [...new Set(extractImplementationReasons(source))].sort();
    const documentedReasons = [...new Set(extractDocumentedReasons(documentation))].sort();

    expect(implementationReasons.length).toBeGreaterThan(0);
    expect(documentedReasons).toEqual(implementationReasons);
  });
});

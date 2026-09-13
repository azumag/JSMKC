import fs from 'fs';
import path from 'path';

function extractRuntimeSet(source: string, constantName: string): string[] {
  const pattern = new RegExp(`const ${constantName} = new Set\\((\\[[\\s\\S]*?\\])\\);`);
  const match = source.match(pattern);
  expect(match).not.toBeNull();

  const body = match?.[1] ?? '';
  return Array.from(body.matchAll(/'([^']+)'/g), (entry) => entry[1]);
}

function extractDocumentedAuthorAssociations(documentation: string): string[] {
  const line = documentation.split('\n').find((entry) => entry.includes('author association は GitHub が定義する'));
  expect(line).toBeDefined();

  return Array.from((line ?? '').matchAll(/`([A-Z_]+)`/g), (entry) => entry[1]);
}

function extractDocumentedStateReasons(documentation: string): string[] {
  const line = documentation.split('\n').find((entry) => entry.includes('open issue では `null` または `reopened`'));
  expect(line).toBeDefined();

  const contractMatch = (line ?? '').match(/open issue では (.+?) のみを受理します。/);
  expect(contractMatch).not.toBeNull();

  const contract = contractMatch?.[1] ?? '';
  const values = Array.from(contract.matchAll(/`([a-z_]+)`/g), (entry) => entry[1]);
  return values.filter((value) => value !== 'null');
}

describe('Prisma upstream GitHub enum documentation contracts', () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'smkc-score-app', 'scripts', 'security-audit-upstream-issue-single-pass.js'),
    'utf8',
  );

  it('keeps the documented comment author associations synchronized with runtime validation', () => {
    const documentation = fs.readFileSync(
      path.join(repositoryRoot, 'docs', 'security-audit-upstream-discussion-evidence.md'),
      'utf8',
    );
    const runtimeValues = extractRuntimeSet(source, 'ALLOWED_AUTHOR_ASSOCIATIONS').sort();
    const documentedValues = extractDocumentedAuthorAssociations(documentation).sort();

    expect(runtimeValues.length).toBeGreaterThan(0);
    expect(documentedValues).toEqual(runtimeValues);
  });

  it('keeps the documented issue state reasons synchronized with runtime validation', () => {
    const documentation = fs.readFileSync(
      path.join(repositoryRoot, 'docs', 'security-audit-upstream-issue-probe.md'),
      'utf8',
    );
    const runtimeValues = extractRuntimeSet(source, 'ALLOWED_STATE_REASONS').sort();
    const documentedValues = extractDocumentedStateReasons(documentation).sort();

    expect(runtimeValues.length).toBeGreaterThan(0);
    expect(documentedValues).toEqual(runtimeValues);
  });
});

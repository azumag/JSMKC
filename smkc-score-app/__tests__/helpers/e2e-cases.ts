import fs from 'fs';
import path from 'path';

const repoRoot = path.join(process.cwd(), '..');

export function readRepoFile(...parts: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
}

export function sectionBetween(
  source: string,
  startMarker: string,
  endMarker: string,
  { allowTerminal = false }: { allowTerminal?: boolean } = {},
) {
  const sectionStart = source.indexOf(startMarker);
  expect(sectionStart).toBeGreaterThanOrEqual(0);

  const sectionEndCandidate = source.indexOf(endMarker, sectionStart + startMarker.length);
  if (!allowTerminal) {
    expect(sectionEndCandidate).toBeGreaterThan(sectionStart);
    return source.slice(sectionStart, sectionEndCandidate);
  }

  if (sectionEndCandidate === -1) {
    if (source.length <= sectionStart + startMarker.length) {
      throw new Error(`terminal section for marker "${startMarker}" has no content`);
    }
    return source.slice(sectionStart);
  }

  expect(sectionEndCandidate).toBeGreaterThan(sectionStart);
  return source.slice(sectionStart, sectionEndCandidate);
}

export function e2eCaseSection(tc: string, source = readRepoFile('E2E_TEST_CASES.md')) {
  const heading = new RegExp(`^#{2,3} ${tc}:`, 'm');
  const match = heading.exec(source);
  if (!match) throw new Error(`${tc} section not found`);

  const start = match.index;
  const next = source.slice(start + 1).search(/\n#{2,3} TC-/);
  const end = next === -1 ? source.length : start + 1 + next;
  return source.slice(start, end);
}

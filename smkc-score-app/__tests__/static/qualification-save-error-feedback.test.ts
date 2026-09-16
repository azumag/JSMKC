import fs from 'fs';
import path from 'path';

const bmPagePath = path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'bm', 'page-client.tsx');
const mrPagePath = path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx');

function readPage(pagePath: string): string {
  return fs.readFileSync(pagePath, 'utf8');
}

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe('qualification save failure feedback', () => {
  it('keeps BM score state on failure and reports API/network errors through alert', () => {
    const block = sliceBetween(readPage(bmPagePath), 'const handleScoreSubmit = async () => {', 'const handleBroadcastMatch =');

    expect(block).toContain("alert(errorData.error || tc('networkError'));\n        return;");
    expect(block).toContain(
      "logger.error('Failed to update score:', { error: err, tournamentId });\n      alert(tc('networkError'));",
    );
    expect(block.indexOf("alert(errorData.error || tc('networkError'))")).toBeLessThan(
      block.indexOf('setIsScoreDialogOpen(false)'),
    );
  });

  it('keeps MR score state on failure and reports API/network errors through toast', () => {
    const block = sliceBetween(readPage(mrPagePath), 'const handleMatchSubmit = async () => {', 'const handleBroadcastMatch =');

    expect(block).toContain("toast.error(errorData.error || tc('networkError'));\n        return;");
    expect(block).toContain(
      "logger.error('Failed to update match:', { error: err, tournamentId });\n      toast.error(tc('networkError'));",
    );
    expect(block.indexOf("toast.error(errorData.error || tc('networkError'))")).toBeLessThan(
      block.indexOf('setIsMatchDialogOpen(false)'),
    );
  });
});

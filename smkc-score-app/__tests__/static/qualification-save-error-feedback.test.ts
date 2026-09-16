import fs from 'fs';
import path from 'path';

const mrPagePath = path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', 'mr', 'page-client.tsx');

function readMrPage(): string {
  return fs.readFileSync(mrPagePath, 'utf8');
}

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe('MR qualification save failure feedback', () => {
  it('keeps score state on failure and reports API/network errors through toast', () => {
    const block = sliceBetween(readMrPage(), 'const handleMatchSubmit = async () => {', 'const handleBroadcastMatch =');

    expect(block).toContain("toast.error(errorData.error || tc('networkError'));\n        return;");
    expect(block).toContain(
      "logger.error('Failed to update match:', { error: err, tournamentId });\n      toast.error(tc('networkError'));",
    );
    expect(block.indexOf("toast.error(errorData.error || tc('networkError'))")).toBeLessThan(
      block.indexOf('setIsMatchDialogOpen(false)'),
    );
  });
});

import fs from 'fs';
import path from 'path';

const appRoot = path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]');

function readPage(mode: 'bm' | 'mr' | 'gp'): string {
  return fs.readFileSync(path.join(appRoot, mode, 'page-client.tsx'), 'utf8');
}

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe('qualification save failure feedback', () => {
  it('keeps BM score state on failure and reports API/network errors', () => {
    const block = sliceBetween(readPage('bm'), 'const handleScoreSubmit = async () => {', 'const handleBroadcastMatch =');

    expect(block).toContain("alert(errorData.error || tc('networkError'));\n        return;");
    expect(block).toContain("logger.error('Failed to update score:', { error: err, tournamentId });\n      alert(tc('networkError'));");
    expect(block.indexOf("alert(errorData.error || tc('networkError'))")).toBeLessThan(block.indexOf('setIsScoreDialogOpen(false)'));
  });

  it('keeps MR score state on failure and reports API/network errors through toast', () => {
    const block = sliceBetween(readPage('mr'), 'const handleMatchSubmit = async () => {', 'const handleBroadcastMatch =');

    expect(block).toContain("toast.error(errorData.error || tc('networkError'));\n        return;");
    expect(block).toContain("logger.error('Failed to update match:', { error: err, tournamentId });\n      toast.error(tc('networkError'));");
    expect(block.indexOf("toast.error(errorData.error || tc('networkError'))")).toBeLessThan(block.indexOf('setIsMatchDialogOpen(false)'));
  });

  it('reports GP cup assignment failures without replacing the selected cup state', () => {
    const block = sliceBetween(readPage('gp'), 'const saveQualificationCup = async () => {', 'const getCurrentBroadcastPoints =');

    expect(block).toContain("alert(error.error || tc('networkError'));\n        return;");
    expect(block).toContain("logger.error('Failed to update qualification cup', { error });\n      alert(tc('networkError'));");
    expect(block).not.toContain('Failed to save cup assignment');
  });

  it('reports both GP manual-score and race-detail save failures', () => {
    const block = sliceBetween(readPage('gp'), 'const handleMatchSubmit = async () => {', '/* Extract unique groups from qualifications');

    expect(block).toContain("alert(errorData.error || tc('networkError'));");
    expect(block).toContain("logger.error('Failed to manually update GP score:', metadata);\n        alert(tc('networkError'));");
    expect(block).toContain("logger.error('Failed to update match:', metadata);\n      alert(tc('networkError'));");
    expect(block).not.toContain("t('manualScoreSaveFailed')");
  });
});

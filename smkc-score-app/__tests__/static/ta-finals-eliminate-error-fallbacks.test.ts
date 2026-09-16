import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/tournaments/[id]/ta/finals/page.tsx'), 'utf8');

describe('TA finals manual elimination error fallback contract (issue #3600)', () => {
  const start = source.indexOf('const handleEliminatePlayer');
  const end = source.indexOf('const handleSetLives', start);
  const handler = source.slice(start, end);

  it('preserves API errors and localizes generic failures', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(handler).toContain("alert(error.error || tCommon('networkError'));");
    expect(handler).toContain("alert(tCommon('networkError'));");
    expect(handler).toContain("logger.error('Failed to eliminate player:'");
    expect(handler).not.toContain("alert('Failed to eliminate player')");
  });

  it('keeps the existing PUT contract and success cleanup', () => {
    expect(handler).toContain("method: 'PUT'");
    expect(handler).toContain("action: 'eliminate'");
    expect(handler).toContain('setIsEliminateDialogOpen(false);');
    expect(handler).toContain('setEntryToEliminate(null);');
    expect(handler).toContain('fetchData();');
  });
});

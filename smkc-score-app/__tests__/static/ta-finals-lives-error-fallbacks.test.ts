import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/tournaments/[id]/ta/finals/page.tsx'), 'utf8');

describe('TA finals set-lives error fallback contract (issue #3602 / #3864)', () => {
  const start = source.indexOf('const handleSetLives');
  const end = source.indexOf('// === Derived State ===', start);
  const handler = source.slice(start, end);

  it('fails closed on HTTP errors while keeping request rejection localized', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(handler).toContain("alert(tTaFinals('livesUpdateFailed'));");
    expect(handler).toContain("alert(tCommon('networkError'));");
    expect(handler).toContain("logger.error('Failed to set player lives:'");
    expect(handler).toContain('status: response.status');
    expect(handler).not.toContain('error.error');
    expect(handler).not.toContain('response.json().catch');
    expect(handler).not.toContain('err instanceof Error ? err.message');
  });

  it('keeps stale-write protection and success cleanup', () => {
    expect(handler).toContain("method: 'PUT'");
    expect(handler).toContain("action: 'set_lives'");
    expect(handler).toContain('expectedVersion: input?.expectedVersion ?? entry.version');
    expect(handler).toContain('expectedLives: input?.expectedLives ?? entry.lives');
    expect(handler).toContain('delete next[entry.id];');
    expect(handler).toContain('fetchData();');
    expect(handler).toContain('setSavingLifeEntryId(null);');
  });
});

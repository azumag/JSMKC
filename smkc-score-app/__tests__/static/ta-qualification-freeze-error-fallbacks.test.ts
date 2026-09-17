import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

describe('TA qualification freeze error fallback contract', () => {
  const source = readAppFile('src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx');
  const start = source.indexOf('const handleToggleFreeze = async () => {');
  const end = source.indexOf('\n  // === Event Handlers ===', start);
  const block = source.slice(start, end);

  it('keeps API errors first and uses common.networkError for generic failures', () => {
    expect(block).toContain("const errorData = await response.json().catch(() => ({}));");
    expect(block).toContain("toast.error(errorData.error || tc('networkError'));");
    expect(block).toContain("toast.error(tc('networkError'));");
    expect(block).not.toContain('Failed to update freeze state');
    expect(block).not.toContain('Failed to toggle freeze');
    expect(block).not.toContain('err instanceof Error ? err.message :');
  });

  it('keeps low-level response and rejection details in the client logger', () => {
    expect(block).toContain("logger.error('Failed to update TA qualification freeze state:', {");
    expect(block).toContain('status: response.status');
    expect(block).toContain('message: err.message');
    expect(block).toContain('stack: err.stack');
  });

  it('preserves the successful PUT payload, refetch, and localized success toast', () => {
    expect(block).toContain("method: 'PUT'");
    expect(block).toContain('body: JSON.stringify({ frozenStages: newFrozen })');
    expect(block).toContain('refetch();');
    expect(block).toContain(
      "toast.success(isFrozen ? t('unfreezeQualification') : t('freezeQualification'));",
    );
  });

  it.each(['en', 'ja'])('defines common.networkError for %s', (locale) => {
    const messages = readAppFile('messages', `${locale}.json`);
    expect(messages).toMatch(/"networkError"\s*:\s*"[^"]+"/);
  });
});

import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

function extractBlock(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  return source.slice(start, end);
}

describe('TA qualification admin mutation error fallback contract', () => {
  const source = readAppFile('src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx');
  const promoteBlock = extractBlock(source, 'const handlePromoteToPhase = async', 'const handleResetPhase = async');
  const resetBlock = extractBlock(source, 'const handleResetPhase = async', 'const handleToggleFreeze = async');
  const saveTimesBlock = extractBlock(source, 'const handleSaveTimes = async', '// === Helper Functions ===');

  it('uses API errors first and common.networkError for promote failures', () => {
    expect(promoteBlock).toContain('const json = await response.json().catch(() => ({}));');
    expect(promoteBlock).toContain("alert(json.error || tc('networkError'));");
    expect(promoteBlock).toContain("alert(tc('networkError'));");
    expect(promoteBlock).not.toContain('Failed to promote players');
    expect(promoteBlock).not.toContain("const errorMessage = err instanceof Error ? err.message : 'Failed to promote'");
    expect(promoteBlock).toContain("logger.error('Failed to promote TA phase:', {");
    expect(promoteBlock).toContain('status: response.status');
    expect(promoteBlock).toContain('message: err.message');
    expect(promoteBlock).toContain('stack: err.stack');
    expect(promoteBlock).toContain('await fetchPhaseStatus();');
  });

  it('uses API errors first and common.networkError for reset failures', () => {
    expect(resetBlock).toContain('const json = await response.json().catch(() => ({}));');
    expect(resetBlock).toContain("alert(json.error || tc('networkError'));");
    expect(resetBlock).toContain("alert(tc('networkError'));");
    expect(resetBlock).not.toContain('const errorMessage = err instanceof Error ? err.message');
    expect(resetBlock).toContain("logger.error('Failed to reset TA phase:', {");
    expect(resetBlock).toContain("body: JSON.stringify({ action: 'reset_phase', phase: stage })");
    expect(resetBlock).toContain('await fetchPhaseStatus();');
  });

  it('uses API errors first and common.networkError for qualification time save failures', () => {
    expect(saveTimesBlock).toContain("setSaveError(errorData.error || tc('networkError'));");
    expect(saveTimesBlock).toContain("setSaveError(tc('networkError'));");
    expect(saveTimesBlock).not.toContain("throw new Error(errorData.error || 'Failed to save times')");
    expect(saveTimesBlock).not.toContain(
      "const errorMessage = err instanceof Error ? err.message : 'Failed to save times'",
    );
    expect(saveTimesBlock).toContain("logger.error('Failed to save TA qualification times:', {");
    expect(saveTimesBlock).toContain('status: response.status');
    expect(saveTimesBlock).toContain('message: err.message');
    expect(saveTimesBlock).toContain('stack: err.stack');
    expect(saveTimesBlock).toContain('setIsTimeEntryDialogOpen(false);');
    expect(saveTimesBlock).toContain('refetch();');
  });

  it.each(['en', 'ja'])('defines common.networkError for %s', (locale) => {
    const messages = readAppFile('messages', `${locale}.json`);
    expect(messages).toMatch(/"networkError"\s*:\s*"[^"]+"/);
  });
});

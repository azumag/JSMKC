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

  it('uses common.networkError for promote HTTP failures without logging raw response details', () => {
    expect(promoteBlock).toContain("alert(tc('networkError'));");
    expect(promoteBlock).not.toContain('json.error');
    expect(promoteBlock).not.toContain("alert(json.error || tc('networkError'));");
    expect(promoteBlock).toContain("logger.error('Failed to promote TA phase:', {");
    expect(promoteBlock).toContain('status: response.status');
    expect(promoteBlock).toContain('message: err.message');
    expect(promoteBlock).toContain('stack: err.stack');
    expect(promoteBlock).toContain('await fetchPhaseStatus();');
    expect(promoteBlock.indexOf('if (!response.ok)')).toBeLessThan(promoteBlock.indexOf('const json = await response.json()'));
  });

  it('uses common.networkError for reset HTTP failures without parsing the response body', () => {
    expect(resetBlock).toContain("alert(tc('networkError'));");
    expect(resetBlock).not.toContain('response.json()');
    expect(resetBlock).not.toContain('json.error');
    expect(resetBlock).toContain("logger.error('Failed to reset TA phase:', {");
    expect(resetBlock).toContain('status: response.status');
    expect(resetBlock).toContain("body: JSON.stringify({ action: 'reset_phase', phase: stage })");
    expect(resetBlock).toContain('await fetchPhaseStatus();');
  });

  it('uses common.networkError for qualification time-save HTTP failures without parsing response details', () => {
    expect(saveTimesBlock).toContain("setSaveError(tc('networkError'));");
    expect(saveTimesBlock).not.toContain('response.json()');
    expect(saveTimesBlock).not.toContain('errorData.error');
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

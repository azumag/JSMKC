from pathlib import Path

SOURCE_PATH = Path('smkc-score-app/src/app/tournaments/[id]/ta/page-client.tsx')
source = SOURCE_PATH.read_text()


def replace_between(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[:start] + replacement.rstrip() + text[end:]


source = replace_between(
    source,
    '  const handlePromoteToPhase = async (action: string, skipConfirm = false) => {',
    '\n\n  /**\n   * Reset (undo) a phase promotion',
    '''  const handlePromoteToPhase = async (action: string, skipConfirm = false) => {
    const confirmKey = PROMOTION_CONFIRM_KEYS[action];
    if (!skipConfirm && confirmKey && !confirm(t(confirmKey))) return;
    setPromotingPhase(action);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        logger.error('Failed to promote TA phase:', {
          status: response.status,
          error: json.error,
          action,
          tournamentId,
        });
        alert(json.error || tc('networkError'));
        return;
      }
      // Unwrap createSuccessResponse wrapper: { success, data: { entries, skipped } }
      const data = json.data ?? json;
      // Refresh phase status after promotion
      await fetchPhaseStatus();
      if (data.skipped && data.skipped.length > 0) {
        alert(`Promoted ${data.entries.length} players. Skipped: ${data.skipped.join(', ')} (incomplete times)`);
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to promote TA phase:', { ...metadata, action, tournamentId });
      alert(tc('networkError'));
    } finally {
      setPromotingPhase(null);
    }
  };''',
)

source = replace_between(
    source,
    '  const handleResetPhase = async (stage: TaPhaseStage) => {',
    '\n\n  /**\n   * Toggle freeze/unfreeze for the qualification stage',
    '''  const handleResetPhase = async (stage: TaPhaseStage) => {
    if (!confirm(t('resetPhaseConfirm', { phaseLabel: t(stage) }))) return;
    setResettingPhase(stage);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_phase', phase: stage }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        logger.error('Failed to reset TA phase:', {
          status: response.status,
          error: json.error,
          stage,
          tournamentId,
        });
        alert(json.error || tc('networkError'));
        return;
      }
      // Refresh phase status so the reset stage's card and its promotion
      // button reappear immediately.
      await fetchPhaseStatus();
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to reset TA phase:', { ...metadata, stage, tournamentId });
      alert(tc('networkError'));
    } finally {
      setResettingPhase(null);
    }
  };''',
)

source = replace_between(
    source,
    '  const handleSaveTimes = async () => {',
    '\n\n  // === Helper Functions ===',
    '''  const handleSaveTimes = async () => {
    if (!selectedEntry) return;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/ta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: selectedEntry.id,
          times: timeInputs,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error('Failed to save TA qualification times:', {
          status: response.status,
          error: errorData.error,
          tournamentId,
          entryId: selectedEntry.id,
        });
        setSaveError(errorData.error || tc('networkError'));
        return;
      }

      setIsTimeEntryDialogOpen(false);
      setSelectedEntry(null);
      setTimeInputs({});
      refetch();
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to save TA qualification times:', {
        ...metadata,
        tournamentId,
        entryId: selectedEntry.id,
      });
      setSaveError(tc('networkError'));
    } finally {
      setSaving(false);
    }
  };''',
)

SOURCE_PATH.write_text(source)

TEST_PATH = Path('smkc-score-app/__tests__/static/ta-qualification-admin-mutation-error-fallbacks.test.ts')
TEST_PATH.write_text("""import fs from 'fs';
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
  const promoteBlock = extractBlock(
    source,
    'const handlePromoteToPhase = async',
    'const handleResetPhase = async',
  );
  const resetBlock = extractBlock(source, 'const handleResetPhase = async', 'const handleToggleFreeze = async');
  const saveTimesBlock = extractBlock(source, 'const handleSaveTimes = async', '// === Helper Functions ===');

  it('uses API errors first and common.networkError for promote failures', () => {
    expect(promoteBlock).toContain("const json = await response.json().catch(() => ({}));");
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
    expect(resetBlock).toContain("const json = await response.json().catch(() => ({}));");
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
    expect(saveTimesBlock).not.toContain("const errorMessage = err instanceof Error ? err.message : 'Failed to save times'");
    expect(saveTimesBlock).toContain("logger.error('Failed to save TA qualification times:', {");
    expect(saveTimesBlock).toContain('status: response.status');
    expect(saveTimesBlock).toContain('message: err.message');
    expect(saveTimesBlock).toContain('stack: err.stack');
    expect(saveTimesBlock).toContain('setIsTimeEntryDialogOpen(false);');
    expect(saveTimesBlock).toContain('refetch();');
  });

  it.each(['en', 'ja'])('defines common.networkError for %s', (locale) => {
    const messages = readAppFile('messages', `${locale}.json`);
    expect(messages).toMatch(/\"networkError\"\\s*:\\s*\"[^\"]+\"/);
  });
});
""")

DOC_PATH = Path('smkc-score-app/docs/ta-qualification-admin-mutation-error-fallbacks.md')
DOC_PATH.write_text("""# TA qualification admin mutation error fallbacks

TA qualification の time 保存と phase promote/reset は、利用者向けエラーと診断用エラー詳細を分離する。

API が具体的な `error` を返した場合はその内容を優先する。response body に具体的な error がない generic non-2xx と `fetch()` rejection は locale-aware な `common.networkError` を表示し、HTTP status、raw `Error.message`、stack は client logger のみに残す。

成功時の endpoint、method、payload、dialog state、refetch、phase-status refresh は変更しない。promotion の skipped-player 成功通知はこの契約の対象外とする。
""")

Path('.github/workflows/patch-3628.yml').unlink(missing_ok=True)
Path('.github/scripts/patch-3628.py').unlink(missing_ok=True)

from pathlib import Path

SOURCE_PATH = Path('smkc-score-app/src/app/tournaments/[id]/ta/page-client.tsx')
source = SOURCE_PATH.read_text()
start_marker = '  const handleSaveSetup = async () => {'
end_marker = '\n\n  // Check if qualification entries exist in each phase'
start = source.index(start_marker)
end = source.index(end_marker, start)
replacement = '''  const handleSaveSetup = async () => {
    if (saving) return;

    class SetupSaveError extends Error {
      constructor(
        message: string,
        readonly status: number,
        readonly operation: string,
      ) {
        super(message);
        this.name = 'SetupSaveError';
      }
    }

    const responseError = async (response: Response, operation: string) => {
      const payload = await response.json().catch(() => ({}));
      return new SetupSaveError(payload.error || tc('networkError'), response.status, operation);
    };

    setSaving(true);
    setSaveError(null);
    try {
      const existing = entries.filter((e) => e.stage === 'qualification');
      const existingByPlayerId = new Map(existing.map((e) => [e.playerId, e]));
      const setupByPlayerId = new Map(setupEntries.map((s) => [s.playerId, s]));

      /* 1. Delete entries that were unchecked. Sequential to avoid hammering D1. */
      for (const e of existing) {
        if (setupByPlayerId.has(e.playerId)) continue;
        const res = await fetch(`/api/tournaments/${tournamentId}/ta?entryId=${e.id}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
          throw await responseError(res, 'remove_player');
        }
      }

      /* 2. Add newly-checked players via the batch endpoint (supports seeding). */
      const toAdd = setupEntries.filter((s) => !existingByPlayerId.has(s.playerId));
      if (toAdd.length > 0) {
        const res = await fetch(`/api/tournaments/${tournamentId}/ta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerEntries: toAdd.map((s) => ({
              playerId: s.playerId,
              ...(typeof s.seeding === 'number' ? { seeding: s.seeding } : {}),
            })),
          }),
        });
        if (!res.ok) {
          throw await responseError(res, 'add_players');
        }
      }

      /* 3. Re-fetch so we have entry ids for anything just added, then
       * reconcile seeding + partner per entry. */
      const refreshed = await fetchWithRetry(`/api/tournaments/${tournamentId}/ta?stage=qualification`);
      if (!refreshed.ok) {
        throw await responseError(refreshed, 'refetch_entries');
      }
      const refreshedJson = await refreshed.json();
      const refreshedEntries: TTEntry[] = (refreshedJson.data ?? refreshedJson).entries ?? [];
      const refreshedByPlayerId = new Map(refreshedEntries.map((e) => [e.playerId, e]));

      if (taBattleRoyaleMode) {
        const handicapUpdates = setupEntries
          .map((setup) => {
            const entry = refreshedByPlayerId.get(setup.playerId);
            return entry && entry.taHandicapSeconds !== setup.taHandicapSeconds
              ? { entryId: entry.id, taHandicapSeconds: setup.taHandicapSeconds }
              : null;
          })
          .filter((value): value is { entryId: string; taHandicapSeconds: TaHandicapSeconds } => value !== null);
        if (handicapUpdates.length > 0) {
          const handicapResponse = await fetch(`/api/tournaments/${tournamentId}/ta`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'bulk_update_handicaps', updates: handicapUpdates }),
          });
          if (!handicapResponse.ok) {
            throw await responseError(handicapResponse, 'update_handicaps');
          }
        }
      }

      for (const s of setupEntries) {
        const entry = refreshedByPlayerId.get(s.playerId);
        if (!entry) continue;

        /* Update seeding only when it actually changes. `undefined` on the
         * setup side clears seeding back to null. */
        const desiredSeeding = typeof s.seeding === 'number' ? s.seeding : null;
        if (desiredSeeding !== entry.seeding) {
          const res = await fetch(`/api/tournaments/${tournamentId}/ta`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entryId: entry.id,
              action: 'update_seeding',
              seeding: desiredSeeding,
            }),
          });
          if (!res.ok) {
            throw await responseError(res, 'update_seeding');
          }
        }

        const desiredPartnerId = s.partnerId ?? null;
        if (desiredPartnerId !== (entry.partnerId ?? null)) {
          const res = await fetch(`/api/tournaments/${tournamentId}/ta`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entryId: entry.id,
              action: 'set_partner',
              partnerId: desiredPartnerId,
            }),
          });
          if (!res.ok) {
            throw await responseError(res, 'update_partner');
          }
        }
      }

      setIsSetupDialogOpen(false);
      refetch();
      toast.success(t('pairsSaved'));
    } catch (err) {
      const isSetupSaveError = err instanceof SetupSaveError;
      const userMessage = isSetupSaveError ? err.message : tc('networkError');
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to save TA qualification setup:', {
        ...metadata,
        status: isSetupSaveError ? err.status : undefined,
        operation: isSetupSaveError ? err.operation : 'request',
        tournamentId,
      });
      setSaveError(userMessage);
      toast.error(userMessage);
    } finally {
      setSaving(false);
    }
  };'''
SOURCE_PATH.write_text(source[:start] + replacement + source[end:])

TEST_PATH = Path('smkc-score-app/__tests__/static/ta-qualification-setup-error-fallbacks.test.ts')
TEST_PATH.write_text("""import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

describe('TA qualification setup error fallback contract', () => {
  const source = readAppFile('src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx');
  const start = source.indexOf('const handleSaveSetup = async () => {');
  const end = source.indexOf('// Check if qualification entries exist in each phase', start);
  const block = source.slice(start, end);

  it('separates API response errors from request rejection messages', () => {
    expect(block).toContain('class SetupSaveError extends Error');
    expect(block).toContain("payload.error || tc('networkError')");
    expect(block).toContain("const userMessage = isSetupSaveError ? err.message : tc('networkError');");
    expect(block).not.toContain("const msg = err instanceof Error ? err.message : 'Save failed'");
    expect(block).not.toContain('Failed to add players');
    expect(block).not.toContain('Failed to refetch TA entries');
    expect(block).not.toContain('Failed to update TA handicaps');
  });

  it('logs low-level details with response status and failed operation', () => {
    expect(block).toContain("logger.error('Failed to save TA qualification setup:', {");
    expect(block).toContain('message: err.message');
    expect(block).toContain('stack: err.stack');
    expect(block).toContain('status: isSetupSaveError ? err.status : undefined');
    expect(block).toContain("operation: isSetupSaveError ? err.operation : 'request'");
  });

  it('preserves save ordering, payload actions, 404 delete tolerance, and success path', () => {
    const removeIndex = block.indexOf("method: 'DELETE'");
    const addIndex = block.indexOf("method: 'POST'");
    const refetchIndex = block.indexOf('stage=qualification');
    const handicapIndex = block.indexOf("action: 'bulk_update_handicaps'");
    const seedingIndex = block.indexOf("action: 'update_seeding'");
    const partnerIndex = block.indexOf("action: 'set_partner'");
    expect(removeIndex).toBeGreaterThan(-1);
    expect(addIndex).toBeGreaterThan(removeIndex);
    expect(refetchIndex).toBeGreaterThan(addIndex);
    expect(handicapIndex).toBeGreaterThan(refetchIndex);
    expect(seedingIndex).toBeGreaterThan(handicapIndex);
    expect(partnerIndex).toBeGreaterThan(seedingIndex);
    expect(block).toContain('res.status !== 404');
    expect(block).toContain('setIsSetupDialogOpen(false);');
    expect(block).toContain('refetch();');
    expect(block).toContain("toast.success(t('pairsSaved'));");
  });

  it.each(['en', 'ja'])('defines common.networkError for %s', (locale) => {
    const messages = readAppFile('messages', `${locale}.json`);
    expect(messages).toMatch(/\"networkError\"\\s*:\\s*\"[^\"]+\"/);
  });
});
""")

DOC_PATH = Path('smkc-score-app/docs/ta-qualification-setup-error-fallbacks.md')
DOC_PATH.write_text("""# TA qualification setup error fallbacks

TA qualification setup は roster 削除、player 追加、entry 再取得、Battle Royale handicap、seeding、partner の順で複数 API を更新する。この保存順序と既存 payload は維持する。

API が具体的な `error` を返した場合はその内容を利用者へ提示する。response body に具体的 error がない non-2xx と `fetch()` / retry helper の rejection は locale-aware な `common.networkError` を dialog と toast に表示する。raw `Error.message` / stack、HTTP status、失敗した操作種別は client logger のみに残す。

削除時の 404 許容、逐次更新、成功時の dialog close / refetch / success toast は変更しない。部分成功時 rollback の追加はこの契約の対象外とする。
""")

Path('.github/workflows/patch-3630.yml').unlink(missing_ok=True)
Path('.github/scripts/patch-3630.py').unlink(missing_ok=True)

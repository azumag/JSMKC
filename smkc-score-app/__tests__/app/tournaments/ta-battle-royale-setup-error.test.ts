import fs from 'node:fs';
import path from 'node:path';

describe('TA battle royale setup error contract (issues #3572, #3636, #3794, #3838)', () => {
  const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  it('uses common.networkError for start failures without exposing raw response or transport details', () => {
    const source = read('src/app/tournaments/[id]/ta/battle-royale-setup-client.tsx');

    expect(source).toContain("const tc = useTranslations('common')");
    expect(source).toContain("setError(tc('networkError'))");
    expect(source).not.toContain("setError(payload.error || tc('networkError'))");
    expect(source).not.toContain("throw new Error(payload.error || tc('networkError'))");
    expect(source).not.toContain('startError instanceof Error ? startError.message');
    expect(source).not.toContain("payload.error || 'Failed to start TA battle royale'");
    expect(source).toContain("logger.error('Failed to start TA battle royale'");
    expect(source).toContain('status: response.status');
    expect(source).toContain('error: payload.error');
  });

  it('documents the fail-closed UI contract without changing start semantics', () => {
    const source = read('src/app/tournaments/[id]/ta/battle-royale-setup-client.tsx');
    const docs = read('docs/ta-battle-royale-setup-client-errors.md');

    expect(source).toContain('if (savingRef.current || selectedPlayers.length < 2) return;');
    expect(source).toContain('body: JSON.stringify({ players: selectedPlayers })');
    expect(source).toContain('/ta/finals`');
    expect(docs).toContain('non-2xx response も `common.networkError`');
    expect(docs).toContain('raw `payload.error`');
    expect(docs).toContain('raw `Error.message`');
    expect(docs).toContain('logger');
  });

  it('acquires a synchronous start lock before React saving state and releases it in finally', () => {
    const source = read('src/app/tournaments/[id]/ta/battle-royale-setup-client.tsx');
    const guardIndex = source.indexOf('if (savingRef.current || selectedPlayers.length < 2) return;');
    const acquireIndex = source.indexOf('savingRef.current = true;', guardIndex);
    const savingIndex = source.indexOf('setSaving(true);', acquireIndex);
    const finallyIndex = source.indexOf('} finally {', savingIndex);
    const releaseIndex = source.indexOf('savingRef.current = false;', finallyIndex);
    const clearSavingIndex = source.indexOf('setSaving(false);', releaseIndex);

    expect(source).toContain('const savingRef = useRef(false);');
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(acquireIndex).toBeGreaterThan(guardIndex);
    expect(savingIndex).toBeGreaterThan(acquireIndex);
    expect(finallyIndex).toBeGreaterThan(savingIndex);
    expect(releaseIndex).toBeGreaterThan(finallyIndex);
    expect(clearSavingIndex).toBeGreaterThan(releaseIndex);
  });
});

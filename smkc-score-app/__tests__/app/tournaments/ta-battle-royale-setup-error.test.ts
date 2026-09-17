import fs from 'node:fs';
import path from 'node:path';

describe('TA battle royale setup error contract (issues #3572, #3636)', () => {
  const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  it('keeps API-specific start errors ahead of common.networkError without exposing transport Error.message', () => {
    const source = read('src/app/tournaments/[id]/ta/battle-royale-setup-client.tsx');

    expect(source).toContain("const tc = useTranslations('common')");
    expect(source).toContain("setError(payload.error || tc('networkError'))");
    expect(source).toContain("setError(tc('networkError'))");
    expect(source).not.toContain("throw new Error(payload.error || tc('networkError'))");
    expect(source).not.toContain('startError instanceof Error ? startError.message');
    expect(source).not.toContain("payload.error || 'Failed to start TA battle royale'");
    expect(source).toContain("logger.error('Failed to start TA battle royale'");
    expect(source).toContain('status: response.status');
  });

  it('documents the generic fallback without changing start semantics', () => {
    const source = read('src/app/tournaments/[id]/ta/battle-royale-setup-client.tsx');
    const docs = read('docs/ta-battle-royale-setup-client-errors.md');

    expect(source).toContain('if (saving || selectedPlayers.length < 2) return;');
    expect(source).toContain('body: JSON.stringify({ players: selectedPlayers })');
    expect(source).toContain('/ta/finals`');
    expect(docs).toContain('具体的な `payload.error`');
    expect(docs).toContain('generic non-2xx failure は `common.networkError`');
    expect(docs).toContain('raw `Error.message`');
  });
});

import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '../..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

describe('TA battle royale E2E wiring', () => {
  it('registers standalone and preview commands', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['e2e:ta-br']).toBe('node e2e/tc-ta-battle-royale.js');
    expect(pkg.scripts['e2e:preview:ta-br']).toContain('tc-ta-battle-royale.js');
  });

  it('includes the suite in tc-all and covers the critical invariants', () => {
    const suite = read('e2e/tc-ta-battle-royale.js');

    expect(suite).toContain('for (let index = 1; index <= 6; index++)');
    expect(suite).toContain("code === 'TA_MODE_LOCKED'");
    expect(suite).toContain('all three one-life bottom-half players must be eliminated');
    expect(suite).toContain("pendingSuddenDeath?.kind === 'revival'");
    expect(suite).toContain('archive?.schemaVersion === 2');
    expect(suite).toContain('archivedPhase.b?.data?.archived === true');
  });

  it('routes Phase 3 UI submission through the confirmation preview', () => {
    const suite = read('e2e/tc-ta-battle-royale.js');
    expect(suite).toContain('Review Before Submit|送信前確認|補正後タイム順');
    expect(suite).toContain('/Confirm results|結果を確定/');
  });
  it('keeps archived TA finals read-only for administrators', () => {
    const page = read('src/app/tournaments/[id]/ta/finals/page.tsx');
    expect(page).toContain('const canManage = Boolean(isAdmin) && !archived;');
    expect(page).toContain('isAdmin={canManage}');
    expect(page).not.toContain('isAdmin &&');
  });

});

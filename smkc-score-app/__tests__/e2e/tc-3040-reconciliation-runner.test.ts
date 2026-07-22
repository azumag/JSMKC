import fs from 'fs';
import path from 'path';

describe('TC-3040 reconciliation runner guards', () => {
  for (const mode of ['bm', 'mr', 'gp']) {
    it(`${mode} preserves the unaffected Upper opening slot with a real field key`, () => {
      const source = fs.readFileSync(path.join(process.cwd(), 'e2e', `tc-${mode}.js`), 'utf8');
      expect(source).toContain("const oppositeKey = change.slot === 1 ? 'player2Id' : 'player1Id';");
      expect(source).toContain('target[oppositeKey] === targetBefore[oppositeKey]');
      expect(source).not.toContain("targetBefore[`player${change.slot === 1 ? 'player2Id' : 'player1Id'}`]");
    });
  }
});

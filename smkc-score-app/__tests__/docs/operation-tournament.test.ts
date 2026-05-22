import fs from 'fs';
import path from 'path';

describe('tournament operation manual', () => {
  const manualPath = path.resolve(__dirname, '../../../docs/operation-tournament.md');
  const manual = fs.readFileSync(manualPath, 'utf8');

  it('documents the overall publicModes backfill procedure for existing tournaments', () => {
    const sectionMatch = manual.match(/### .*既存大会で総合ランキングを公開する移行手順[\s\S]*?(?=\n---|\n## )/);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];

    expect(section).toContain('overall');
    expect(section).toContain('publicModes');
    expect(section).toContain('wrangler d1 export');
    expect(section).toContain('UPDATE "Tournament"');
    expect(section).toContain('json_insert');
    expect(section).toContain("WHERE value IN ('ta', 'bm', 'mr', 'gp')");
    expect(section).toContain('status IN (\'active\', \'completed\')');
    expect(section).toContain('/api/tournaments/[id]/overall-ranking');
  });

  it('documents that public mode reveal order is not enforced by the system', () => {
    const sectionMatch = manual.match(/### 3\.3 推奨する公開タイミング[\s\S]*?(?=\n### 3\.4 )/);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];

    expect(section).toContain('システム上の公開順序制約はありません');
    expect(section).toContain('どの競技からでも公開できます');
  });
});

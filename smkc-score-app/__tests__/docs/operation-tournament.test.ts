import fs from 'fs';
import path from 'path';

describe('tournament operation manual', () => {
  const manualPath = path.resolve(__dirname, '../../../docs/operation-tournament.md');
  const manual = fs.readFileSync(manualPath, 'utf8');

  it('uses a test-file-relative path for the root docs directory', () => {
    expect(fs.existsSync(manualPath)).toBe(true);
    expect(manualPath.endsWith(path.join('docs', 'operation-tournament.md'))).toBe(true);
  });

  it('documents the overall publicModes backfill procedure for existing tournaments', () => {
    const sectionMatch = manual.match(/### 3\.4 既存大会で総合ランキングを公開する移行手順[\s\S]*?(?=\n---|\n## 4\.)/);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];

    expect(section).toContain('overall');
    expect(section).toContain('publicModes');
    expect(section).toContain('wrangler d1 export');
    expect(section).toContain('UPDATE "Tournament"');
    expect(section).toContain('json_insert');
    expect(section).toContain("WHERE value IN ('ta', 'bm', 'mr', 'gp')");
    expect(section).toContain("`Tournament.status` は現在 `draft`, `active`, `completed`");
    expect(section).toContain('/api/tournaments/[id]/overall-ranking');
  });
});

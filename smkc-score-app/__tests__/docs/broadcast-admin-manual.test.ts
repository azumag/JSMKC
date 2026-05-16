import fs from 'fs';
import path from 'path';

describe('broadcast admin manual', () => {
  const manualPath = path.join(process.cwd(), '..', 'docs', 'broadcast-admin-manual.md');
  const manual = fs.readFileSync(manualPath, 'utf8');

  it('documents which TA page to use for each broadcast phase', () => {
    const sectionMatch = manual.match(/### [\d.]+\s+TA から反映する[\s\S]*?(?=\n###|$)/);
    expect(sectionMatch).not.toBeNull();
    const section = sectionMatch![0];

    expect(section).toContain('| TA 予選 | `/tournaments/[id]/ta` |');
    expect(section).toContain('| フェーズ1 | `/tournaments/[id]/ta/phase1` |');
    expect(section).toContain('| フェーズ2 | `/tournaments/[id]/ta/phase2` |');
    expect(section).toContain('| TA 決勝 | `/tournaments/[id]/ta/finals` |');
    expect(section).toContain('迷う場合は `/tournaments/[id]/ta`');
  });
});

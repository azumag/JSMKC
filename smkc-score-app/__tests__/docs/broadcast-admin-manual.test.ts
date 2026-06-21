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

  it('states TV2/TV3/TV4 2P-mode overlay exclusions without ambiguous wording', () => {
    const tvSectionMatch = manual.match(/## \d+\. TV# の使い方[\s\S]*?(?=\n## \d+\.|$)/);
    expect(tvSectionMatch).not.toBeNull(); // section number is dynamic to survive renumbering
    const tvSection = tvSectionMatch![0];

    const troubleshootingMatch = manual.match(/### TV2\/TV3\/TV4 の選手名が出ない[\s\S]*?(?=\n###|$)/);
    expect(troubleshootingMatch).not.toBeNull();
    const troubleshooting = troubleshootingMatch![0];

    // The manual is used during live broadcast operation, so this wording must
    // be deterministic. TV2+ is not a flaky overlay path in 2P modes; only TV1
    // feeds the 1P/2P OBS overlay names.
    expect(tvSection).toContain('| TV2 | TA では 2P 側の配信表示に反映される。2P 対戦モードでは別配信台・記録用として扱い、配信表示には反映されない |');
    expect(tvSection).toContain('| TV3/TV4 | 進行上の控え・別配信台・記録用として使えるが、配信表示には反映されない |');
    expect(tvSection).not.toContain('反映されない場合がある');
    expect(troubleshooting).toContain('TV2/TV3/TV4 に割り当てた試合は OBS の 1P/2P 表示へ出ません。');
    expect(troubleshooting).not.toContain('出ない場合があります');
  });
});

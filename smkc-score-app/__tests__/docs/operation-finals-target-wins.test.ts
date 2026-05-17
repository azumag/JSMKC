import fs from 'fs';
import path from 'path';
import { getBmFinalsTargetWins, getMrFinalsTargetWins } from '@/lib/finals-target-wins';

function readRootDoc(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../', relativePath), 'utf8');
}

function extractFinalsFormatSection(manual: string): string {
  const sectionMatch = manual.match(/### 7\.3 決勝の試合形式[\s\S]*?(?=\n---|\n## 8\.)/);
  expect(sectionMatch).not.toBeNull();
  return sectionMatch![0];
}

describe('operation finals target win manuals', () => {
  it('keeps the BM finals manual aligned with round-aware score validation', () => {
    const section = extractFinalsFormatSection(readRootDoc('docs/operation-bm.md'));

    expect(section).toContain('| 段階 | システム上の必要勝利数 |');
    expect(section).toContain(`| バラッジ | 先に ${getBmFinalsTargetWins({ stage: 'playoff', round: 'playoff_r1' })} 勝、後半は先に ${getBmFinalsTargetWins({ stage: 'playoff', round: 'playoff_r2' })} 勝 |`);
    expect(section).toContain(`| 決勝序盤 | 先に ${getBmFinalsTargetWins({ round: 'winners_r1' })} 勝 |`);
    expect(section).toContain(`| 準決勝以降 | 先に ${getBmFinalsTargetWins({ round: 'winners_sf' })} 勝 |`);
  });

  it('keeps the MR finals manual aligned with round-aware score validation', () => {
    const section = extractFinalsFormatSection(readRootDoc('docs/operation-mr.md'));

    expect(section).toContain('| 段階 | システム上の必要勝利数 |');
    expect(section).toContain(`| バラッジ | 先に ${getMrFinalsTargetWins({ stage: 'playoff', round: 'playoff_r1' })} 勝、後半は先に ${getMrFinalsTargetWins({ stage: 'playoff', round: 'playoff_r2' })} 勝 |`);
    expect(section).toContain(`| 決勝序盤 | 先に ${getMrFinalsTargetWins({ round: 'winners_r1' })} 勝 |`);
    expect(section).toContain(`| 中盤 | 先に ${getMrFinalsTargetWins({ round: 'winners_sf' })} 勝 |`);
    expect(section).toContain(`| Losers Semi Final / Winners Final / Losers Final / Grand Final | 先に ${getMrFinalsTargetWins({ round: 'grand_final' })} 勝 |`);
  });
});

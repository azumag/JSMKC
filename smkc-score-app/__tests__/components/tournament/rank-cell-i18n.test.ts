import fs from 'fs';
import path from 'path';

type RankCellMessages = {
  rankInput: string;
  editRank: string;
  saveRank: string;
  clearRankOverride: string;
};

const appRoot = path.resolve(__dirname, '..', '..', '..');
const componentSource = fs.readFileSync(path.join(appRoot, 'src/components/tournament/rank-cell.tsx'), 'utf8');
const requestSource = fs.readFileSync(path.join(appRoot, 'src/i18n/request.ts'), 'utf8');

const loadMessages = (locale: 'en' | 'ja') =>
  JSON.parse(fs.readFileSync(path.join(appRoot, 'messages/rank-cell', `${locale}.json`), 'utf8')) as RankCellMessages;

describe('RankCell localization contract', () => {
  it('registers a locale-specific RankCell namespace with matching EN/JA keys', () => {
    const en = loadMessages('en');
    const ja = loadMessages('ja');

    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    expect(en).toEqual({
      rankInput: 'Rank override',
      editRank: 'Edit rank',
      saveRank: 'Save rank',
      clearRankOverride: 'Clear rank override',
    });
    expect(ja).toEqual({
      rankInput: '順位上書き',
      editRank: '順位を編集',
      saveRank: '順位を保存',
      clearRankOverride: '順位の上書きを解除',
    });
    expect(requestSource).toContain('rankCell: rankCellMessages[locale]');
  });

  it('uses translated accessible names while keeping the icon glyphs presentation-only', () => {
    expect(componentSource).toContain("const tRankCell = useTranslations('rankCell');");
    expect(componentSource).toContain("aria-label={tRankCell('rankInput')}");
    expect(componentSource).toContain("aria-label={tRankCell('editRank')}");
    expect(componentSource).toContain("aria-label={tRankCell('saveRank')}");
    expect(componentSource).toContain("aria-label={tRankCell('clearRankOverride')}");
    expect(componentSource).not.toContain('aria-label="Edit rank"');
  });
});

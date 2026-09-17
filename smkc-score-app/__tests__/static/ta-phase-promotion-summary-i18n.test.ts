import fs from 'fs';
import path from 'path';

function readAppFile(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
}

describe('TA phase promotion skipped-player summary i18n contract', () => {
  const pageSource = readAppFile('src', 'app', 'tournaments', '[id]', 'ta', 'page-client.tsx');
  const requestSource = readAppFile('src', 'i18n', 'request.ts');
  const en = JSON.parse(readAppFile('messages', 'ta-promotion', 'en.json')) as Record<string, string>;
  const ja = JSON.parse(readAppFile('messages', 'ta-promotion', 'ja.json')) as Record<string, string>;

  it('defines equivalent English and Japanese skipped-player summaries', () => {
    expect(en.promotionSkippedSummary).toBe(
      'Promoted {promoted} players. Skipped: {skipped} (incomplete times)',
    );
    expect(ja.promotionSkippedSummary).toBe(
      '{promoted}名を昇格しました。スキップ: {skipped}（予選タイム未完了）',
    );
  });

  it('merges the feature messages into the ta next-intl namespace', () => {
    expect(requestSource).toContain("import enTaPromotion from '../../messages/ta-promotion/en.json'");
    expect(requestSource).toContain("import jaTaPromotion from '../../messages/ta-promotion/ja.json'");
    expect(requestSource).toContain('...messages.ta');
    expect(requestSource).toContain('...taPromotionMessages[locale]');
  });

  it('uses the translated summary without changing promotion transport or refresh', () => {
    const start = pageSource.indexOf('const handlePromoteToPhase');
    const end = pageSource.indexOf('const handleResetPhase', start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const block = pageSource.slice(start, end);
    expect(block).toContain("t('promotionSkippedSummary'");
    expect(block).toContain('promoted: data.entries.length');
    expect(block).toContain("skipped: data.skipped.join(', ')");
    expect(block).not.toContain('Promoted ${data.entries.length} players');
    expect(block).toContain('body: JSON.stringify({ action })');
    expect(block).toContain('await fetchPhaseStatus();');
  });
});

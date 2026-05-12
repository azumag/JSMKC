import enMessages from '../../messages/en.json';
import jaMessages from '../../messages/ja.json';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

function flattenKeys(value: JsonValue, prefix = ''): string[] {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(child, nextPrefix);
  });
}

describe('translation messages', () => {
  it('keeps the common namespace aligned between English and Japanese', () => {
    const enKeys = new Set(flattenKeys(enMessages.common as JsonObject));
    const jaKeys = new Set(flattenKeys(jaMessages.common as JsonObject));

    expect(Array.from(enKeys).sort()).toEqual(Array.from(jaKeys).sort());
  });

  it('defines the viewTournament label in both locales', () => {
    expect(enMessages.common.viewTournament).toBe('View Tournament');
    expect(jaMessages.common.viewTournament).toBe('トーナメントを見る');
  });

  it('defines home recommendation disclosure copy in both locales', () => {
    expect(enMessages.home).toEqual(expect.objectContaining({
      recommended: 'Recommended',
      recommendedDesc: 'Gear and references picked up by the paddock.',
      recommendedProductName: 'Lenovo 14e Chromebook Gen 3 (Renewed)',
      recommendedProductDesc: 'A compact ChromeOS laptop for tournament desks, stream checks, and score operations.',
      viewOnAmazon: 'View on Amazon',
      affiliateLabel: 'PR',
    }));
    expect(jaMessages.home).toEqual(expect.objectContaining({
      recommended: 'おすすめ',
      recommendedDesc: 'パドックが選ぶ機材・関連書籍。',
      recommendedProductName: 'Lenovo 14e Chromebook Gen 3（整備済み品）',
      recommendedProductDesc: '大会受付・配信確認・スコア運用に使いやすいコンパクトな ChromeOS ノート。',
      viewOnAmazon: 'Amazonで見る',
      affiliateLabel: 'PR',
    }));
  });

  /**
   * ModePublishSwitch (src/components/tournament/mode-publish-switch.tsx) reads
   * mode labels from the `common` namespace via `useTranslations('common')` and
   * passes one of `timeTrial | battleMode | matchRace | grandPrix | overall`
   * as the key.
   * If any of these are missing in `common`, the admin mode pages crash at
   * render time with `MISSING_MESSAGE: common.<modeKey> (<locale>)` — which is
   * exactly how the issue introduced by PR #620 (commit bb02f03) was found.
   * This guards the contract between mode-publish-switch and the message files.
   */
  it.each(['timeTrial', 'battleMode', 'matchRace', 'grandPrix', 'overall'] as const)(
    'defines mode label "%s" in common for both locales (ModePublishSwitch contract)',
    (modeKey) => {
      expect(enMessages.common[modeKey]).toBeDefined();
      expect(jaMessages.common[modeKey]).toBeDefined();
    }
  );
});

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

function placeholders(message: string): string[] {
  return Array.from(message.matchAll(/\{([A-Za-z0-9_]+)\}/g), ([, name]) => name).sort();
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

  /**
   * TA elimination error rendering passes the player nickname as `{name}`.
   * Keep this placeholder contract explicit because next-intl leaves unmatched
   * placeholders unresolved in the rendered message instead of failing at build
   * time, which would turn a validation error into user-visible `{name}` text.
   */
  it('keeps TA elimination invalid-time placeholders aligned with the UI contract', () => {
    expect(placeholders(enMessages.taElimination.invalidTimeFor)).toEqual(['name']);
    expect(placeholders(jaMessages.taElimination.invalidTimeFor)).toEqual(['name']);
  });

  /**
   * TA finals uses the same `{name}` nickname parameter as TA elimination.
   * Guarding both namespaces prevents one finals page from regressing to the
   * old `{player}` parameter while the other phase still renders correctly.
   */
  it('keeps TA finals invalid-time placeholders aligned with the UI contract', () => {
    expect(placeholders(enMessages.taFinals.invalidTimeFor)).toEqual(['name']);
    expect(placeholders(jaMessages.taFinals.invalidTimeFor)).toEqual(['name']);
  });
});

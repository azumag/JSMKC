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
});

// Mock for next-intl used in Jest tests.
// Loads actual translation messages from en.json to match production output.
import en from '../messages/en.json';

const translators = new Map();

const useTranslations = (namespace) => {
  const cacheKey = namespace ?? '__root__';
  const cached = translators.get(cacheKey);
  if (cached) return cached;

  const messages = namespace ? en[namespace] ?? {} : en;
  const translate = (key, params) => {
    const val = messages[key] ?? key;
    if (!params) return val;
    // Simple parameter substitution: replace {param} with its value
    return Object.entries(params).reduce(
      (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      val,
    );
  };

  // next-intl keeps the translation function referentially stable while the
  // locale/messages are unchanged. Mirror that behavior so callback/effect
  // dependency tests do not refire solely because of the test double.
  translators.set(cacheKey, translate);
  return translate;
};

// Locale hook used by components that render <CountryFlag> for tooltip text.
// Tests render against the English message set, so report "en".
const useLocale = () => 'en';

export { useTranslations, useLocale };

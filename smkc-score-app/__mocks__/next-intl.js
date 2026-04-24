// Mock for next-intl used in Jest tests.
// Loads actual translation messages from en.json to match production output.
import en from '../messages/en.json';

const useTranslations = (namespace) => {
  const messages = namespace ? en[namespace] ?? {} : en;
  return (key, params) => {
    const val = messages[key] ?? key;
    if (!params) return val;
    // Simple parameter substitution: replace {param} with its value
    return Object.entries(params).reduce(
      (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      val,
    );
  };
};

export { useTranslations };

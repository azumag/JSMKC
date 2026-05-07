const DEFAULT_E2E_BASE_URL = 'https://preview.smkc.bluemoon.works';
const PRODUCTION_E2E_HOST = 'smkc.bluemoon.works';
const PRODUCTION_E2E_BASE_URL = `https://${PRODUCTION_E2E_HOST}`;
const DEFAULT_E2E_PROFILE_DIR = '/tmp/playwright-smkc-preview-profile';

function normalizeBaseUrl(value) {
  const raw = (value || DEFAULT_E2E_BASE_URL).trim();
  if (!raw) return DEFAULT_E2E_BASE_URL;
  return raw.replace(/\/+$/, '');
}

function isProductionBaseUrl(value) {
  try {
    return new URL(normalizeBaseUrl(value)).origin === PRODUCTION_E2E_BASE_URL;
  } catch {
    return false;
  }
}

function resolveE2EBaseUrl(env = process.env) {
  const baseUrl = normalizeBaseUrl(env.E2E_BASE_URL);
  if (isProductionBaseUrl(baseUrl) && env.E2E_ALLOW_PRODUCTION !== '1') {
    throw new Error(
      [
        `Refusing to run E2E against production (${PRODUCTION_E2E_BASE_URL}).`,
        'Use the preview environment by default, or set E2E_ALLOW_PRODUCTION=1 for an explicit emergency production check.',
      ].join(' '),
    );
  }
  return baseUrl;
}

function resolveE2EProfileDir(env = process.env) {
  return env.E2E_PROFILE_DIR || DEFAULT_E2E_PROFILE_DIR;
}

module.exports = {
  DEFAULT_E2E_BASE_URL,
  PRODUCTION_E2E_HOST,
  PRODUCTION_E2E_BASE_URL,
  DEFAULT_E2E_PROFILE_DIR,
  normalizeBaseUrl,
  isProductionBaseUrl,
  resolveE2EBaseUrl,
  resolveE2EProfileDir,
};

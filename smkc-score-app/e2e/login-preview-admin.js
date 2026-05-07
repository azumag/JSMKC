const { launchPersistentChromiumContext, resolveE2EProfileDir } = require('./lib/common');
const { buildPreviewRuntimeEnv, assertBaseUrlResolvable } = require('./run-preview');

async function isAuthenticated(page) {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/auth/session-status', { credentials: 'same-origin' });
    const body = await response.json().catch(() => null);
    return {
      status: response.status,
      authenticated: body?.data?.authenticated === true,
      body,
    };
  });
  return result;
}

async function main() {
  const env = buildPreviewRuntimeEnv(process.env);
  const { hostname } = new URL(env.E2E_BASE_URL);
  const fallbackAddress = await assertBaseUrlResolvable(env.E2E_BASE_URL);
  if (fallbackAddress && !process.env.E2E_HOST_RESOLVER_RULES) {
    process.env.E2E_HOST_RESOLVER_RULES = `MAP ${hostname} ${fallbackAddress}`;
  }
  process.env.E2E_BASE_URL = env.E2E_BASE_URL;
  process.env.E2E_PROFILE_DIR = env.E2E_PROFILE_DIR;
  if (env.E2E_BROWSER_CHANNEL && !process.env.E2E_BROWSER_CHANNEL) {
    process.env.E2E_BROWSER_CHANNEL = env.E2E_BROWSER_CHANNEL;
  }

  const browser = await launchPersistentChromiumContext(resolveE2EProfileDir(), {
    headless: false,
    viewport: { width: 1440, height: 900 },
  });

  try {
    const page = browser.pages()[0] || await browser.newPage();
    await page.goto(`${env.E2E_BASE_URL}/auth/signin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    let session = await isAuthenticated(page);
    if (session.authenticated) {
      console.log(`[preview-login] already authenticated for ${env.E2E_BASE_URL}`);
      return;
    }

    console.log(`[preview-login] opened ${env.E2E_BASE_URL}/auth/signin`);
    console.log('[preview-login] complete Discord admin login in the opened browser window.');
    console.log('[preview-login] waiting for /api/auth/session-status to become authenticated...');

    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(2000);
      session = await isAuthenticated(page);
      if (session.authenticated) {
        console.log('[preview-login] authenticated. You can now run npm run e2e:preview:all');
        return;
      }
    }

    throw new Error('Timed out waiting for preview admin login to complete.');
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

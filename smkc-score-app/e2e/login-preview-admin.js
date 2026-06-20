const { version: PLAYWRIGHT_VERSION } = require('playwright/package.json');
const { launchPersistentChromiumContext, resolveE2EProfileDir } = require('./lib/common');
const { buildPreviewRuntimeEnv, assertBaseUrlResolvable } = require('./run-preview');

// Observed Playwright internal interruption messages during Discord OAuth
// redirects in the currently declared version (`npm ls playwright`). Re-check
// these patterns when Playwright is upgraded because they are message-based
// fallbacks, not a stable public error-code contract.
const TRANSIENT_LOGIN_POLLING_ERROR_PATTERNS = [
  /Execution context was destroyed/i,
  /Target page, context or browser has been closed/i,
];

function isTransientLoginPollingError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_LOGIN_POLLING_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

async function isAuthenticated(page) {
  try {
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/auth/session-status', { credentials: 'same-origin' });
        const body = await response.json().catch(() => null);
        return {
          status: response.status,
          authenticated: body?.data?.authenticated === true,
          body,
        };
      } catch (error) {
        return {
          status: 0,
          authenticated: false,
          body: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    return result;
  } catch (error) {
    if (!isTransientLoginPollingError(error)) {
      throw error;
    }

    // Use console.log (not console.debug) so CI environments don't suppress this. (#1965)
    console.log(`[preview-login] ignoring transient Playwright ${PLAYWRIGHT_VERSION} login polling error`);
    // Discord OAuth redirects can destroy the current page execution context
    // while the helper is polling. Treat those transient Playwright errors the
    // same as "not authenticated yet" so the manual login window remains open.
    return {
      status: 0,
      authenticated: false,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function waitForPreviewAdminLoginReady(page) {
  const adminTab = page.getByRole('tab', { name: /管理者|Admin/ });
  await adminTab.waitFor({ state: 'visible', timeout: 15000 });
  await adminTab.click();
  await page.getByRole('button', { name: /Discord/ }).waitFor({ state: 'visible', timeout: 15000 });
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
    await waitForPreviewAdminLoginReady(page);

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

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
}

module.exports = {
  isTransientLoginPollingError,
  isAuthenticated,
  waitForPreviewAdminLoginReady,
  main,
};

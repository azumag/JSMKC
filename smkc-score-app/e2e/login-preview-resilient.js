/**
 * Resilient variant of login-preview-admin.js for cases where the Chromium
 * page closes mid-OAuth (observed with Playwright 1.59.1 against preview
 * Discord callback). Instead of polling one page that may die, this variant:
 *  - listens for new pages (Discord authorize / callback may navigate)
 *  - watches the persistent-profile Cookies DB directly for next-auth.session-token
 *  - tolerates page closes and keeps waiting for the session cookie
 *  - exits only when the cookie is present or 10 min elapses
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const {
  launchPersistentChromiumContext,
  resolveE2EProfileDir,
} = require('./lib/common');
const {
  buildPreviewRuntimeEnv,
  assertBaseUrlResolvable,
} = require('./run-preview');

function hasNextAuthSessionCookie(profileDir) {
  const db = path.join(profileDir, 'Default', 'Cookies');
  if (!fs.existsSync(db)) return false;
  const sql = "SELECT 1 FROM cookies WHERE name IN ('next-auth.session-token','__Secure-next-auth.session-token') LIMIT 1;";
  const result = spawnSync('sqlite3', [db, sql], { encoding: 'utf8' });
  if (result.status !== 0) return false;
  return result.stdout.trim().length > 0;
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

  const profileDir = resolveE2EProfileDir();
  if (hasNextAuthSessionCookie(profileDir)) {
    console.log(`[preview-login] already has next-auth session cookie in ${profileDir}/Default/Cookies`);
    return;
  }

  const browser = await launchPersistentChromiumContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 900 },
  });

  let contextClosed = false;
  browser.on('close', () => {
    contextClosed = true;
    console.log('[preview-login] browser context closed (will keep watching cookie DB until deadline)');
  });

  try {
    let page = browser.pages()[0];
    if (!page) page = await browser.newPage();
    browser.on('page', (p) => {
      console.log(`[preview-login] new page: ${p.url()}`);
    });
    await page.goto(`${env.E2E_BASE_URL}/auth/signin`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log(`[preview-login] opened ${env.E2E_BASE_URL}/auth/signin`);
    console.log('[preview-login] complete Discord admin login in the opened browser window.');
    console.log('[preview-login] resilient mode: tolerates page closes; watches Cookies DB for session token');

    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      if (hasNextAuthSessionCookie(profileDir)) {
        console.log('[preview-login] next-auth.session-token detected in persistent profile. Login complete.');
        return;
      }
      if (contextClosed) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      try {
        await page.waitForTimeout(2000);
      } catch (err) {
        console.warn(`[preview-login] page wait aborted: ${err && err.message ? err.message : err}`);
      }
    }

    throw new Error('Timed out waiting for next-auth session cookie in persistent profile.');
  } finally {
    if (!contextClosed) {
      await browser.close().catch(() => {});
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
}

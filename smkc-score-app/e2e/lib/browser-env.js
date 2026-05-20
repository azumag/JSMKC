const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_E2E_BROWSER_HOME = path.join(os.tmpdir(), 'playwright-e2e-home');

function resolveE2EBrowserHome() {
  return process.env.E2E_BROWSER_HOME || DEFAULT_E2E_BROWSER_HOME;
}

function resolvePlaywrightBrowsersPath() {
  return process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(resolveE2EBrowserHome(), 'ms-playwright');
}

function createPlaywrightBrowserInstallEnv(env = process.env) {
  const browserHome = env.E2E_BROWSER_HOME || DEFAULT_E2E_BROWSER_HOME;
  const browsersPath = env.PLAYWRIGHT_BROWSERS_PATH || path.join(browserHome, 'ms-playwright');
  fs.mkdirSync(browserHome, { recursive: true });
  fs.mkdirSync(browsersPath, { recursive: true });
  return {
    ...env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    /* Prevent Playwright from garbage-collecting the shared cache between
     * separate automation runs that all rely on the same temp location. */
    PLAYWRIGHT_SKIP_BROWSER_GC: env.PLAYWRIGHT_SKIP_BROWSER_GC || '1',
  };
}

function initializePlaywrightBrowserRuntimeEnv() {
  const env = createPlaywrightBrowserInstallEnv();
  process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_SKIP_BROWSER_GC = env.PLAYWRIGHT_SKIP_BROWSER_GC;
  return env;
}

module.exports = {
  createPlaywrightBrowserInstallEnv,
  initializePlaywrightBrowserRuntimeEnv,
  resolveE2EBrowserHome,
  resolvePlaywrightBrowsersPath,
};

const { chromium } = require('playwright');
const { createBrowserLaunchEnv, installApiLogging, nav } = require('./common');

const DEFAULT_PROFILE_DIR = '/tmp/playwright-smkc-profile';
const DEFAULT_TEST_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_SUITE_TIMEOUT_MS = 35 * 60 * 1000;
const DEFAULT_PROGRESS_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_BROWSER_CLOSE_TIMEOUT_MS = 15 * 1000;
const DEFAULT_FORCE_EXIT_TIMEOUT_MS = 20 * 1000;

function envMs(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${formatDuration(timeoutMs)}`);
      err.code = 'E2E_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function exitAfterCleanup(code, cleanup) {
  const hardExitMs = envMs('E2E_FORCE_EXIT_TIMEOUT_MS', DEFAULT_FORCE_EXIT_TIMEOUT_MS);
  const hardExit = setTimeout(() => process.exit(code), hardExitMs);
  if (hardExit.unref) hardExit.unref();

  Promise.resolve()
    .then(() => (cleanup ? cleanup() : undefined))
    .catch((err) => {
      console.error('[E2E] cleanup before exit failed:', err instanceof Error ? err.message : err);
    })
    .finally(() => {
      clearTimeout(hardExit);
      process.exit(code);
    });
}

function createProgressWatchdog(
  label,
  timeoutMs = envMs('E2E_PROGRESS_TIMEOUT_MS', DEFAULT_PROGRESS_TIMEOUT_MS),
  onTimeout = null,
) {
  let timer = null;
  let lastScope = 'startup';

  const reset = (scope = lastScope) => {
    lastScope = scope;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      console.error(`[${label}] no progress for ${formatDuration(timeoutMs)} after ${lastScope}`);
      exitAfterCleanup(124, onTimeout);
    }, timeoutMs);
    if (timer.unref) timer.unref();
  };

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  reset();
  return { reset, stop };
}

async function closeBrowser(browser) {
  if (!browser) return;
  const timeoutMs = envMs('E2E_BROWSER_CLOSE_TIMEOUT_MS', DEFAULT_BROWSER_CLOSE_TIMEOUT_MS);
  try {
    await withTimeout(browser.close(), timeoutMs, 'browser.close()');
  } catch (err) {
    console.error(`[E2E] failed to close browser cleanly: ${err.message}`);
  }
}

function summarizeResults(suiteName, results) {
  console.log(`\n========== ${suiteName} TEST SUMMARY ==========`);
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  console.log(`PASS: ${passed} | FAIL: ${failed} | SKIP: ${skipped} | Total: ${results.length}`);
  if (failed > 0) {
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => console.log(`  ❌ [${r.tc}] ${r.detail}`));
  }
  return { passed, failed, skipped };
}

function recordFailure(results, log, tc, detail) {
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].tc === tc) {
      results[i].status = 'FAIL';
      results[i].detail = results[i].detail ? `${results[i].detail}; ${detail}` : detail;
      console.log(`❌ [${tc}] FAIL — ${detail}`);
      return;
    }
  }
  log(tc, 'FAIL', detail);
}

function filterTests(tests) {
  const raw = process.env.E2E_TESTS || process.env.E2E_TEST || '';
  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  if (names.length === 0) return tests;

  const selected = new Set(names);
  const filtered = tests.filter((test) => selected.has(test.name));
  if (filtered.length === 0) {
    throw new Error(`No tests matched ${names.join(', ')}`);
  }
  console.log(`[E2E] filtered tests: ${filtered.map((test) => test.name).join(', ')}`);
  return filtered;
}

/**
 * Run a suite using an already-open browser/page. Does NOT launch or close the
 * browser and does NOT call process.exit, so it can be composed by tc-all to
 * run multiple suites back-to-back inside a single Playwright profile session.
 *
 * Returns { failed, summary } where `failed` is true if any test failed or a
 * fatal error was raised.
 */
async function runSuiteInBrowser({
  suiteName,
  page,
  results,
  log,
  tests,
  beforeAll = null,
  afterAll = null,
}) {
  if (!page) throw new Error('runSuiteInBrowser requires an open page');
  const suiteTimeoutMs = envMs('E2E_SUITE_TIMEOUT_MS', DEFAULT_SUITE_TIMEOUT_MS);
  const testTimeoutMs = envMs('E2E_TEST_TIMEOUT_MS', DEFAULT_TEST_TIMEOUT_MS);
  let afterAllRan = false;
  const runAfterAll = async () => {
    if (afterAllRan) return;
    afterAllRan = true;
    if (afterAll) await afterAll(page);
  };

  const progress = createProgressWatchdog(suiteName, undefined, runAfterAll);
  let forcedFailure = false;

  /* Soft timeout: log + break, don't kill the process — the parent
   * orchestrator owns global exit. */
  let softTimeoutFired = false;
  const suiteTimer = setTimeout(() => {
    softTimeoutFired = true;
    console.error(`[${suiteName}] suite timed out after ${formatDuration(suiteTimeoutMs)} — aborting remaining tests`);
  }, suiteTimeoutMs);

  try {
    const runnableTests = filterTests(tests);

    if (beforeAll) {
      progress.reset('beforeAll');
      await beforeAll(page);
    }

    for (const test of runnableTests) {
      if (softTimeoutFired) {
        recordFailure(results, log, test.name, `Skipped — ${suiteName} suite timeout exceeded`);
        forcedFailure = true;
        continue;
      }
      const timeoutMs = test.timeoutMs || testTimeoutMs;
      const started = Date.now();
      progress.reset(test.name);
      console.log(`\n[${suiteName}] Starting ${test.name}`);
      try {
        await withTimeout(test.fn(page), timeoutMs, `${suiteName} ${test.name}`);
        console.log(`[${suiteName}] Finished ${test.name} in ${formatDuration(Date.now() - started)}`);
      } catch (err) {
        forcedFailure = true;
        const detail = err instanceof Error ? err.message : `${test.name} failed`;
        recordFailure(results, log, test.name, detail);
        console.error(`[${suiteName}] Aborting after ${test.name}: ${detail}`);
        break;
      }
    }
  } catch (err) {
    forcedFailure = true;
    console.error(`[${suiteName}] fatal error:`, err instanceof Error ? err.stack || err.message : err);
  } finally {
    clearTimeout(suiteTimer);
    progress.stop();
    await runAfterAll().catch((err) => {
      console.error(`[${suiteName}] afterAll failed:`, err instanceof Error ? err.message : err);
    });
  }
  const summary = summarizeResults(suiteName, results);
  return { failed: forcedFailure || summary.failed > 0, summary };
}

async function runSuite({ suiteName, results, log, tests, beforeAll = null, afterAll = null }) {
  const suiteTimeoutMs = envMs('E2E_SUITE_TIMEOUT_MS', DEFAULT_SUITE_TIMEOUT_MS);
  let browser = null;
  let page = null;

  /* runSuiteInBrowser always invokes afterAll inside its own finally block,
   * so runSuite only needs to own the browser lifecycle + outer hard timeout. */
  const cleanupBrowser = () => closeBrowser(browser);

  let forcedFailure = false;
  const hardSuiteTimer = setTimeout(() => {
    console.error(`[${suiteName}] suite timed out after ${formatDuration(suiteTimeoutMs)}`);
    exitAfterCleanup(124, cleanupBrowser);
  }, suiteTimeoutMs);

  try {
    const profileDir = process.env.E2E_PROFILE_DIR || DEFAULT_PROFILE_DIR;
    const headless = process.env.E2E_HEADLESS === '1';
    browser = await chromium.launchPersistentContext(profileDir, {
      headless,
      viewport: { width: 1280, height: 720 },
    });
    installApiLogging(browser, suiteName);
    page = browser.pages()[0] || await browser.newPage();
    page.setDefaultTimeout(envMs('E2E_ACTION_TIMEOUT_MS', 30 * 1000));
    page.setDefaultNavigationTimeout(envMs('E2E_NAV_TIMEOUT_MS', 30 * 1000));

    await nav(page, '/');

    const { failed } = await runSuiteInBrowser({
      suiteName, page, results, log, tests, beforeAll, afterAll,
    });
    forcedFailure = failed;
  } catch (err) {
    forcedFailure = true;
    console.error(`[${suiteName}] fatal error:`, err instanceof Error ? err.stack || err.message : err);
  } finally {
    clearTimeout(hardSuiteTimer);
    await cleanupBrowser();
    process.exit(forcedFailure ? 1 : 0);
  }
}

module.exports = {
  DEFAULT_PROGRESS_TIMEOUT_MS,
  DEFAULT_TEST_TIMEOUT_MS,
  DEFAULT_SUITE_TIMEOUT_MS,
  closeBrowser,
  createBrowserLaunchEnv,
  createProgressWatchdog,
  envMs,
  exitAfterCleanup,
  formatDuration,
  runSuite,
  runSuiteInBrowser,
  summarizeResults,
  withTimeout,
};

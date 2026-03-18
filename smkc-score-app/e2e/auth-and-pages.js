/**
 * E2E Authentication & Page Verification Test
 *
 * Tests admin/player authentication, page content, TA editing,
 * and error detection on production (https://smkc.bluemoon.works/).
 *
 * Uses Playwright persistent profile for Discord OAuth session reuse.
 * Run from smkc-score-app/ directory:
 *   node e2e/auth-and-pages.js
 *
 * IMPORTANT: Uses page.innerText() instead of page.textContent() to avoid
 * false positives from i18n JSON embedded in <script> tags. innerText()
 * returns only visible, rendered text — textContent() includes hidden
 * script/style content which contains error-like strings from translations.
 *
 * Requires headless: false — innerText() depends on layout computation.
 */
const { chromium } = require('playwright');

const BASE = 'https://smkc.bluemoon.works';
const PROFILE_PATH = '/tmp/playwright-smkc-profile';
/* CLAUDE.md: 8秒以上待ってから判定（fetchWithRetry のリトライ時間を考慮） */
const WAIT_MS = 8000;
const TOURNAMENT_ID = process.env.E2E_TOURNAMENT_ID || 'cmmvbmrr00000o01slo9jy3o8';

const results = [];

function log(test, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'SKIP' ? '⏭️' : '❌';
  console.log(`${icon} ${test}: ${status}${detail ? ' — ' + detail : ''}`);
  results.push({ test, status, detail });
}

/**
 * Get visible text from the page's <main> element.
 * Falls back to document body if <main> is absent.
 *
 * Uses innerText (not textContent) so that:
 * - Hidden elements (display:none, script, style) are excluded
 * - Embedded i18n JSON, CSS values, and JS bundles are NOT matched
 * This prevents false positives like matching "再試行" inside a
 * next-intl translation blob or "500" inside a CSS fontWeight rule.
 */
async function getVisibleText(page) {
  const main = page.locator('main');
  if (await main.count() > 0) {
    return main.innerText();
  }
  return page.locator('body').innerText();
}

/**
 * Navigate and wait for content to settle.
 * Uses domcontentloaded (not networkidle) because usePolling
 * keeps the network perpetually busy on tournament pages.
 */
async function nav(page, url) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(WAIT_MS);
}

/**
 * Check visible text for error patterns that indicate a broken page.
 * Only flags strings that appear in actual rendered UI, not in embedded
 * translation JSON or CSS/JS bundles.
 */
function checkForErrors(visibleText) {
  /* Patterns cover: network errors, ErrorBoundary (EN/JA), HTTP 500.
   * "500" is intentionally omitted — the app never renders the bare number;
   * it shows translated messages instead. innerText excludes CSS fontWeight. */
  const errorPatterns = [
    'Failed to fetch',
    '再試行',
    'Internal Server Error',
    'Error Occurred',            // ErrorBoundary EN
    'エラーが発生しました',       // ErrorBoundary JA
    'データの読み込みに失敗',     // ErrorBoundary JA detail
  ];
  return errorPatterns.filter(pat => visibleText.includes(pat));
}

(async () => {
  const browser = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });
  const page = browser.pages()[0] || await browser.newPage();

  try {
    // ============================================================
    // Test 1: Admin session persistence (via persistent profile)
    // ============================================================
    console.log('\n=== Test 1: Admin Session Persistence ===');
    await nav(page, '/tournaments');

    const headerText = await page.locator('header, nav').first().innerText();
    if (headerText.includes('azumag')) {
      log('Admin session persistence', 'PASS', 'Logged in as azumag without re-auth');
    } else if (headerText.includes('Login') || headerText.includes('ログイン')) {
      log('Admin session persistence', 'FAIL', 'Session not preserved — re-auth needed');

      /* Auto-recover: attempt Discord re-login */
      await page.goto(BASE + '/auth/signin', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await page.getByRole('tab', { name: /Administrator|管理者/ }).click();
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: /Discord/ }).click();
      console.log('  Discord認証画面が開きます。手動認証してください（60秒待機）...');
      try {
        await page.waitForURL('**/tournaments**', { timeout: 60000 });
        console.log('  Re-login successful');
      } catch {
        console.log('  Re-login timed out');
        await browser.close();
        process.exit(1);
      }
    }
    await page.screenshot({ path: '/tmp/e2e-test1-session.png' });

    // ============================================================
    // Test 2: Admin UI elements visible
    // ============================================================
    console.log('\n=== Test 2: Admin UI Elements ===');
    const mainText = await getVisibleText(page);
    const hasCreate = mainText.includes('トーナメント作成') || mainText.includes('Create Tournament');
    const hasDelete = mainText.includes('削除') || mainText.includes('Delete');
    log('Admin UI elements', hasCreate && hasDelete ? 'PASS' : 'FAIL',
      `Create: ${hasCreate}, Delete: ${hasDelete}`);

    // ============================================================
    // Test 3: TA admin edit flow
    // ============================================================
    console.log('\n=== Test 3: TA Admin Edit ===');
    await nav(page, `/tournaments/${TOURNAMENT_ID}/ta`);

    const taText = await getVisibleText(page);
    const hasAddPlayer = taText.includes('プレイヤー追加') || taText.includes('Add Player');
    log('TA admin Add Player button', hasAddPlayer ? 'PASS' : 'FAIL',
      `Add: ${hasAddPlayer}`);

    // Open time entry tab (Edit Times buttons are only on this tab)
    await page.getByRole('tab', { name: /タイム入力|Time Entry/ }).click();
    await page.waitForTimeout(2000);

    const taTimeTabText = await getVisibleText(page);
    const hasEditBtn = taTimeTabText.includes('タイム編集') || taTimeTabText.includes('Edit Times');
    log('TA Edit Times button', hasEditBtn ? 'PASS' : 'FAIL',
      `Edit: ${hasEditBtn}`);

    if (!hasEditBtn) {
      log('TA edit dialog opens', 'SKIP', 'Edit button not found');
      log('TA time save', 'SKIP', 'Edit button not found');
      log('TA time restore', 'SKIP', 'Edit button not found');
    } else {
      await page.getByRole('button', { name: /タイム編集|Edit Times/ }).first().click();
      await page.waitForTimeout(2000);

      const dialogVisible = await getVisibleText(page);
      log('TA edit dialog opens', dialogVisible.includes('M:SS.mmm') ? 'PASS' : 'FAIL');
      await page.screenshot({ path: '/tmp/e2e-test3-dialog.png' });

      // Save a modified time
      const firstInput = page.locator('input[placeholder="M:SS.mmm"]').first();
      const originalValue = await firstInput.inputValue();
      console.log(`  Original value: "${originalValue}"`);

      await firstInput.fill('1:23.456');
      await page.getByRole('button', { name: /タイム保存|Save Times/ }).click();
      await page.waitForTimeout(3000);

      const inputsAfterSave = await page.locator('input[placeholder="M:SS.mmm"]').count();
      const visibleAfterSave = await getVisibleText(page);
      const saveErrors = checkForErrors(visibleAfterSave);
      if (inputsAfterSave === 0 && saveErrors.length === 0) {
        log('TA time save', 'PASS', 'Saved, dialog closed, no errors');
      } else if (saveErrors.length > 0) {
        log('TA time save', 'FAIL', `Errors: ${saveErrors.join(', ')}`);
      } else {
        /* Dialog still open but no error text — likely a timing issue */
        log('TA time save', 'FAIL', 'Dialog did not close after save');
      }
      await page.screenshot({ path: '/tmp/e2e-test3-saved.png' });

      // Restore original value
      if (inputsAfterSave === 0) {
        await page.getByRole('button', { name: /タイム編集|Edit Times/ }).first().click();
        await page.waitForTimeout(2000);
      }
      /* Restore: use nullish coalescing — empty string is a valid "no time" state */
      const restoreValue = originalValue ?? '0:58.490';
      await page.locator('input[placeholder="M:SS.mmm"]').first().fill(restoreValue);
      await page.getByRole('button', { name: /タイム保存|Save Times/ }).click();
      await page.waitForTimeout(3000);

      const restoreInputs = await page.locator('input[placeholder="M:SS.mmm"]').count();
      const restoreVisible = await getVisibleText(page);
      const restoreErrors = checkForErrors(restoreVisible);
      if (restoreInputs === 0 && restoreErrors.length === 0) {
        log('TA time restore', 'PASS', `Restored to "${restoreValue}"`);
      } else {
        log('TA time restore', 'FAIL', `Restore failed — errors: ${restoreErrors.join(', ')}`);
      }
    }

    // ============================================================
    // Test 4: Logout
    // ============================================================
    console.log('\n=== Test 4: Logout ===');
    await nav(page, '/tournaments');
    await page.getByRole('button', { name: /ログアウト|Sign Out/ }).click();
    await page.waitForTimeout(5000);

    const afterLogoutHeader = await page.locator('header, nav').first().innerText();
    const loggedOut = afterLogoutHeader.includes('ログイン') || afterLogoutHeader.includes('Login');
    const noAdminInHeader = !afterLogoutHeader.includes('azumag');
    log('Logout', loggedOut && noAdminInHeader ? 'PASS' : 'FAIL',
      `LoginLink: ${loggedOut}, NoUser: ${noAdminInHeader}`);
    await page.screenshot({ path: '/tmp/e2e-test4-logout.png' });

    // ============================================================
    // Test 5: Re-login via Discord (persistent profile)
    // ============================================================
    console.log('\n=== Test 5: Re-login via Discord ===');
    await page.goto(BASE + '/auth/signin', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.getByRole('tab', { name: /Administrator|管理者/ }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Discord/ }).click();
    await page.waitForTimeout(10000);

    const reUrl = page.url();
    const reHeader = await page.locator('header, nav').first().innerText();
    if (reUrl.includes('discord.com')) {
      log('Re-login via Discord', 'FAIL', 'Stuck at Discord OAuth — persistent session expired');
    } else if (reHeader.includes('azumag')) {
      log('Re-login via Discord', 'PASS', 'Auto re-authenticated via persistent profile');
    } else if (reUrl.includes('smkc.bluemoon.works') && !reUrl.includes('signin')) {
      const hasUser = reHeader.includes('azumag');
      log('Re-login via Discord', hasUser ? 'PASS' : 'FAIL',
        hasUser ? 'Redirected and logged in' : 'Redirected but not logged in at ' + reUrl);
    } else {
      log('Re-login via Discord', 'FAIL', 'Unexpected state at ' + reUrl);
    }
    await page.screenshot({ path: '/tmp/e2e-test5-relogin.png' });

    // ============================================================
    // Test 6: Page error checks (visible text only)
    // Requires admin login — skip if re-login failed
    // ============================================================
    console.log('\n=== Test 6: Page Error Checks ===');
    const reCheckHeader = await page.locator('header, nav').first().innerText();
    if (!reCheckHeader.includes('azumag')) {
      log('Page error checks', 'SKIP', 'Not logged in as admin');
    } else {
      const pagesToCheck = [
        { url: `/tournaments/${TOURNAMENT_ID}/ta`, name: 'TA' },
        { url: `/tournaments/${TOURNAMENT_ID}/bm`, name: 'BM' },
        { url: `/tournaments/${TOURNAMENT_ID}/mr`, name: 'MR' },
        { url: `/tournaments/${TOURNAMENT_ID}/gp`, name: 'GP' },
        { url: `/tournaments/${TOURNAMENT_ID}/overall-ranking`, name: 'Overall' },
        { url: `/tournaments/${TOURNAMENT_ID}/bm/finals`, name: 'BM Finals' },
      ];
      for (const p of pagesToCheck) {
        await nav(page, p.url);
        const visible = await getVisibleText(page);
        const errors = checkForErrors(visible);
        log(`${p.name} page`, errors.length === 0 ? 'PASS' : 'FAIL',
          errors.length === 0 ? 'No errors' : `Errors: ${errors.join(', ')}`);
      }
    }

  } finally {
    // ============================================================
    // Summary
    // ============================================================
    console.log('\n========== SUMMARY ==========');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const skipped = results.filter(r => r.status === 'SKIP').length;
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
    if (failed > 0) {
      console.log('\nFailed:');
      results.filter(r => r.status === 'FAIL').forEach(r =>
        console.log(`  ❌ ${r.test}: ${r.detail}`));
    }
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();

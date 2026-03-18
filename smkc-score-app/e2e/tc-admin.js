/**
 * E2E Admin TCs (auth required)
 * TC-101〜104, TC-201, TC-305, TC-309
 *
 * Requires admin login via Playwright persistent profile.
 * Run: node e2e/tc-admin.js
 */
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE_URL || 'https://smkc.bluemoon.works';
const TID = process.env.E2E_TOURNAMENT_ID || 'cmmvbmrr00000o01slo9jy3o8';
const WAIT = 8000;
const results = [];

function log(tc, s, d = '') {
  console.log(`${s === 'PASS' ? '✅' : s === 'SKIP' ? '⏭️' : '❌'} [${tc}] ${s}${d ? ' — ' + d : ''}`);
  results.push({ tc, s, d });
}
async function vis(p) {
  const m = p.locator('main');
  return (await m.count() > 0) ? m.innerText() : p.locator('body').innerText();
}
async function nav(p, u) {
  await p.goto(BASE + u, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await p.waitForTimeout(WAIT);
}

(async () => {
  const browser = await chromium.launchPersistentContext(
    '/tmp/playwright-smkc-profile',
    { headless: false, viewport: { width: 1280, height: 720 } }
  );
  const page = browser.pages()[0] || await browser.newPage();

  // Verify admin session
  await page.goto(BASE + '/tournaments', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  let hdr = '';
  try { hdr = await page.locator('header, nav').first().innerText({ timeout: 10000 }); } catch {}

  if (!hdr.includes('azumag')) {
    /* Auto-recover: attempt Discord re-login */
    console.log('Not logged in. Attempting Discord re-login...');
    await page.goto(BASE + '/auth/signin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.getByRole('tab', { name: /Administrator|管理者/ }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Discord/ }).click();
    console.log('Discord認証画面が開きます。手動認証してください（60秒待機）...');
    try {
      await page.waitForURL('**/tournaments*', { timeout: 60000 });
    } catch {
      const url = page.url();
      if (!url.includes('smkc.bluemoon.works') || url.includes('signin')) {
        console.log('❌ Admin login failed. Run this script after manual Discord auth.');
        await browser.close();
        process.exit(1);
      }
    }
    await page.waitForTimeout(3000);
    hdr = await page.locator('header, nav').first().innerText({ timeout: 10000 }).catch(() => '');
    if (!hdr.includes('azumag')) {
      console.log('❌ Still not logged in. Aborting.');
      await browser.close();
      process.exit(1);
    }
  }
  log('AUTH', 'PASS', 'Logged in as azumag');

  // TC-201: Mode data loading
  let tc201 = true;
  for (const m of ['ta', 'bm', 'mr', 'gp']) {
    await nav(page, `/tournaments/${TID}/${m}`);
    const t = await vis(page);
    if (['Failed to fetch', 'エラーが発生しました', '再試行'].some(e => t.includes(e))) tc201 = false;
    if (!t.includes('KasmoSMKC')) tc201 = false;
  }
  log('TC-201', tc201 ? 'PASS' : 'FAIL');

  // TC-101: Player add
  const nick = `e2e_tc_${Date.now()}`;
  const cr = await page.evaluate(async d => {
    const r = await fetch('/api/players', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json() };
  }, { name: 'E2E Test', nickname: nick, country: 'JP' });
  const pid = cr.b?.data?.player?.id;
  log('TC-101', cr.s === 201 && cr.b?.data?.temporaryPassword ? 'PASS' : 'FAIL');

  // TC-102: Player edit
  if (pid) {
    const ed = await page.evaluate(async ([u, n]) => {
      const r = await fetch(u, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'E2E Edited', nickname: n }),
      });
      return { ok: r.ok };
    }, [`/api/players/${pid}`, nick]);
    log('TC-102', ed.ok ? 'PASS' : 'FAIL');
  } else { log('TC-102', 'SKIP'); }

  // TC-103: Password reset
  if (pid) {
    const pr = await page.evaluate(async u => {
      const r = await fetch(u, { method: 'POST' });
      return r.json();
    }, `/api/players/${pid}/reset-password`);
    log('TC-103', pr.data?.temporaryPassword ? 'PASS' : 'FAIL');
  } else { log('TC-103', 'SKIP'); }

  // TC-309: Password reset API format
  if (pid) {
    const pr2 = await page.evaluate(async u => {
      const r = await fetch(u, { method: 'POST' });
      return r.json();
    }, `/api/players/${pid}/reset-password`);
    log('TC-309', pr2.success === true && pr2.data?.temporaryPassword ? 'PASS' : 'FAIL');
  } else { log('TC-309', 'SKIP'); }

  // TC-104: Player delete
  if (pid) {
    const dr = await page.evaluate(async u => {
      const r = await fetch(u, { method: 'DELETE' });
      return { ok: r.ok };
    }, `/api/players/${pid}`);
    log('TC-104', dr.ok ? 'PASS' : 'FAIL');
  } else { log('TC-104', 'SKIP'); }

  // TC-305: BM group dialog
  await nav(page, `/tournaments/${TID}/bm`);
  const editBtn = page.getByRole('button', { name: /グループ編集|Edit Groups/ });
  if (await editBtn.count() > 0) {
    await editBtn.click();
    await page.waitForTimeout(2000);
    const saveBtn = page.getByRole('button', { name: /グループ更新|Update Groups/ });
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(5000);
      log('TC-305', (await page.locator('[role="dialog"]').count()) === 0 ? 'PASS' : 'FAIL');
    } else { log('TC-305', 'SKIP', 'No update button'); }
  } else { log('TC-305', 'SKIP', 'No edit button'); }

  // Summary
  console.log('\n========== ADMIN TCs ==========');
  const p = results.filter(r => r.s === 'PASS').length;
  const f = results.filter(r => r.s === 'FAIL').length;
  const sk = results.filter(r => r.s === 'SKIP').length;
  console.log(`PASS: ${p} | FAIL: ${f} | SKIP: ${sk} | Total: ${results.length}`);
  if (f > 0) results.filter(r => r.s === 'FAIL').forEach(r => console.log(`  ❌ [${r.tc}] ${r.d}`));

  await browser.close();
  process.exit(f > 0 ? 1 : 0);
})();

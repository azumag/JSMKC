/**
 * E2E All TCs — runs with persistent profile session (no login/logout)
 *
 * Uses Playwright persistent profile at /tmp/playwright-smkc-profile.
 * Admin session must already exist in the profile (Discord OAuth).
 * No login/logout is performed during tests — session is preserved.
 *
 * Run: node e2e/tc-all.js  (from smkc-score-app/)
 */
const { chromium } = require('playwright');
const https = require('https');

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

  // ===== Public page tests (work regardless of login state) =====

  // TC-001
  await nav(page, '/');
  let t = await vis(page);
  log('TC-001', t.includes('SMKC') && (t.includes('Players') || t.includes('プレイヤー')) ? 'PASS' : 'FAIL');

  // TC-002
  await nav(page, '/players');
  t = await vis(page);
  log('TC-002', (t.toLowerCase().includes('player') || t.includes('プレイヤー')) ? 'PASS' : 'FAIL');

  // TC-003
  await nav(page, '/tournaments');
  t = await vis(page);
  log('TC-003', (t.toLowerCase().includes('tournament') || t.includes('トーナメント')) ? 'PASS' : 'FAIL');

  // TC-004
  await nav(page, `/tournaments/${TID}/ta`);
  t = await vis(page);
  log('TC-004', (t.includes('Time Trial') || t.includes('タイムトライアル')) ? 'PASS' : 'FAIL');

  // TC-005
  let tc005 = true;
  for (const m of ['bm', 'mr', 'gp']) {
    await nav(page, `/tournaments/${TID}/${m}`);
    t = await vis(page);
    if (['Failed to fetch', 'エラーが発生しました'].some(e => t.includes(e))) tc005 = false;
  }
  log('TC-005', tc005 ? 'PASS' : 'FAIL');

  // TC-006
  await nav(page, '/');
  const sw = page.locator('button[role="switch"]');
  if (await sw.count() > 0) {
    await sw.click(); await page.waitForTimeout(2000);
    const s = await vis(page);
    await sw.click(); await page.waitForTimeout(1000);
    log('TC-006', (s.includes('スコア') || s.includes('Score')) ? 'PASS' : 'FAIL');
  }

  // TC-007: signin page elements (just check page renders, no login/logout)
  await nav(page, '/auth/signin');
  t = await vis(page);
  const hasPlayerTab = t.includes('Player') || t.includes('プレイヤー');
  log('TC-007', hasPlayerTab ? 'PASS' : 'FAIL');

  // TC-008
  await nav(page, `/tournaments/${TID}/overall-ranking`);
  t = await vis(page);
  log('TC-008', (t.includes('Overall') || t.includes('総合')) ? 'PASS' : 'FAIL');

  // TC-009
  log('TC-009', BASE.startsWith('https') ? 'PASS' : 'FAIL');

  // TC-010
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  await nav(page, '/'); await nav(page, '/players'); await nav(page, '/tournaments');
  log('TC-010', jsErrors.length === 0 ? 'PASS' : 'FAIL', jsErrors.length > 0 ? jsErrors[0] : '');

  // TC-011
  await page.setViewportSize({ width: 375, height: 667 });
  await nav(page, '/');
  t = await vis(page);
  log('TC-011', t.includes('SMKC') ? 'PASS' : 'FAIL');
  await page.setViewportSize({ width: 1280, height: 720 });

  // TC-012
  await nav(page, '/');
  await page.locator('a[href="/players"]').first().click();
  await page.waitForTimeout(3000);
  const onP = page.url().includes('/players');
  await page.locator('a[href="/tournaments"]').first().click();
  await page.waitForTimeout(3000);
  log('TC-012', onP && page.url().includes('/tournaments') ? 'PASS' : 'FAIL');

  // ===== Security tests (no browser session needed — use https/curl) =====

  // TC-105
  const hdrs = await new Promise(r => {
    https.get(BASE + '/', res => { r(res.headers); res.resume(); }).on('error', () => r({}));
  });
  const miss = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy']
    .filter(h => !hdrs[h]);
  log('TC-105', miss.length === 0 ? 'PASS' : 'FAIL', miss.length > 0 ? 'Missing: ' + miss.join(',') : '');

  // TC-106: password leak (check API response text)
  const pTxt = await page.evaluate(async () => (await fetch('/api/players')).text());
  log('TC-106', !pTxt.includes('"password"') && !pTxt.includes('$2b$') ? 'PASS' : 'FAIL');

  // TC-107: Forbidden consistency (unauthenticated curl — not browser session)
  let tc107 = true;
  for (const ep of ['bm/standings', 'mr/standings', 'gp/standings', 'ta/standings']) {
    const status = await new Promise(r => {
      https.get(`${BASE}/api/tournaments/${TID}/${ep}`, res => { r(res.statusCode); res.resume(); })
        .on('error', () => r(0));
    });
    if (status !== 403) tc107 = false;
  }
  log('TC-107', tc107 ? 'PASS' : 'FAIL');

  // TC-308: Players API format
  const api = await page.evaluate(async () => (await fetch('/api/players')).json());
  log('TC-308', api.success === true && Array.isArray(api.data) && api.meta ? 'PASS' : 'FAIL');

  // ===== Admin tests (use existing session from persistent profile) =====

  // TC-201: Mode data loading
  let tc201 = true;
  for (const m of ['ta', 'bm', 'mr', 'gp']) {
    await nav(page, `/tournaments/${TID}/${m}`);
    t = await vis(page);
    if (['Failed to fetch', 'エラーが発生しました', '再試行'].some(e => t.includes(e))) tc201 = false;
    if (!t.includes('KasmoSMKC')) tc201 = false;
  }
  log('TC-201', tc201 ? 'PASS' : 'FAIL');

  // TC-202
  await nav(page, '/tournaments');
  t = await vis(page);
  log('TC-202', t.includes('KasmoSMKC') ? 'PASS' : 'FAIL');

  // TC-203
  await nav(page, `/tournaments/${TID}/overall-ranking`);
  t = await vis(page);
  log('TC-203', (t.includes('Overall') || t.includes('総合')) ? 'PASS' : 'FAIL');

  // TC-101: Player add (via API, cleanup after)
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

  // TC-304: Viewer empty group message (check via unauthenticated curl)
  const mrBody = await new Promise(r => {
    let data = '';
    https.get(`${BASE}/tournaments/${TID}/mr`, res => {
      res.on('data', d => data += d);
      res.on('end', () => r(data));
    }).on('error', () => r(''));
  });
  log('TC-304', (mrBody.includes('Please wait') || mrBody.includes('セットアップが完了するまで')) ? 'PASS' : 'FAIL');

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

  // TC-307: Score entry links
  let tc307 = true;
  for (const m of ['bm', 'mr', 'gp']) {
    await nav(page, `/tournaments/${TID}/${m}`);
    if (await page.locator('a[href*="participant"]').count() === 0) tc307 = false;
  }
  log('TC-307', tc307 ? 'PASS' : 'FAIL');

  // TC-401: MR group setup + standings verification
  await nav(page, `/tournaments/${TID}/mr`);
  t = await vis(page);
  const mrHasGroups = t.includes('Group A') || t.includes('グループ A');
  const mrHasStandings = mrHasGroups && (t.includes('MP') || t.includes('試合数'));
  log('TC-401', mrHasGroups && mrHasStandings ? 'PASS' : 'FAIL',
    !mrHasGroups ? 'No groups' : !mrHasStandings ? 'No standings' : '');

  // TC-402: GP group setup + standings verification
  await nav(page, `/tournaments/${TID}/gp`);
  t = await vis(page);
  const gpHasGroups = t.includes('Group A') || t.includes('グループ A');
  const gpHasStandings = gpHasGroups && (t.includes('MP') || t.includes('試合数'));
  log('TC-402', gpHasGroups && gpHasStandings ? 'PASS' : 'FAIL',
    !gpHasGroups ? 'No groups' : !gpHasStandings ? 'No standings' : '');

  // ===== Summary =====
  console.log('\n========== SUMMARY ==========');
  const p = results.filter(r => r.s === 'PASS').length;
  const f = results.filter(r => r.s === 'FAIL').length;
  const sk = results.filter(r => r.s === 'SKIP').length;
  console.log(`PASS: ${p} | FAIL: ${f} | SKIP: ${sk} | Total: ${results.length}`);
  if (f > 0) results.filter(r => r.s === 'FAIL').forEach(r => console.log(`  ❌ [${r.tc}] ${r.d}`));

  await browser.close();
  process.exit(f > 0 ? 1 : 0);
})();

/**
 * E2E All TCs — runs with persistent profile session (no login/logout)
 *
 * Uses Playwright persistent profile at /tmp/playwright-smkc-profile.
 * Admin session must already exist in the profile (Discord OAuth).
 * No login/logout is performed during tests — session is preserved.
 * Player login coverage uses a separate ephemeral browser so the admin profile stays untouched.
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
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await p.goto(BASE + u, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForTimeout(WAIT);
      return;
    } catch (err) {
      lastError = err;
      if (attempt === 2) throw err;
      await p.waitForTimeout(3000);
    }
  }
  throw lastError;
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
  let playerTempPassword = cr.b?.data?.temporaryPassword ?? null;
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
    if (pr.data?.temporaryPassword) playerTempPassword = pr.data.temporaryPassword;
    log('TC-103', pr.data?.temporaryPassword ? 'PASS' : 'FAIL');
  } else { log('TC-103', 'SKIP'); }

  // TC-309: Password reset API format
  if (pid) {
    const pr2 = await page.evaluate(async u => {
      const r = await fetch(u, { method: 'POST' });
      return r.json();
    }, `/api/players/${pid}/reset-password`);
    if (pr2.data?.temporaryPassword) playerTempPassword = pr2.data.temporaryPassword;
    log('TC-309', pr2.success === true && pr2.data?.temporaryPassword ? 'PASS' : 'FAIL');
  } else { log('TC-309', 'SKIP'); }

  // TC-310: Player credentials login + GP participant entry flow
  if (pid && playerTempPassword) {
    let playerBrowser = null;
    try {
      playerBrowser = await chromium.launch({ headless: false });
      const playerContext = await playerBrowser.newContext({ viewport: { width: 1280, height: 720 } });
      const playerPage = await playerContext.newPage();

      await nav(playerPage, '/auth/signin');
      await playerPage.locator('#nickname').fill(nick);
      await playerPage.locator('#password').fill(playerTempPassword);
      await playerPage.getByRole('button', { name: /ログイン|Login/ }).click();
      await playerPage.waitForURL((url) => url.pathname === '/tournaments', { timeout: 15000 });
      await playerPage.waitForTimeout(2000);

      await nav(playerPage, `/tournaments/${TID}/gp`);
      const participantLink = playerPage.locator(`a[href="/tournaments/${TID}/gp/participant"]`).first();
      const hasParticipantLink = await participantLink.count() > 0;
      if (hasParticipantLink) {
        await participantLink.click();
        await playerPage.waitForURL((url) => url.pathname === `/tournaments/${TID}/gp/participant`, { timeout: 15000 });
        await playerPage.waitForTimeout(WAIT);
      }

      const playerText = await vis(playerPage);
      const hasLoggedInState =
        playerText.includes('プレイヤーとしてログイン中') ||
        playerText.includes('Logged in as player');
      const hasParticipantEmptyState =
        playerText.includes('保留中の試合はありません') ||
        playerText.includes('No Pending Matches');
      const showsLoginPrompt =
        playerText.includes('プレイヤーログインが必要です') ||
        playerText.includes('Player Login Required');

      log(
        'TC-310',
        hasParticipantLink && hasLoggedInState && hasParticipantEmptyState && !showsLoginPrompt ? 'PASS' : 'FAIL',
        !hasParticipantLink ? 'No GP participant link' : showsLoginPrompt ? 'Still showed login prompt' : ''
      );
      await playerBrowser.close();
    } catch (err) {
      log('TC-310', 'FAIL', err instanceof Error ? err.message : 'Player flow failed');
      if (playerBrowser) await playerBrowser.close().catch(() => {});
    }
  } else { log('TC-310', 'SKIP'); }

  // TC-311: Player can submit a real GP participant report end-to-end
  if (pid && playerTempPassword) {
    let playerBrowser = null;
    let gpTournamentId = null;
    let gpPlayer2Id = null;
    try {
      const gpPlayer2Nick = `e2e_gp2_${Date.now()}`;
      const gpPlayer2 = await page.evaluate(async d => {
        const r = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json() };
      }, { name: 'E2E GP Opponent', nickname: gpPlayer2Nick, country: 'JP' });
      gpPlayer2Id = gpPlayer2.b?.data?.player?.id ?? null;
      if (gpPlayer2.s !== 201 || !gpPlayer2Id) {
        throw new Error('Failed to create GP opponent player');
      }

      const gpTournament = await page.evaluate(async d => {
        const r = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json() };
      }, {
        name: `E2E GP Score Entry ${Date.now()}`,
        date: new Date().toISOString(),
        dualReportEnabled: false,
      });
      gpTournamentId = gpTournament.b?.data?.id ?? null;
      if (gpTournament.s !== 201 || !gpTournamentId) {
        throw new Error('Failed to create GP tournament');
      }

      const activateTournament = await page.evaluate(async ([u, d]) => {
        const r = await fetch(u, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { ok: r.ok, s: r.status };
      }, [`/api/tournaments/${gpTournamentId}`, { status: 'active' }]);
      if (!activateTournament.ok) {
        throw new Error(`Failed to activate GP tournament (${activateTournament.s})`);
      }

      const gpSetup = await page.evaluate(async ([u, d]) => {
        const r = await fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, [
        `/api/tournaments/${gpTournamentId}/gp`,
        {
          players: [
            { playerId: pid, group: 'A', seeding: 1 },
            { playerId: gpPlayer2Id, group: 'A', seeding: 2 },
          ],
        },
      ]);
      if (gpSetup.s !== 201) {
        throw new Error(`Failed to setup GP qualification (${gpSetup.s})`);
      }

      playerBrowser = await chromium.launch({ headless: false });
      const playerContext = await playerBrowser.newContext({ viewport: { width: 1280, height: 720 } });
      const playerPage = await playerContext.newPage();

      await nav(playerPage, '/auth/signin');
      await playerPage.locator('#nickname').fill(nick);
      await playerPage.locator('#password').fill(playerTempPassword);
      await playerPage.getByRole('button', { name: /ログイン|Login/ }).click();
      await playerPage.waitForURL((url) => url.pathname === '/tournaments', { timeout: 15000 });
      await playerPage.waitForTimeout(2000);

      await nav(playerPage, `/tournaments/${gpTournamentId}/gp/participant`);
      for (let i = 0; i < 5; i++) {
        await playerPage.getByRole('button', { name: /レース追加|Add Race/ }).click();
        await playerPage.waitForTimeout(250);
      }

      const courseComboboxes = playerPage.locator('[role="combobox"]');
      if (await courseComboboxes.count() < 5) {
        throw new Error(`Expected 5 course selectors, got ${await courseComboboxes.count()}`);
      }
      for (let i = 0; i < 5; i++) {
        await courseComboboxes.nth(i).click();
        await playerPage.waitForTimeout(300);
        const option = playerPage.locator('[role="option"]').nth(i);
        if (await option.count() === 0) {
          throw new Error(`Missing course option ${i + 1}`);
        }
        await option.click();
        await playerPage.waitForTimeout(300);
      }

      const numberInputs = playerPage.locator('input[type="number"]');
      if (await numberInputs.count() < 10) {
        throw new Error(`Expected 10 numeric inputs, got ${await numberInputs.count()}`);
      }
      for (let i = 0; i < 5; i++) {
        await numberInputs.nth(i * 2).fill('1');
        await numberInputs.nth(i * 2 + 1).fill('8');
      }

      playerPage.once('dialog', async (dialog) => {
        await dialog.accept();
      });
      await playerPage.getByRole('button', { name: /試合結果を送信|Submit Match Result/ }).click();
      await playerPage.waitForFunction(() => {
        const text = document.body.innerText;
        return text.includes('保留中の試合はありません') || text.includes('No Pending Matches');
      }, null, { timeout: 15000 });

      const gpState = await page.evaluate(async (u) => {
        const r = await fetch(u);
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, `/api/tournaments/${gpTournamentId}/gp`);
      const gpMatches = gpState.b?.data?.matches ?? gpState.b?.matches ?? [];
      const reportedMatch = gpMatches.find((m) =>
        !m.isBye &&
        ((m.player1?.id === pid && m.player2?.id === gpPlayer2Id) ||
          (m.player1?.id === gpPlayer2Id && m.player2?.id === pid))
      );
      const playerWonAsP1 = reportedMatch?.player1?.id === pid;
      const scorePersisted = reportedMatch?.completed === true &&
        ((playerWonAsP1 && reportedMatch.points1 === 45 && reportedMatch.points2 === 0) ||
          (!playerWonAsP1 && reportedMatch.points1 === 0 && reportedMatch.points2 === 45));

      log('TC-311', scorePersisted ? 'PASS' : 'FAIL', scorePersisted ? '' : 'GP participant report was not persisted');
      await playerBrowser.close();
      playerBrowser = null;
    } catch (err) {
      log('TC-311', 'FAIL', err instanceof Error ? err.message : 'GP participant score flow failed');
      if (playerBrowser) await playerBrowser.close().catch(() => {});
    } finally {
      if (gpTournamentId) {
        await page.evaluate(async (u) => {
          await fetch(u, { method: 'DELETE' });
        }, `/api/tournaments/${gpTournamentId}`).catch(() => {});
      }
      if (gpPlayer2Id) {
        await page.evaluate(async (u) => {
          await fetch(u, { method: 'DELETE' });
        }, `/api/players/${gpPlayer2Id}`).catch(() => {});
      }
    }
  } else { log('TC-311', 'SKIP'); }

  // TC-312: TA participant cannot edit qualification times after knockout starts
  if (pid && playerTempPassword) {
    let playerBrowser = null;
    let taTournamentId = null;
    try {
      const taTournament = await page.evaluate(async d => {
        const r = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json() };
      }, {
        name: `E2E TA Knockout Lock ${Date.now()}`,
        date: new Date().toISOString(),
        dualReportEnabled: false,
      });
      taTournamentId = taTournament.b?.data?.id ?? null;
      if (taTournament.s !== 201 || !taTournamentId) {
        throw new Error('Failed to create TA tournament');
      }

      const activateTournament = await page.evaluate(async ([u, d]) => {
        const r = await fetch(u, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { ok: r.ok, s: r.status };
      }, [`/api/tournaments/${taTournamentId}`, { status: 'active' }]);
      if (!activateTournament.ok) {
        throw new Error(`Failed to activate TA tournament (${activateTournament.s})`);
      }

      const addTaEntry = await page.evaluate(async ([u, d]) => {
        const r = await fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, [`/api/tournaments/${taTournamentId}/ta`, { playerId: pid }]);
      const taEntryId = addTaEntry.b?.data?.entries?.[0]?.id ?? null;
      if (addTaEntry.s !== 201 || !taEntryId) {
        throw new Error(`Failed to create TA qualification entry (${addTaEntry.s})`);
      }

      const getEntry = await page.evaluate(async (u) => {
        const r = await fetch(u);
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, `/api/tournaments/${taTournamentId}/tt/entries/${taEntryId}`);
      const version = getEntry.b?.data?.version;
      if (getEntry.s !== 200 || typeof version !== 'number') {
        throw new Error(`Failed to fetch TT entry version (${getEntry.s})`);
      }

      const seedQualification = await page.evaluate(async ([u, d]) => {
        const r = await fetch(u, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, [
        `/api/tournaments/${taTournamentId}/tt/entries/${taEntryId}`,
        {
          version,
          times: { MC1: '1:00.00' },
          totalTime: 60000,
          rank: 17,
        },
      ]);
      if (seedQualification.s !== 200) {
        throw new Error(`Failed to seed qualification entry (${seedQualification.s})`);
      }

      const promotePhase1 = await page.evaluate(async ([u, d]) => {
        const r = await fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, [`/api/tournaments/${taTournamentId}/ta/phases`, { action: 'promote_phase1' }]);
      if (promotePhase1.s !== 200) {
        throw new Error(`Failed to promote Phase 1 (${promotePhase1.s})`);
      }

      playerBrowser = await chromium.launch({ headless: false });
      const playerContext = await playerBrowser.newContext({ viewport: { width: 1280, height: 720 } });
      const playerPage = await playerContext.newPage();

      await nav(playerPage, '/auth/signin');
      await playerPage.locator('#nickname').fill(nick);
      await playerPage.locator('#password').fill(playerTempPassword);
      await playerPage.getByRole('button', { name: /ログイン|Login/ }).click();
      await playerPage.waitForURL((url) => url.pathname === '/tournaments', { timeout: 15000 });
      await playerPage.waitForTimeout(2000);

      await nav(playerPage, `/tournaments/${taTournamentId}/ta/participant`);
      const playerText = await vis(playerPage);
      const warningVisible =
        playerText.includes('ノックアウトステージ開始後は、予選タイムの修正は管理者のみ可能です。') ||
        playerText.includes('After the knockout stage starts, only admins can edit qualification times.');
      const submitButton = playerPage.getByRole('button', { name: /タイム送信|Submit Times/ });
      const submitDisabled = await submitButton.isDisabled().catch(() => false);
      const firstTimeInput = playerPage.locator('input[placeholder="M:SS.mm"]').first();
      const inputDisabled = await firstTimeInput.isDisabled().catch(() => false);

      log('TC-312', warningVisible && submitDisabled && inputDisabled ? 'PASS' : 'FAIL',
        !warningVisible ? 'No knockout lock warning' : !submitDisabled ? 'Submit button still enabled' : !inputDisabled ? 'Time input still enabled' : '');
      await playerBrowser.close();
      playerBrowser = null;
    } catch (err) {
      log('TC-312', 'FAIL', err instanceof Error ? err.message : 'TA knockout lock flow failed');
      if (playerBrowser) await playerBrowser.close().catch(() => {});
    } finally {
      if (taTournamentId) {
        await page.evaluate(async (u) => {
          await fetch(u, { method: 'DELETE' });
        }, `/api/tournaments/${taTournamentId}`).catch(() => {});
      }
    }
  } else { log('TC-312', 'SKIP'); }

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

  // TC-403: GP admin dialog exposes manual total-score correction
  await nav(page, `/tournaments/${TID}/gp`);
  const gpMatchesTab = page.getByRole('tab', { name: /試合|Matches/ });
  if (await gpMatchesTab.count() > 0) {
    await gpMatchesTab.click();
    await page.waitForTimeout(1000);
  }
  const gpEditButtons = page.locator('tbody button').filter({ hasText: /編集|Edit/ });
  const gpEnterButtons = page.locator('tbody button').filter({ hasText: /結果入力|Enter Result/ });
  const gpActionBtn = await gpEditButtons.count() > 0 ? gpEditButtons.first() : gpEnterButtons.first();
  if (await gpActionBtn.count() > 0) {
    await gpActionBtn.click();
    await page.waitForTimeout(2000);
    const dialogText = await page.locator('[role="dialog"]').last().innerText();
    const hasManualScoreUi =
      dialogText.includes('合計ポイントを手動修正') ||
      dialogText.includes('Manual Total Score');
    log('TC-403', hasManualScoreUi ? 'PASS' : 'FAIL');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  } else {
    log('TC-403', 'SKIP', 'No GP edit button');
  }

  // TC-404: GP admin dialog allows 8th-place input
  await nav(page, `/tournaments/${TID}/gp`);
  if (await gpMatchesTab.count() > 0) {
    await gpMatchesTab.click();
    await page.waitForTimeout(1000);
  }
  const gpActionBtnForPosition = await gpEditButtons.count() > 0 ? gpEditButtons.first() : gpEnterButtons.first();
  if (await gpActionBtnForPosition.count() > 0) {
    await gpActionBtnForPosition.click();
    await page.waitForTimeout(2000);
    const dialog = page.locator('[role="dialog"]').last();
    if (await dialog.locator('[role="combobox"]').count() < 3) {
      const cupSelect = dialog.locator('[role="combobox"]').first();
      if (await cupSelect.count() > 0) {
        await cupSelect.click();
        await page.waitForTimeout(1000);
        const firstCupOption = page.locator('[role="option"]').first();
        if (await firstCupOption.count() > 0) {
          await firstCupOption.click();
          await page.waitForTimeout(1000);
        }
      }
    }
    const positionSelect = dialog.locator('[role="combobox"]').nth(2);
    if (await positionSelect.count() > 0) {
      await positionSelect.click();
      await page.waitForTimeout(1000);
      const hasEighthOption = await page.locator('[role="option"]').filter({ hasText: /8位|8th/ }).count();
      log('TC-404', hasEighthOption > 0 ? 'PASS' : 'FAIL');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    } else {
      log('TC-404', 'SKIP', 'No GP position select');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  } else {
    log('TC-404', 'SKIP', 'No GP result button');
  }

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

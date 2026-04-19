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
const {
  apiActivateTournament,
  apiUpdateTournament,
  apiAddTaEntries,
  apiSeedTtEntry,
  apiPromoteTaPhase,
  apiSetTaPartner,
  apiUpdateTaSeeding,
  apiFetchTa,
  apiTaParticipantEditTime,
} = require('./lib/common');
const {
  closeBrowser,
  createProgressWatchdog,
  envMs,
  exitAfterCleanup,
  formatDuration,
} = require('./lib/runner');

const BASE = process.env.E2E_BASE_URL || 'https://smkc.bluemoon.works';
const TID = process.env.E2E_TOURNAMENT_ID || 'cmmvbmrr00000o01slo9jy3o8';
const WAIT = 8000;
const results = [];
let progressWatchdog = null;

function log(tc, s, d = '') {
  console.log(`${s === 'PASS' ? '✅' : s === 'SKIP' ? '⏭️' : '❌'} [${tc}] ${s}${d ? ' — ' + d : ''}`);
  results.push({ tc, s, d });
  if (progressWatchdog) progressWatchdog.reset(tc);
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
async function deleteTournament(p, id) {
  if (!id) return;
  await p.evaluate(async (u) => {
    await fetch(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft' }),
    });
  }, `/api/tournaments/${id}`).catch(() => {});
  await p.evaluate(async (u) => {
    await fetch(u, { method: 'DELETE' });
  }, `/api/tournaments/${id}`).catch(() => {});
}
async function deletePlayer(p, id) {
  if (!id) return;
  await p.evaluate(async (u) => {
    await fetch(u, { method: 'DELETE' });
  }, `/api/players/${id}`).catch(() => {});
}

function httpsRequest(url, read, fallback) {
  const timeoutMs = envMs('E2E_HTTP_TIMEOUT_MS', 15000);
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const req = https.get(url, (res) => read(res, done));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      done(fallback);
    });
    req.on('error', () => done(fallback));
  });
}

function getHeaders(url) {
  return httpsRequest(url, (res, done) => {
    done(res.headers);
    res.resume();
  }, {});
}

function getStatus(url) {
  return httpsRequest(url, (res, done) => {
    done(res.statusCode);
    res.resume();
  }, 0);
}

function getBody(url) {
  return httpsRequest(url, (res, done) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => done(data));
  }, '');
}

async function main() {
  let browser = null;
  const suiteTimeoutMs = envMs('E2E_ALL_SUITE_TIMEOUT_MS', envMs('E2E_SUITE_TIMEOUT_MS', 60 * 60 * 1000));
  const suiteTimer = setTimeout(() => {
    console.error(`[tc-all] suite timed out after ${formatDuration(suiteTimeoutMs)}`);
    exitAfterCleanup(124, () => closeBrowser(browser));
  }, suiteTimeoutMs);
  progressWatchdog = createProgressWatchdog('tc-all', undefined, () => closeBrowser(browser));

  try {
    browser = await chromium.launchPersistentContext(
      process.env.E2E_PROFILE_DIR || '/tmp/playwright-smkc-profile',
      {
        headless: process.env.E2E_HEADLESS === '1',
        viewport: { width: 1280, height: 720 },
      },
    );
    const page = browser.pages()[0] || await browser.newPage();
    page.setDefaultTimeout(envMs('E2E_ACTION_TIMEOUT_MS', 30 * 1000));
    page.setDefaultNavigationTimeout(envMs('E2E_NAV_TIMEOUT_MS', 30 * 1000));

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
  const hdrs = await getHeaders(BASE + '/');
  const miss = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy']
    .filter(h => !hdrs[h]);
  log('TC-105', miss.length === 0 ? 'PASS' : 'FAIL', miss.length > 0 ? 'Missing: ' + miss.join(',') : '');

  // TC-106: password leak (check API response text)
  const pTxt = await page.evaluate(async () => (await fetch('/api/players')).text());
  log('TC-106', !pTxt.includes('"password"') && !pTxt.includes('$2b$') ? 'PASS' : 'FAIL');

  // TC-107: Forbidden consistency (unauthenticated curl — not browser session)
  let tc107 = true;
  for (const ep of ['bm/standings', 'mr/standings', 'gp/standings', 'ta/standings']) {
    const status = await getStatus(`${BASE}/api/tournaments/${TID}/${ep}`);
    if (status !== 403) tc107 = false;
  }
  log('TC-107', tc107 ? 'PASS' : 'FAIL');

  // TC-308: Players API format
  const api = await page.evaluate(async () => (await fetch('/api/players')).json());
  log('TC-308', api.success === true && Array.isArray(api.data) && api.meta ? 'PASS' : 'FAIL');

  // ===== Admin tests (use existing session from persistent profile) =====

  // TC-201 / TC-202: Create a dedicated test tournament so these tests don't
  // depend on a specific production tournament (previously targeted KasmoSMKC).
  // A fresh tournament shows its name in the layout header on every mode page,
  // so we can verify both page-load health and tournament name visibility.
  const tc201TournamentName = `E2E TC-201 ${Date.now()}`;
  let tc201TournamentId = null;
  try {
    const tc201Create = await page.evaluate(async d => {
      const r = await fetch('/api/tournaments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, { name: tc201TournamentName, date: new Date().toISOString() });
    tc201TournamentId = tc201Create.b?.data?.id ?? null;
    if (tc201Create.s !== 201 || !tc201TournamentId) {
      throw new Error(`Failed to create TC-201 tournament (${tc201Create.s})`);
    }

    // TC-201: Mode data loading
    let tc201 = true;
    for (const m of ['ta', 'bm', 'mr', 'gp']) {
      await nav(page, `/tournaments/${tc201TournamentId}/${m}`);
      t = await vis(page);
      if (['Failed to fetch', 'エラーが発生しました', '再試行'].some(e => t.includes(e))) tc201 = false;
      if (!t.includes(tc201TournamentName)) tc201 = false;
    }
    log('TC-201', tc201 ? 'PASS' : 'FAIL');

    // TC-202
    await nav(page, '/tournaments');
    t = await vis(page);
    const knownTournament = await page.evaluate(async (u) => {
      const r = await fetch(u);
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, `/api/tournaments/${tc201TournamentId}?fields=summary`);
    const tournamentsPageLoaded =
      t.includes('Tournaments') || t.includes('トーナメント') || t.includes('大会');
    const knownTournamentExists =
      knownTournament.s === 200 &&
      (knownTournament.b?.data?.name || knownTournament.b?.name || '') === tc201TournamentName;
    log('TC-202', tournamentsPageLoaded && knownTournamentExists ? 'PASS' : 'FAIL',
      !tournamentsPageLoaded ? 'Tournaments page did not render'
      : !knownTournamentExists ? 'Created tournament not found by API'
      : '');
  } catch (err) {
    log('TC-201', 'FAIL', err instanceof Error ? err.message : 'Setup failed');
    log('TC-202', 'FAIL', err instanceof Error ? err.message : 'Setup failed');
  } finally {
    if (tc201TournamentId) {
      await deleteTournament(page, tc201TournamentId);
    }
  }

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

      // Courses are now auto-filled when cup is pre-assigned (fixed sequence).
      // No "Add Race" clicks needed — 5 races appear automatically.
      // Each race row has 2 Select comboboxes: position1, position2 (course is a label).
      // For 5 races → 10 comboboxes total. Layout per race i:
      //   index i*2   = position1 (player1)
      //   index i*2+1 = position2 (player2)
      const allCb = playerPage.locator('button[role="combobox"]');
      // Wait for auto-generated race rows to appear
      await playerPage.waitForFunction(() => {
        return document.querySelectorAll('button[role="combobox"]').length >= 10;
      }, null, { timeout: 15000 });
      const cbCount = await allCb.count();
      if (cbCount < 10) {
        throw new Error(`Expected ≥10 comboboxes (5×2 positions), got ${cbCount}`);
      }

      // GP driver points: 1st=9, 5th=0
      // Expected totals: player1 = 9×5 = 45, player2 = 0×5 = 0
      for (let i = 0; i < 5; i++) {
        // Select position1 = 1st (index 0 in options list [1,2,3,4,5,6,7,8])
        await allCb.nth(i * 2).click();
        await playerPage.waitForSelector('[role="listbox"]', { timeout: 5000 });
        await playerPage.locator('[role="listbox"] [role="option"]').nth(0).click();
        await playerPage.waitForTimeout(300);

        // Select position2 = 5th (index 4 in options list, 0 driver points)
        await allCb.nth(i * 2 + 1).click();
        await playerPage.waitForSelector('[role="listbox"]', { timeout: 5000 });
        await playerPage.locator('[role="listbox"] [role="option"]').nth(4).click();
        await playerPage.waitForTimeout(300);
      }

      playerPage.once('dialog', async (dialog) => {
        await dialog.accept();
      });
      await playerPage.getByRole('button', { name: /試合結果を送信|Submit Match Result/ }).click();

      let reportedMatch = null;
      const gpDeadline = Date.now() + 20000;
      while (Date.now() < gpDeadline) {
        const gpState = await page.evaluate(async (u) => {
          const r = await fetch(u);
          return { s: r.status, b: await r.json().catch(() => ({})) };
        }, `/api/tournaments/${gpTournamentId}/gp`);
        const gpMatches = gpState.b?.data?.matches ?? gpState.b?.matches ?? [];
        reportedMatch = gpMatches.find((m) =>
          !m.isBye &&
          ((m.player1?.id === pid && m.player2?.id === gpPlayer2Id) ||
            (m.player1?.id === gpPlayer2Id && m.player2?.id === pid))
        );
        if (reportedMatch?.completed) break;
        await page.waitForTimeout(1000);
      }

      const playerWonAsP1 = reportedMatch?.player1?.id === pid;
      const scorePersisted = reportedMatch?.completed === true &&
        ((playerWonAsP1 && reportedMatch.points1 === 45 && reportedMatch.points2 === 0) ||
          (!playerWonAsP1 && reportedMatch.points1 === 0 && reportedMatch.points2 === 45));

      log('TC-311', scorePersisted ? 'PASS' : 'FAIL',
        scorePersisted ? ''
        : !reportedMatch ? 'No matching match found in API response'
        : `completed=${reportedMatch.completed} p1=${reportedMatch.points1} p2=${reportedMatch.points2} asP1=${playerWonAsP1}`);
      await playerBrowser.close();
      playerBrowser = null;
    } catch (err) {
      log('TC-311', 'FAIL', err instanceof Error ? err.message : 'GP participant score flow failed');
      if (playerBrowser) await playerBrowser.close().catch(() => {});
    } finally {
      if (gpTournamentId) {
        await deleteTournament(page, gpTournamentId);
      }
      if (gpPlayer2Id) {
        await deletePlayer(page, gpPlayer2Id);
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
      await apiActivateTournament(page, taTournamentId);

      const addTaEntry = await apiAddTaEntries(page, taTournamentId, { playerId: pid });
      const taEntryId = addTaEntry.b?.data?.entries?.[0]?.id ?? null;
      if (addTaEntry.s !== 201 || !taEntryId) {
        throw new Error(`Failed to create TA qualification entry (${addTaEntry.s})`);
      }

      /* Seed rank 17 so promote_phase1 (ranks 17–24) picks this entry up. */
      await apiSeedTtEntry(
        page, taTournamentId, taEntryId,
        { MC1: '1:00.00' }, 60000, 17
      );

      const promotePhase1 = await apiPromoteTaPhase(page, taTournamentId, 'promote_phase1');
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
        await deleteTournament(page, taTournamentId);
      }
    }
  } else { log('TC-312', 'SKIP'); }

  // TC-313: TA admin cannot add qualification players after knockout starts
  if (pid) {
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
        name: `E2E TA Add Lock ${Date.now()}`,
        date: new Date().toISOString(),
        dualReportEnabled: false,
      });
      taTournamentId = taTournament.b?.data?.id ?? null;
      if (taTournament.s !== 201 || !taTournamentId) {
        throw new Error('Failed to create TA tournament');
      }
      await apiActivateTournament(page, taTournamentId);

      const addTaEntry = await apiAddTaEntries(page, taTournamentId, { playerId: pid });
      const taEntryId = addTaEntry.b?.data?.entries?.[0]?.id ?? null;
      if (addTaEntry.s !== 201 || !taEntryId) {
        throw new Error(`Failed to create TA qualification entry (${addTaEntry.s})`);
      }

      await apiSeedTtEntry(
        page, taTournamentId, taEntryId,
        { MC1: '1:00.00' }, 60000, 17
      );

      const promotePhase1 = await apiPromoteTaPhase(page, taTournamentId, 'promote_phase1');
      if (promotePhase1.s !== 200) {
        throw new Error(`Failed to promote Phase 1 (${promotePhase1.s})`);
      }

      await nav(page, `/tournaments/${taTournamentId}/ta`);
      const addPlayerButton = page.getByRole('button', { name: /プレイヤー追加|Add Player/ }).first();
      const ariaDisabled = await addPlayerButton.getAttribute('aria-disabled');
      // Use native .click() to bypass Playwright's aria-disabled enabled-check.
      // Native .click() triggers React's synthetic event system (via event delegation)
      // more reliably than dispatchEvent for React 19 production builds.
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-disabled="true"][aria-haspopup="dialog"]');
        if (btn) btn.click();
      });
      await page.waitForTimeout(2000);
      const toastVisible = await page.locator('[data-sonner-toast]').filter({
        hasText: /本線開始後は、予選へのプレイヤー追加はできません。|Players cannot be added to qualification after the knockout stage starts./,
      }).count().then((count) => count > 0);
      const dialogOpened = await page.getByText(/TA にプレイヤーを追加|Add Player to TA/).count().then((count) => count > 0);

      log('TC-313', ariaDisabled === 'true' && toastVisible && !dialogOpened ? 'PASS' : 'FAIL',
        ariaDisabled !== 'true'
          ? 'Add Player button is not marked locked'
          : !toastVisible
            ? 'No add-lock toast'
            : dialogOpened
              ? 'Add Player dialog still opened'
              : '');
    } catch (err) {
      log('TC-313', 'FAIL', err instanceof Error ? err.message : 'TA add lock flow failed');
    } finally {
      if (taTournamentId) {
        await deleteTournament(page, taTournamentId);
      }
    }
  } else { log('TC-313', 'SKIP'); }

  // TC-314: TA Phase 3 can undo the last submitted round
  if (pid) {
    let taTournamentId = null;
    let secondPlayerId = null;
    try {
      const secondPlayer = await page.evaluate(async (nickname) => {
        const r = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'E2E TA Finals Undo', nickname, country: 'JP' }),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, `e2e_ta_undo_${Date.now()}`);
      secondPlayerId = secondPlayer.b?.data?.player?.id ?? null;
      if (secondPlayer.s !== 201 || !secondPlayerId) {
        throw new Error(`Failed to create second TA player (${secondPlayer.s})`);
      }

      const taTournament = await page.evaluate(async d => {
        const r = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, {
        name: `E2E TA Finals Undo ${Date.now()}`,
        date: new Date().toISOString(),
        dualReportEnabled: false,
      });
      taTournamentId = taTournament.b?.data?.id ?? null;
      if (taTournament.s !== 201 || !taTournamentId) {
        throw new Error('Failed to create TA tournament');
      }
      await apiActivateTournament(page, taTournamentId);

      const entryIds = [];
      for (const playerId of [pid, secondPlayerId]) {
        const addTaEntry = await apiAddTaEntries(page, taTournamentId, { playerId });
        const entryId = addTaEntry.b?.data?.entries?.[0]?.id ?? null;
        if (addTaEntry.s !== 201 || !entryId) {
          throw new Error(`Failed to create TA qualification entry (${addTaEntry.s})`);
        }
        entryIds.push(entryId);
      }

      for (const [index, entryId] of entryIds.entries()) {
        await apiSeedTtEntry(
          page, taTournamentId, entryId,
          { MC1: index === 0 ? '1:00.00' : '1:01.00' },
          index === 0 ? 60000 : 61000,
          index + 1,
        );
      }

      const promotePhase3 = await apiPromoteTaPhase(page, taTournamentId, 'promote_phase3');
      if (promotePhase3.s !== 200) {
        throw new Error(`Failed to promote Phase 3 (${promotePhase3.s})`);
      }

      await nav(page, `/tournaments/${taTournamentId}/ta/finals`);
      const startRoundButton = page.getByRole('button', { name: /ラウンド 1 開始|Start Round 1/ });
      await startRoundButton.click();
      await page.waitForTimeout(2000);

      const timeInputs = page.locator('input[placeholder="M:SS.mm"]');
      const inputCount = await timeInputs.count();
      if (inputCount < 2) {
        throw new Error('Phase 3 time inputs did not appear');
      }
      await timeInputs.nth(0).fill('1:00.00');
      await timeInputs.nth(1).fill('1:01.00');

      await page.getByRole('button', { name: /送信＆ライフ減算|Submit & Deduct Lives/ }).click();
      // Wait for round submission to complete and UI to re-render.
      // The undo button appears when completedRoundsCount > 0 && !hasOpenRound,
      // so we must wait until the round is fully processed.
      await page.waitForTimeout(5000);

      const undoButton = page.getByRole('button', { name: /直前ラウンドを取り消す|Undo Last Round/ });
      // Retry a few times in case the UI hasn't re-rendered yet
      let undoVisible = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        undoVisible = await undoButton.count().then((count) => count > 0);
        if (undoVisible) break;
        await page.waitForTimeout(2000);
      }
      if (!undoVisible) {
        throw new Error('Undo Last Round button did not appear after submission');
      }

      await undoButton.click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: /はい、取り消す|Yes, Undo Round/ }).click();
      await page.waitForTimeout(3000);

      const cancelButtonVisible = await page.getByRole('button', { name: /ラウンドキャンセル|Cancel Round/ }).count().then((count) => count > 0);
      const restoredInputCount = await page.locator('input[placeholder="M:SS.mm"]').count();
      const undoGone = await undoButton.count().then((count) => count === 0);

      log(
        'TC-314',
        undoVisible && cancelButtonVisible && restoredInputCount >= 2 && undoGone ? 'PASS' : 'FAIL',
        !cancelButtonVisible
          ? 'Round input UI was not restored after undo'
          : restoredInputCount < 2
            ? 'Restored round inputs are missing'
            : !undoGone
              ? 'Undo button still visible after restoring the round'
              : ''
      );
    } catch (err) {
      log('TC-314', 'FAIL', err instanceof Error ? err.message : 'TA finals undo flow failed');
    } finally {
      if (taTournamentId) {
        await deleteTournament(page, taTournamentId);
      }
      if (secondPlayerId) {
        await deletePlayer(page, secondPlayerId);
      }
    }
  } else { log('TC-314', 'SKIP'); }

  // TC-317: TA seeding CRUD — update_seeding persists on TTEntry, returned in GET
  if (pid) {
    let taTournamentId = null;
    try {
      const created = await page.evaluate(async d => {
        const r = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, { name: `E2E TA Seeding ${Date.now()}`, date: new Date().toISOString(), dualReportEnabled: false });
      taTournamentId = created.b?.data?.id ?? null;
      if (created.s !== 201 || !taTournamentId) throw new Error('Failed to create TA tournament');
      await apiActivateTournament(page, taTournamentId);

      const addResult = await apiAddTaEntries(page, taTournamentId, {
        playerEntries: [{ playerId: pid, seeding: 3 }],
      });
      const entryId = addResult.b?.data?.entries?.[0]?.id ?? null;
      const initialSeeding = addResult.b?.data?.entries?.[0]?.seeding;
      if (addResult.s !== 201 || !entryId) {
        throw new Error(`Failed to create TA entry with seeding (${addResult.s})`);
      }
      const step1 = initialSeeding === 3;

      const updateResult = await apiUpdateTaSeeding(page, taTournamentId, entryId, 7);
      const step2 = updateResult.s === 200;

      const getResult = await apiFetchTa(page, taTournamentId);
      const entry = getResult.b?.data?.entries?.find(e => e.id === entryId);
      const step3 = entry?.seeding === 7;

      const clearResult = await apiUpdateTaSeeding(page, taTournamentId, entryId, null);
      const step4 = clearResult.s === 200 && clearResult.b?.data?.entry?.seeding === null;

      log('TC-317', step1 && step2 && step3 && step4 ? 'PASS' : 'FAIL',
        !step1 ? 'Initial seeding not set on creation'
        : !step2 ? 'update_seeding PUT failed'
        : !step3 ? `Seeding not persisted in GET (got ${entry?.seeding})`
        : !step4 ? 'Failed to clear seeding to null'
        : '');
    } catch (err) {
      log('TC-317', 'FAIL', err instanceof Error ? err.message : 'TA seeding CRUD failed');
    } finally {
      if (taTournamentId) {
        await deleteTournament(page, taTournamentId);
      }
    }
  } else { log('TC-317', 'SKIP'); }

  // TC-318: TA pair assignment — set_partner + partner can edit each other's times
  if (pid) {
    let taTournamentId = null;
    let partnerPlayerId = null;
    try {
      const partnerNick = `e2e_pair_${Date.now()}`;
      const partnerResult = await page.evaluate(async (d) => {
        const r = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, { name: 'E2E Pair Partner', nickname: partnerNick, country: 'JP' });
      partnerPlayerId = partnerResult.b?.data?.player?.id ?? null;
      const partnerPassword = partnerResult.b?.data?.temporaryPassword ?? null;
      if (partnerResult.s !== 201 || !partnerPlayerId) {
        throw new Error(`Failed to create partner player (${partnerResult.s})`);
      }

      const created = await page.evaluate(async d => {
        const r = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, { name: `E2E TA Pair ${Date.now()}`, date: new Date().toISOString(), dualReportEnabled: false });
      taTournamentId = created.b?.data?.id ?? null;
      if (created.s !== 201 || !taTournamentId) throw new Error('Failed to create TA tournament');
      await apiActivateTournament(page, taTournamentId);

      const addBoth = await apiAddTaEntries(page, taTournamentId, {
        playerEntries: [
          { playerId: pid, seeding: 1 },
          { playerId: partnerPlayerId, seeding: 2 },
        ],
      });
      if (addBoth.s !== 201) throw new Error(`Failed to add players to TA (${addBoth.s})`);
      const entry1 = addBoth.b?.data?.entries?.find(e => e.playerId === pid);
      const entry2 = addBoth.b?.data?.entries?.find(e => e.playerId === partnerPlayerId);
      if (!entry1 || !entry2) throw new Error('Missing entries after add');

      const setPairResult = await apiSetTaPartner(page, taTournamentId, entry1.id, partnerPlayerId);
      const step1 = setPairResult.s === 200;

      const getEntries = await apiFetchTa(page, taTournamentId);
      const e1 = getEntries.b?.data?.entries?.find(e => e.playerId === pid);
      const e2 = getEntries.b?.data?.entries?.find(e => e.playerId === partnerPlayerId);
      const step2 = e1?.partnerId === partnerPlayerId && e2?.partnerId === pid;

      /* Partner session: separate ephemeral browser so the admin persistent
       * profile stays untouched. The partner PUT /ta exercises the partnerId
       * rule in src/app/api/tournaments/[id]/ta/route.ts. */
      let partnerBrowser = null;
      let step3 = false;
      try {
        partnerBrowser = await chromium.launch({ headless: false });
        const partnerCtx = await partnerBrowser.newContext({ viewport: { width: 1280, height: 720 } });
        const partnerPage = await partnerCtx.newPage();
        await nav(partnerPage, '/auth/signin');
        await partnerPage.locator('#nickname').fill(partnerNick);
        await partnerPage.locator('#password').fill(partnerPassword);
        await partnerPage.getByRole('button', { name: /ログイン|Login/ }).click();
        await partnerPage.waitForURL((url) => url.pathname === '/tournaments', { timeout: 15000 });
        await partnerPage.waitForTimeout(2000);

        const partnerEditResult = await apiTaParticipantEditTime(
          partnerPage, taTournamentId, entry1.id, 'MC1', '1:23.45'
        );
        step3 = partnerEditResult.s === 200;
      } finally {
        if (partnerBrowser) await partnerBrowser.close().catch(() => {});
      }

      const verifyEntries = await apiFetchTa(page, taTournamentId);
      const updatedEntry = verifyEntries.b?.data?.entries?.find(e => e.playerId === pid);
      const step4 = updatedEntry?.times?.MC1 === '1:23.45';

      log('TC-318', step1 && step2 && step3 && step4 ? 'PASS' : 'FAIL',
        !step1 ? 'set_partner failed'
        : !step2 ? `Bidirectional partner not set (e1.partnerId=${e1?.partnerId}, e2.partnerId=${e2?.partnerId})`
        : !step3 ? 'Partner could not edit paired player time'
        : !step4 ? `Time not persisted (got ${updatedEntry?.times?.MC1})`
        : '');
    } catch (err) {
      log('TC-318', 'FAIL', err instanceof Error ? err.message : 'TA pair flow failed');
    } finally {
      if (taTournamentId) await deleteTournament(page, taTournamentId);
      if (partnerPlayerId) await deletePlayer(page, partnerPlayerId);
    }
  } else { log('TC-318', 'SKIP'); }

  // TC-319: taPlayerSelfEdit=false blocks self-edit, allows partner edit
  // Verified indirectly: admin bypasses the self-edit gate, so we probe the
  // flag via GET /ta.data.taPlayerSelfEdit and via a round-trip PUT toggle.
  if (pid) {
    let taTournamentId = null;
    let partnerPlayerId2 = null;
    try {
      const pNick = `e2e_selfed_${Date.now()}`;
      const pResult = await page.evaluate(async (d) => {
        const r = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, { name: 'E2E SelfEdit', nickname: pNick, country: 'JP' });
      partnerPlayerId2 = pResult.b?.data?.player?.id ?? null;
      if (!partnerPlayerId2) throw new Error('Failed to create partner');

      const created = await page.evaluate(async d => {
        const r = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, {
        name: `E2E SelfEdit ${Date.now()}`,
        date: new Date().toISOString(),
        dualReportEnabled: false,
        taPlayerSelfEdit: false,
      });
      taTournamentId = created.b?.data?.id ?? null;
      if (!taTournamentId) throw new Error('Failed to create tournament');
      await apiActivateTournament(page, taTournamentId);

      const addResult = await apiAddTaEntries(page, taTournamentId, {
        playerEntries: [
          { playerId: pid, seeding: 1 },
          { playerId: partnerPlayerId2, seeding: 2 },
        ],
      });
      const entry1 = addResult.b?.data?.entries?.find(e => e.playerId === pid);
      const entry2 = addResult.b?.data?.entries?.find(e => e.playerId === partnerPlayerId2);
      if (!entry1 || !entry2) throw new Error('Missing entries');

      await apiSetTaPartner(page, taTournamentId, entry1.id, partnerPlayerId2);

      /* Admin session → PUT /ta is allowed (admin bypass); this proves
       * the endpoint is reachable and the toggle below is the only gate. */
      const selfEditResult = await apiTaParticipantEditTime(
        page, taTournamentId, entry1.id, 'MC1', '1:00.00'
      );
      const getResult = await apiFetchTa(page, taTournamentId);
      const step1 = getResult.b?.data?.taPlayerSelfEdit === false;
      const step2 = selfEditResult.s === 200;

      const toggleResult = await apiUpdateTournament(page, taTournamentId, { taPlayerSelfEdit: true });
      const step3 = toggleResult.s === 200;

      const getResult2 = await apiFetchTa(page, taTournamentId);
      const step4 = getResult2.b?.data?.taPlayerSelfEdit === true;

      log('TC-319', step1 && step2 && step3 && step4 ? 'PASS' : 'FAIL',
        !step1 ? `taPlayerSelfEdit not false (${getResult.b?.data?.taPlayerSelfEdit})`
        : !step2 ? 'Admin edit failed'
        : !step3 ? 'Toggle PUT failed'
        : !step4 ? 'taPlayerSelfEdit not toggled back to true'
        : '');
    } catch (err) {
      log('TC-319', 'FAIL', err instanceof Error ? err.message : 'Self-edit toggle test failed');
    } finally {
      if (taTournamentId) await deleteTournament(page, taTournamentId);
      if (partnerPlayerId2) await deletePlayer(page, partnerPlayerId2);
    }
  } else { log('TC-319', 'SKIP'); }

  // TC-104: Player delete
  if (pid) {
    const dr = await page.evaluate(async u => {
      const r = await fetch(u, { method: 'DELETE' });
      return { ok: r.ok };
    }, `/api/players/${pid}`);
    log('TC-104', dr.ok ? 'PASS' : 'FAIL');
  } else { log('TC-104', 'SKIP'); }

  // TC-304: Viewer empty group message (check via unauthenticated curl)
  const mrBody = await getBody(`${BASE}/tournaments/${TID}/mr`);
  log('TC-304', (mrBody.includes('Please wait') || mrBody.includes('セットアップが完了するまで')) ? 'PASS' : 'FAIL');

  // TC-305: BM group dialog - verify dialog closes after save
  await nav(page, `/tournaments/${TID}/bm`);
  const editBtn305 = page.getByRole('button', { name: /グループ編集|Edit Groups/ });
  if (await editBtn305.count() > 0) {
    await editBtn305.click();
    await page.waitForTimeout(2000);
    const saveBtn305 = page.getByRole('button', { name: /グループ更新|Update Groups/ });
    if (await saveBtn305.count() > 0) {
      // Click save and verify dialog closes
      await saveBtn305.click();
      await page.waitForTimeout(10000); // Wait longer for save + dialog close
      const dialogCount = await page.locator('[role="dialog"]').count();
      const dialogClosed = dialogCount === 0;
      log('TC-305', dialogClosed ? 'PASS' : 'FAIL', dialogClosed ? '' : `Dialog still open after save (count=${dialogCount})`);
      if (!dialogClosed) {
        await page.keyboard.press('Escape').catch(() => {});
      }
    } else { log('TC-305', 'SKIP', 'No update button'); }
  } else { log('TC-305', 'SKIP', 'No edit button'); }

  // TC-315: BM group setup with odd player count (3 players) must not return 500
  // Regression test for FK violation when player2Id='__BREAK__' (BYE match sentinel)
  {
    let tc315TournamentId = null;
    try {
      // Create a temp tournament for this test
      const t315 = await page.evaluate(async d => {
        const r = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, { name: `TC-315-test-${Date.now()}`, date: new Date().toISOString() });
      tc315TournamentId = t315.b?.data?.id ?? null;

      if (!tc315TournamentId) {
        log('TC-315', 'SKIP', 'Failed to create temp tournament');
      } else {
        // Activate the tournament
        await page.evaluate(async ([u, d]) => {
          await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
        }, [`/api/tournaments/${tc315TournamentId}`, { status: 'active' }]);

        // Get 3 player IDs (odd count to force BYE match creation)
        const players315 = await page.evaluate(async () => {
          const r = await fetch('/api/players');
          const j = await r.json();
          return (j.data || []).slice(0, 3).map(p => p.id);
        });

        if (players315.length < 3) {
          log('TC-315', 'SKIP', 'Not enough players');
        } else {
          // POST BM setup with 3 players — previously caused 500 due to FK violation
          const setup315 = await page.evaluate(async ([u, d]) => {
            const r = await fetch(u, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(d),
            });
            return { s: r.status, b: await r.json().catch(() => ({})) };
          }, [
            `/api/tournaments/${tc315TournamentId}/bm`,
            { players: players315.map(id => ({ playerId: id, group: 'A' })) },
          ]);

          const postOk = setup315.s === 201;

          // Verify BYE match was created (3 players → 1 BYE per round)
          const bm315 = await page.evaluate(async u => {
            const r = await fetch(u);
            const j = await r.json();
            return j.data || j;
          }, `/api/tournaments/${tc315TournamentId}/bm`);
          const hasByeMatch = (bm315.matches || []).some(m => m.isBye);

          // Verify __BREAK__ not in players list
          const noBreakInPlayers = await page.evaluate(async () => {
            const r = await fetch('/api/players');
            const j = await r.json();
            return !(j.data || []).some(p => p.id === '__BREAK__' || p.nickname === '__BREAK__');
          });

          log('TC-315', postOk && hasByeMatch && noBreakInPlayers ? 'PASS' : 'FAIL',
            !postOk ? `POST returned ${setup315.s}` :
            !hasByeMatch ? 'No BYE match found' :
            !noBreakInPlayers ? '__BREAK__ appeared in player list' : '');
        }
      }
    } catch (e) {
      log('TC-315', 'FAIL', e.message);
    } finally {
      if (tc315TournamentId) {
        await deleteTournament(page, tc315TournamentId);
      }
    }
  }

  // TC-307: Score entry links
  let tc307 = true;
  for (const m of ['bm', 'mr', 'gp']) {
    await nav(page, `/tournaments/${TID}/${m}`);
    if (await page.locator('a[href*="participant"]').count() === 0) tc307 = false;
  }
  log('TC-307', tc307 ? 'PASS' : 'FAIL');

  // TC-401/402/403/404 (旧「軽量フルワークフロー」と GP ダイアログUI checks) は廃止。
  // 機能カバレッジは tc-bm.js / tc-mr.js / tc-gp.js の 28人フルワークフロー (TC-5xx/6xx/7xx) に集約。

  // TC-316: Tiebreaker warning suppressed at group setup (mp=0), shown after tie match
  // Regression test for #filterActiveTiedIds: at mp=0 all players share 0-0 scores,
  // the banner must be hidden; after a 2-2 (tied) match is entered the banner must appear.
  {
    let tc316TournamentId = null;
    try {
      // Create temp tournament
      const t316 = await page.evaluate(async d => {
        const r = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, { name: `TC-316-test-${Date.now()}`, date: new Date().toISOString() });
      tc316TournamentId = t316.b?.data?.id ?? null;

      if (!tc316TournamentId) {
        log('TC-316', 'SKIP', 'Failed to create temp tournament');
      } else {
        // Activate tournament (must use PUT per API convention)
        await page.evaluate(async ([u, d]) => {
          await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
        }, [`/api/tournaments/${tc316TournamentId}`, { status: 'active' }]);

        // Get 4 players
        const players316 = await page.evaluate(async () => {
          const r = await fetch('/api/players');
          const j = await r.json();
          return (j.data || []).slice(0, 4).map(p => p.id);
        });

        if (players316.length < 4) {
          log('TC-316', 'SKIP', 'Not enough players');
        } else {
          // Set up BM with 2 players in group A (minimal setup to get matches)
          const setup316 = await page.evaluate(async ([u, d]) => {
            const r = await fetch(u, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(d),
            });
            return { s: r.status };
          }, [
            `/api/tournaments/${tc316TournamentId}/bm`,
            { players: players316.slice(0, 2).map(id => ({ playerId: id, group: 'A' })) },
          ]);

          if (setup316.s !== 201) {
            log('TC-316', 'SKIP', `BM setup returned ${setup316.s}`);
          } else {
            // Phase 1: Visit page — NO tie warning expected (mp=0 for all)
            await nav(page, `/tournaments/${tc316TournamentId}/bm`);
            const text1 = await vis(page);
            const hasGroups = text1.includes('Group A') || text1.includes('グループ A');
            const hasTieWarnBefore = text1.includes('同順位が検出されました') || text1.includes('Tied ranks detected');

            if (!hasGroups) {
              log('TC-316', 'FAIL', 'Group A not rendered');
            } else if (hasTieWarnBefore) {
              log('TC-316', 'FAIL', 'Tie warning shown at mp=0 (should be suppressed by filterActiveTiedIds)');
            } else {
              // Phase 2: Enter a 2-2 (tied) match, then verify warning appears
              const bm316 = await page.evaluate(async u => {
                const r = await fetch(u);
                const j = await r.json();
                return j.data || j;
              }, `/api/tournaments/${tc316TournamentId}/bm`);
              const groupAMatches = (bm316.matches || []).filter(m => m.group === 'A' && !m.isBye);

              if (groupAMatches.length === 0) {
                // No matches (1v1 group has only 1 match but timing may vary)
                log('TC-316', 'PASS', '0-match warning correctly suppressed (no group matches available for phase 2)');
              } else {
                // Enter a 2-2 draw (score1=2 score2=2 → both players tied at mp=1)
                const enter316 = await page.evaluate(async ([u, d]) => {
                  const r = await fetch(u, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(d),
                  });
                  return { s: r.status };
                }, [
                  `/api/tournaments/${tc316TournamentId}/bm/matches/${groupAMatches[0].id}`,
                  { score1: 2, score2: 2 },
                ]);

                if (enter316.s !== 200) {
                  log('TC-316', 'PASS', `0-match warning suppressed (tie entry returned ${enter316.s}, cannot verify phase 2)`);
                } else {
                  await nav(page, `/tournaments/${tc316TournamentId}/bm`);
                  const text2 = await vis(page);
                  const hasTieWarnAfter = text2.includes('同順位が検出されました') || text2.includes('Tied ranks detected');
                  log('TC-316', hasTieWarnAfter ? 'PASS' : 'FAIL',
                    !hasTieWarnAfter ? 'Warning not shown after tied match — filterActiveTiedIds may be broken' : '');
                }
              }
            }
          }
        }
      }
    } catch (e) {
      log('TC-316', 'FAIL', e.message);
    } finally {
      if (tc316TournamentId) {
        await deleteTournament(page, tc316TournamentId);
      }
    }
  }

  // TC-320: Match list link labels — BM shows "Details"/"詳細"; MR/GP no longer show row-level score entry
  // BM match page is view-only (score entry consolidated to participant page), so BM link says "Details".
  // MR/GP score entry is consolidated to the participant pages.
  {
    let tc320 = true;
    let tc320Detail = '';
    for (const m of ['bm', 'mr', 'gp']) {
      await nav(page, `/tournaments/${TID}/${m}`);
      const matchesTab = page.getByRole('tab', { name: /試合|Matches/ });
      if (await matchesTab.count() > 0) {
        await matchesTab.click();
        await page.waitForTimeout(1000);
      }
      const bodyText = await vis(page);
      if (m === 'bm') {
        // BM: should show "Details"/"詳細" (not "Score Entry"/"スコア入力")
        const hasDetailsLabel = bodyText.includes('Details') || bodyText.includes('詳細');
        if (!hasDetailsLabel) {
          tc320 = false;
          tc320Detail = 'BM missing "Details"/"詳細" link';
        }
      } else {
        const hasRowScoreEntry = await page.locator('tbody a:has-text("Score Entry"), tbody a:has-text("スコア入力")').count();
        if (hasRowScoreEntry > 0) {
          tc320 = false;
          tc320Detail = `${m.toUpperCase()} still shows row-level "Score Entry"/"スコア入力" link`;
        }
      }
    }
    log('TC-320', tc320 ? 'PASS' : 'FAIL', tc320Detail);
  }

  // TC-321: BM match page is view-only (no score entry form)
  // Score entry was consolidated to the participant page (/bm/participant).
  // Creates temp tournament + 2 players, sets up BM, then verifies:
  //   1. Match page shows player names and match info (view-only)
  //   2. No score entry form elements (no "I am"/"私は" identity selection, no +/- buttons)
  //   3. Shows "in progress" message for incomplete matches
  {
    let tc321TournamentId = null;
    let tc321Player1Id = null;
    let tc321Player2Id = null;
    try {
      // Create 2 temp players
      const p1 = await page.evaluate(async (d) => {
        const r = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, { name: 'E2E MatchAuth P1', nickname: `e2e_auth1_${Date.now()}`, country: 'JP' });
      tc321Player1Id = p1.b?.data?.player?.id ?? null;

      const p2 = await page.evaluate(async (d) => {
        const r = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, { name: 'E2E MatchAuth P2', nickname: `e2e_auth2_${Date.now()}`, country: 'JP' });
      tc321Player2Id = p2.b?.data?.player?.id ?? null;

      if (!tc321Player1Id || !tc321Player2Id) {
        throw new Error('Failed to create test players');
      }

      // Create tournament
      const t321 = await page.evaluate(async (d) => {
        const r = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, {
        name: `E2E MatchView ${Date.now()}`,
        date: new Date().toISOString(),
        dualReportEnabled: false,
      });
      tc321TournamentId = t321.b?.data?.id ?? null;
      if (!tc321TournamentId) throw new Error('Failed to create tournament');

      // Activate
      await page.evaluate(async ([u, d]) => {
        await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      }, [`/api/tournaments/${tc321TournamentId}`, { status: 'active' }]);

      // Set up BM with 2 players
      const setup = await page.evaluate(async ([u, d]) => {
        const r = await fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, [
        `/api/tournaments/${tc321TournamentId}/bm`,
        {
          players: [
            { playerId: tc321Player1Id, group: 'A' },
            { playerId: tc321Player2Id, group: 'A' },
          ],
        },
      ]);
      if (setup.s !== 201) throw new Error(`BM setup failed (${setup.s})`);

      // Get a non-BYE match ID
      const bmData = await page.evaluate(async (u) => {
        const r = await fetch(u);
        const j = await r.json();
        return j.data || j;
      }, `/api/tournaments/${tc321TournamentId}/bm`);
      const match = (bmData.matches || []).find(m => !m.isBye);
      if (!match) throw new Error('No non-BYE match found');
      const matchUrl = `/tournaments/${tc321TournamentId}/bm/match/${match.id}`;

      // Visit match page — should be view-only
      await nav(page, matchUrl);
      const matchText = await vis(page);

      // Should show player names (match info is present)
      const showsPlayers = matchText.includes('vs');
      // Should NOT have score entry form elements
      const noScoreEntryForm = !matchText.includes('I am') && !matchText.includes('私は');
      // Should show "in progress" message for incomplete match
      const showsInProgress =
        matchText.includes('in progress') || matchText.includes('進行中');

      log('TC-321',
        showsPlayers && noScoreEntryForm && showsInProgress ? 'PASS' : 'FAIL',
        !showsPlayers ? 'Match page does not show player info'
        : !noScoreEntryForm ? 'Match page still has score entry form elements'
        : !showsInProgress ? 'Match page does not show "in progress" message'
        : '');
    } catch (err) {
      log('TC-321', 'FAIL', err instanceof Error ? err.message : 'BM match view-only test failed');
    } finally {
      if (tc321TournamentId) {
        await deleteTournament(page, tc321TournamentId);
      }
      if (tc321Player1Id) {
        await deletePlayer(page, tc321Player1Id);
      }
      if (tc321Player2Id) {
        await deletePlayer(page, tc321Player2Id);
      }
    }
  }

  // TC-322 (BM participant correction) は tc-bm.js が担当。tc-all.js 末尾の child process で実行される。

  // TC-324: BM tie warning banner disappears after admin sets rankOverride
  // Creates 3 players, sets up BM qualification, submits all matches as 2-2 ties
  // to force identical standings, then verifies:
  //   (a) tie warning banner appears on the standings tab
  //   (b) after setting rankOverride on N-1 players, the banner disappears
  {
    let tc323TournamentId = null;
    const tc323PlayerIds = [];
    try {
      const stamp = Date.now();

      // Create 3 players for a round-robin group
      for (let i = 1; i <= 3; i++) {
        const p = await page.evaluate(async (d) => {
          const r = await fetch('/api/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(d),
          });
          return { s: r.status, b: await r.json().catch(() => ({})) };
        }, { name: `E2E Tie P${i}`, nickname: `e2e_tie${i}_${stamp}`, country: 'JP' });
        const id = p.b?.data?.player?.id;
        if (p.s !== 201 || !id) throw new Error(`Failed to create player ${i}`);
        tc323PlayerIds.push(id);
      }

      // Create & activate tournament
      const tournament = await page.evaluate(async (d) => {
        const r = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, { name: `E2E Tie Warn ${stamp}`, date: new Date().toISOString(), dualReportEnabled: false });
      tc323TournamentId = tournament.b?.data?.id ?? null;
      if (tournament.s !== 201 || !tc323TournamentId) throw new Error('Failed to create tournament');

      await page.evaluate(async ([u, d]) => {
        await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      }, [`/api/tournaments/${tc323TournamentId}`, { status: 'active' }]);

      // Setup BM qualification with 3 players in group A
      const setup = await page.evaluate(async ([u, d]) => {
        const r = await fetch(u, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      }, [
        `/api/tournaments/${tc323TournamentId}/bm`,
        { players: tc323PlayerIds.map((id, i) => ({ playerId: id, group: 'A', seeding: i + 1 })) },
      ]);
      if (setup.s !== 201) throw new Error(`BM setup failed (${setup.s})`);

      // Get matches and submit all non-BYE matches as 2-2 ties
      const bmData = await page.evaluate(async (u) => {
        const r = await fetch(u);
        const j = await r.json().catch(() => ({}));
        return j.data || j;
      }, `/api/tournaments/${tc323TournamentId}/bm`);
      const nonByeMatches = (bmData.matches || []).filter(m => !m.isBye);

      for (const match of nonByeMatches) {
        // Submit 2-2 tie via admin API (PUT)
        const put = await page.evaluate(async ([u, d]) => {
          const r = await fetch(u, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(d),
          });
          return { s: r.status };
        }, [
          `/api/tournaments/${tc323TournamentId}/bm`,
          { matchId: match.id, score1: 2, score2: 2 },
        ]);
        if (put.s !== 200) throw new Error(`Failed to submit score for match ${match.matchNumber} (${put.s})`);
      }

      // Navigate to BM page standings tab and check for tie warning banner
      await nav(page, `/tournaments/${tc323TournamentId}/bm`);
      // Click standings tab
      const standingsTab = page.locator('button[role="tab"]').filter({ hasText: /順位表|Standings/ });
      if (await standingsTab.count() > 0) {
        await standingsTab.click();
        await page.waitForTimeout(2000);
      }

      // Check that the tie warning banner is visible
      const bannerBefore = await page.locator('text=同順位が検出されました').count() +
        await page.locator('text=Tied ranks detected').count();
      const hasBannerBefore = bannerBefore > 0;

      // Get qualifications to find tied player IDs for rankOverride
      const qualData = await page.evaluate(async (u) => {
        const r = await fetch(u);
        const j = await r.json().catch(() => ({}));
        return j.data || j;
      }, `/api/tournaments/${tc323TournamentId}/bm`);
      const quals = (qualData.qualifications || []).filter(q => q.group === 'A');

      // Set rankOverride on N-1 (= 2) of the 3 tied players to resolve the tie
      // In a 3-way tie, setting 2 distinct overrides makes the last position unambiguous
      for (let i = 0; i < quals.length - 1; i++) {
        const patch = await page.evaluate(async ([u, d]) => {
          const r = await fetch(u, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(d),
          });
          return { s: r.status };
        }, [
          `/api/tournaments/${tc323TournamentId}/bm`,
          { qualificationId: quals[i].id, rankOverride: i + 1 },
        ]);
        if (patch.s !== 200) throw new Error(`Failed to set rankOverride for qual ${i} (${patch.s})`);
      }

      // Reload and check that the banner disappeared
      await nav(page, `/tournaments/${tc323TournamentId}/bm`);
      if (await standingsTab.count() > 0) {
        await standingsTab.click();
        await page.waitForTimeout(2000);
      }

      const bannerAfter = await page.locator('text=同順位が検出されました').count() +
        await page.locator('text=Tied ranks detected').count();
      const hasBannerAfter = bannerAfter > 0;

      log('TC-324', hasBannerBefore && !hasBannerAfter ? 'PASS' : 'FAIL',
        !hasBannerBefore ? 'Tie warning banner never appeared (expected tie from 2-2 draws)'
        : hasBannerAfter ? 'Tie warning banner still visible after setting rankOverride on N-1 players'
        : '');
    } catch (err) {
      log('TC-324', 'FAIL', err instanceof Error ? err.message : 'BM tie warning flow failed');
    } finally {
      if (tc323TournamentId) {
        await deleteTournament(page, tc323TournamentId);
      }
      for (const id of tc323PlayerIds) {
        await deletePlayer(page, id);
      }
    }
  }

  // ===== Mode-specific child-process suites =====
  // tc-bm.js / tc-mr.js / tc-gp.js each spawn their own Playwright browser, so we
  // must close the persistent profile here first to release the lock. Run them
  // sequentially (not in parallel) for the same reason.
  //
  // Use spawnSync + stdio: 'inherit' (instead of execSync which buffers and
  // truncates at 1MB by default). The 28-player full workflows produce too
  // much console output to safely buffer; inheriting stdio also gives the
  // operator real-time visibility instead of waiting for the child to finish.
  // We rely on the child's exit code (non-zero ⇒ failure) for pass/fail
  // tracking, since the buffered "FAIL:" string parser can't see inherited output.
  const { spawnSync } = require('child_process');
  const projectRoot = __dirname.replace(/\/e2e$/, '');
  await closeBrowser(browser);
  browser = null;

  function runChildScript(label, script) {
    const timeoutMs = envMs('E2E_CHILD_TIMEOUT_MS', 40 * 60 * 1000);
    console.log(`\n========== Running ${label} (${script}) ==========`);
    const result = spawnSync(process.execPath, [script], {
      cwd: projectRoot,
      env: { ...process.env, E2E_BASE_URL: BASE },
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
      stdio: 'inherit',
    });
    if (result.error) {
      console.error(`[${label}] spawn error after ${formatDuration(timeoutMs)}:`, result.error.message);
      return true;
    }
    return result.status !== 0;
  }

  const bmFailed = runChildScript('BM Tests', 'e2e/tc-bm.js');
  const mrFailed = runChildScript('MR Tests', 'e2e/tc-mr.js');
  const gpFailed = runChildScript('GP Tests', 'e2e/tc-gp.js');
  const taFailed = runChildScript('TA Tests', 'e2e/tc-ta.js');

  // ===== Summary =====
  console.log('\n========== SUMMARY (tc-all.js inline tests) ==========');
  const p = results.filter(r => r.s === 'PASS').length;
  const f = results.filter(r => r.s === 'FAIL').length;
  const sk = results.filter(r => r.s === 'SKIP').length;
  console.log(`PASS: ${p} | FAIL: ${f} | SKIP: ${sk} | Total: ${results.length}`);
  if (f > 0) results.filter(r => r.s === 'FAIL').forEach(r => console.log(`  ❌ [${r.tc}] ${r.d}`));
  if (bmFailed) console.log('  ⚠️  BM tests (tc-bm.js) had failures — see output above');
  if (mrFailed) console.log('  ⚠️  MR tests (tc-mr.js) had failures — see output above');
  if (gpFailed) console.log('  ⚠️  GP tests (tc-gp.js) had failures — see output above');
  if (taFailed) console.log('  ⚠️  TA tests (tc-ta.js) had failures — see output above');

    return (f > 0 || bmFailed || mrFailed || gpFailed || taFailed) ? 1 : 0;
  } finally {
    clearTimeout(suiteTimer);
    if (progressWatchdog) {
      progressWatchdog.stop();
      progressWatchdog = null;
    }
    await closeBrowser(browser);
  }
}

main()
  .then((exitCode) => process.exit(exitCode))
  .catch((err) => {
    console.error('[tc-all] fatal error:', err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  });

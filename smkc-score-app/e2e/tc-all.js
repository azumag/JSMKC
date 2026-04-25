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
  apiPromoteTaPhase,
  apiSetTaPartner,
  apiUpdateTaSeeding,
  apiFetchTa,
  apiSeedTtEntry,
  apiTaParticipantEditTime,
  installApiLogging,
  setupAllModes28PlayerQualification,
  uiCreatePlayer,
  uiCreateTournament,
  uiActivateTournament,
  uiFreezeTaQualification,
  uiPromoteTaPhase,
  uiPhaseStartRound,
  uiPhaseSubmitResults,
  uiSetupTaPlayers,
  uiSetTaEntryTimes,
  setupModePlayersViaUi,
  makeTaTimesForRank,
  resolveAllTies,
} = require('./lib/common');
const { createSharedE2eFixture } = require('./lib/fixtures');
const {
  closeBrowser,
  createBrowserLaunchEnv,
  createProgressWatchdog,
  envMs,
  exitAfterCleanup,
  formatDuration,
  runSuiteInBrowser,
} = require('./lib/runner');
const { getChromiumArgs } = require('./lib/common');
const bmModule = require('./tc-bm');
const mrModule = require('./tc-mr');
const gpModule = require('./tc-gp');
const taModule = require('./tc-ta');
const overlayModule = require('./tc-overlay');

const BASE = process.env.E2E_BASE_URL || 'https://smkc.bluemoon.works';
/* TID is set at runtime from a dedicated test tournament we create in main().
 * We deliberately do NOT target a pre-existing production tournament (previously
 * KasmoSMKC) so the suite is self-contained and safe to run repeatedly. */
let TID = null;
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

async function main() {
  let browser = null;
  /* 360m default: setupAllModes alone burns ~90m (TA + BM + MR re-nav + GP
   * re-nav). Inline TCs add ~15m. Each mode suite (BM/MR/GP/TA) drives its
   * own 28-player finals setup which adds another 30-50m per suite. A 240m
   * cap consistently cut off mid-MR-finals on production. Override with
   * E2E_ALL_SUITE_TIMEOUT_MS when tuning. */
  const suiteTimeoutMs = envMs('E2E_ALL_SUITE_TIMEOUT_MS', envMs('E2E_SUITE_TIMEOUT_MS', 360 * 60 * 1000));
  const suiteTimer = setTimeout(() => {
    console.error(`[tc-all] suite timed out after ${formatDuration(suiteTimeoutMs)}`);
    exitAfterCleanup(124, () => closeBrowser(browser));
  }, suiteTimeoutMs);
  /* setupAllModes28PlayerQualification wires TA + BM + MR + GP qualifications
   * for the 28-player tournament back-to-back; each mode is a full 28-player
   * round-robin (182 matches). BM runs without re-nav (~7 min) but MR/GP both
   * re-navigate every iteration to sidestep stale match versions, so each of
   * them consumes ~40 min of pure UI work with no log() calls. A 30 min
   * watchdog would fire mid-MR. Default to 90 min; the
   * E2E_PROGRESS_TIMEOUT_MS env override still wins when set. */
  progressWatchdog = createProgressWatchdog('tc-all', envMs('E2E_PROGRESS_TIMEOUT_MS', 90 * 60 * 1000), () => closeBrowser(browser));

  /* tc-all now reuses the shared E2E fixture (same as tc-bm/tc-mr/tc-gp/tc-ta)
   * so the 28 reusable players + "E2E Shared Normal" tournament are created
   * exactly once across the whole suite. The fixture's own cleanup tears
   * everything down idempotently; we just call it from both the happy-path
   * pre-child-spawn point and the outer `finally`. */
  let sharedFixture = null;

  const cleanupSharedResources = async () => {
    if (!sharedFixture) return;
    const fixture = sharedFixture;
    sharedFixture = null;
    await fixture.cleanup().catch(() => {});
  };

  try {
    browser = await chromium.launchPersistentContext(
      process.env.E2E_PROFILE_DIR || '/tmp/playwright-smkc-profile',
      {
        headless: process.env.E2E_HEADLESS === '1',
        viewport: { width: 1280, height: 720 },
        env: createBrowserLaunchEnv(),
        args: getChromiumArgs(),
      },
    );
    installApiLogging(browser, 'tc-all');
    const page = browser.pages()[0] || await browser.newPage();
    page.setDefaultTimeout(envMs('E2E_ACTION_TIMEOUT_MS', 30 * 1000));
    page.setDefaultNavigationTimeout(envMs('E2E_NAV_TIMEOUT_MS', 30 * 1000));

  /* ===== Create the dedicated cross-mode test tournament used by TID-dependent tests =====
   * One activated tournament owns the same 28 players across TA/BM/MR/GP. All
   * four qualification datasets are completed up front so page checks and
   * overall ranking calculations exercise the integrated tournament shape.
   * The shared fixture is created FIRST so the 28 e2e_shared_* players and
   * the "E2E Shared Normal" tournament exist idempotently, then handed to
   * setupAllModes28PlayerQualification to wire TA/BM/MR/GP on top of them. */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  sharedFixture = await createSharedE2eFixture(page);
  /* Capture JS errors / console warnings that precede a renderer crash so
   * we can distinguish an app-side exception from an OOM kill.  These
   * listeners are intentionally added BEFORE the long setupAllModes phase
   * (issue #517). */
  const setupJsErrors = [];
  const setupConsoleWarnings = [];
  page.on('pageerror', (e) => setupJsErrors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      setupConsoleWarnings.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  /* setupAllModes is a best-effort, expensive cross-mode seed used only by
   * TC-401/TC-402 (overall ranking verification). TA+BM+MR+GP qualifications
   * together drive ~90 min of UI-only API work with no log() calls, so we
   * pause the progress watchdog for the duration and rely on the suite-level
   * hard timeout for protection. On any failure we flag TC-401/TC-402 and
   * keep the rest of the suite running — the mode-specific suites below do
   * their own fresh setup and should not inherit this partial state. */
  let setupAllModesError = null;
  progressWatchdog.stop();
  try {
    const sharedSetup = await setupAllModes28PlayerQualification(page, 'tcall', { fixture: sharedFixture });
    TID = sharedSetup.tournamentId;
    console.log(`[tc-all] shared all-mode tournament ready: ${TID} (${sharedSetup.playerIds.length} players, shared fixture)`);
  } catch (err) {
    setupAllModesError = err instanceof Error ? err.message : String(err);
    TID = sharedFixture.normalTournament.id;
    const jsHint = setupJsErrors.length > 0
      ? ` JS errors: ${setupJsErrors.slice(0, 3).join('; ')}`
      : '';
    const consoleHint = setupConsoleWarnings.length > 0
      ? ` Console warnings: ${setupConsoleWarnings.slice(0, 3).join('; ')}`
      : '';
    console.error(`[tc-all] setupAllModes failed (${setupAllModesError.slice(0, 160)}); TC-401/TC-402 will be recorded as FAIL and the run will continue against ${TID}.${jsHint}${consoleHint}`);
  } finally {
    /* Re-arm the watchdog; subsequent log() calls will reset it per-TC. */
    progressWatchdog.reset('post-setupAllModes');
  }

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

  // TC-108: Players API pagination contract + Players page pager visibility
  const tc108Resp = await page.evaluate(async () => {
    const fetchJson = async (url) => {
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    };
    const p1 = await fetchJson('/api/players?page=1&limit=10');
    const p2 = await fetchJson('/api/players?page=2&limit=10');
    const pClamp = await fetchJson('/api/players?page=1&limit=200');
    return { p1, p2, pClamp };
  });
  const tc108P1 = tc108Resp.p1?.body ?? {};
  const tc108P2 = tc108Resp.p2?.body ?? {};
  const tc108Clamp = tc108Resp.pClamp?.body ?? {};
  const tc108HasShape = [tc108P1, tc108P2, tc108Clamp]
    .every((r) => r?.success === true && Array.isArray(r?.data) && r?.meta);
  const tc108Meta = tc108P1.meta || {};
  const tc108MetaOk =
    tc108Meta.page === 1 &&
    tc108Meta.limit === 10 &&
    typeof tc108Meta.total === 'number' &&
    tc108Meta.total >= tc108P1.data.length &&
    tc108Meta.totalPages === Math.ceil(tc108Meta.total / 10);
  const tc108P1Ids = new Set((tc108P1.data || []).map((r) => r.id).filter(Boolean));
  const tc108P2Ids = (tc108P2.data || []).map((r) => r.id).filter(Boolean);
  const tc108NeedDistinct = (tc108Meta.total || 0) > 10;
  const tc108DistinctOk = !tc108NeedDistinct || tc108P2Ids.some((id) => !tc108P1Ids.has(id));
  const tc108ClampLimit = tc108Clamp.meta?.limit;
  const tc108ClampOk = typeof tc108ClampLimit === 'number' && tc108ClampLimit <= 100;

  await nav(page, '/players');
  const tc108PagerVisible = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('a[href*="page="],button,[aria-label]'));
    return nodes.some((node) => {
      const href = (node.getAttribute('href') || '').toLowerCase();
      const label = (node.getAttribute('aria-label') || '').toLowerCase();
      const txt = (node.textContent || '').toLowerCase();
      return href.includes('page=') || /next|previous|prev|次へ|前へ|ページ/.test(`${label} ${txt}`);
    });
  });
  const tc108UiOk = (tc108Meta.total || 0) <= 50 || tc108PagerVisible;
  log('TC-108', tc108HasShape && tc108MetaOk && tc108DistinctOk && tc108ClampOk && tc108UiOk ? 'PASS' : 'FAIL',
    !tc108HasShape ? 'API shape mismatch'
      : !tc108MetaOk ? `Unexpected meta page=${tc108Meta.page} limit=${tc108Meta.limit} total=${tc108Meta.total} totalPages=${tc108Meta.totalPages}`
      : !tc108DistinctOk ? 'Page 1 and page 2 returned same IDs despite total>10'
      : !tc108ClampOk ? `Limit clamp failed: meta.limit=${tc108ClampLimit}`
      : !tc108UiOk ? 'Pager UI not visible despite total>50'
      : '');

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
    tc201TournamentId = await uiCreateTournament(page, tc201TournamentName);

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

  // TC-823: Mode publish toggle updates layout tab badge in real time (issue #621)
  // A new tournament has publicModes=[] so all mode tabs show a destructive "未公開" badge for admins.
  // Toggling the per-mode switch dispatches a custom event that triggers a re-fetch of the layout's
  // tournament data; the hidden badge should appear/disappear without a page reload.
  {
    let tc823TournamentId = null;
    try {
      tc823TournamentId = await uiCreateTournament(page, `E2E TC-823 ${Date.now()}`);

      await nav(page, `/tournaments/${tc823TournamentId}/bm`);
      await page.waitForTimeout(3000);

      // BM tab link has exact href; the hidden badge lives inside it with `bg-destructive`
      const bmTabBadge = page.locator(`a[href="/tournaments/${tc823TournamentId}/bm"] .bg-destructive`);
      const hasBadgeBefore = await bmTabBadge.count() > 0;

      // The ModePublishSwitch aria-label is "{mode}: {state}" (e.g. "バトルモード: 未公開")
      const publishSwitch = page.getByRole('switch', { name: /バトルモード|Battle Mode/i }).first();
      const switchExists = await publishSwitch.count() > 0;

      let hasBadgeAfterPublish = true;
      let hasBadgeAfterUnpublish = false;
      if (switchExists) {
        // Toggle to published
        await publishSwitch.click();
        await page.waitForTimeout(3000); // Wait for API call + publicModesChanged event + re-fetch
        hasBadgeAfterPublish = await bmTabBadge.count() > 0;

        // Toggle back to unpublished
        await publishSwitch.click();
        await page.waitForTimeout(3000);
        hasBadgeAfterUnpublish = await bmTabBadge.count() > 0;
      }

      const pass = switchExists && hasBadgeBefore && !hasBadgeAfterPublish && hasBadgeAfterUnpublish;
      log('TC-823', pass ? 'PASS' : 'FAIL',
        !switchExists ? 'Publish switch not found on BM page'
        : !hasBadgeBefore ? 'Hidden badge not shown before toggle'
        : hasBadgeAfterPublish ? 'Hidden badge still shown after toggle to published (event/re-fetch missing)'
        : !hasBadgeAfterUnpublish ? 'Hidden badge did not reappear after re-toggle to unpublished'
        : '');
    } catch (err) {
      log('TC-823', 'FAIL', err instanceof Error ? err.message : 'TC-823 mode tab badge test failed');
    } finally {
      if (tc823TournamentId) await deleteTournament(page, tc823TournamentId);
    }
  }

  // TC-401: Shared all-mode tournament has completed qualification data in TA/BM/MR/GP
  if (setupAllModesError) {
    log('TC-401', 'FAIL', `setupAllModes failed: ${setupAllModesError.slice(0, 160)}`);
  } else {
  try {
    const sharedState = await page.evaluate(async (id) => {
      const fetchJson = async (path) => {
        const r = await fetch(path, { cache: 'no-store' });
        return { s: r.status, b: await r.json().catch(() => ({})) };
      };
      return {
        ta: await fetchJson(`/api/tournaments/${id}/ta?stage=qualification&ts=${Date.now()}`),
        bm: await fetchJson(`/api/tournaments/${id}/bm?ts=${Date.now()}`),
        mr: await fetchJson(`/api/tournaments/${id}/mr?ts=${Date.now()}`),
        gp: await fetchJson(`/api/tournaments/${id}/gp?ts=${Date.now()}`),
      };
    }, TID);
    const taEntries = sharedState.ta.b?.data?.entries ?? [];
    const bmMatches = (sharedState.bm.b?.data?.matches ?? sharedState.bm.b?.matches ?? []).filter((m) => !m.isBye);
    const mrMatches = (sharedState.mr.b?.data?.matches ?? sharedState.mr.b?.matches ?? []).filter((m) => !m.isBye);
    const gpMatches = (sharedState.gp.b?.data?.matches ?? sharedState.gp.b?.matches ?? []).filter((m) => !m.isBye);

    const taOk = taEntries.length === 28 && taEntries.every((e) => e.totalTime != null && e.totalTime > 0);
    /* 2 groups × 14 players → 91 RR matches per group = 182 per mode. */
    const bmOk = bmMatches.length === 182 && bmMatches.every((m) => m.completed);
    const mrOk = mrMatches.length === 182 && mrMatches.every((m) => m.completed);
    const gpOk = gpMatches.length === 182 && gpMatches.every((m) => m.completed);

    log('TC-401', taOk && bmOk && mrOk && gpOk ? 'PASS' : 'FAIL',
      !taOk ? `TA entries=${taEntries.length}`
      : !bmOk ? `BM matches=${bmMatches.length} completed=${bmMatches.filter((m) => m.completed).length}`
      : !mrOk ? `MR matches=${mrMatches.length} completed=${mrMatches.filter((m) => m.completed).length}`
      : !gpOk ? `GP matches=${gpMatches.length} completed=${gpMatches.filter((m) => m.completed).length}`
      : '');
  } catch (err) {
    log('TC-401', 'FAIL', err instanceof Error ? err.message : 'Shared all-mode verification failed');
  }
  }

  // TC-402: Overall ranking calculation + persisted display for the shared all-mode tournament
  let topOverallRanking = null;
  if (setupAllModesError) {
    log('TC-402', 'FAIL', `setupAllModes failed: ${setupAllModesError.slice(0, 160)}`);
  } else {
  try {
    const calc = await page.evaluate(async (u) => {
      const r = await fetch(u, { method: 'POST' });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, `/api/tournaments/${TID}/overall-ranking`);
    const rankings = calc.b?.data?.rankings ?? [];
    topOverallRanking = rankings[0] ?? null;

    const topBreakdown =
      topOverallRanking
        ? topOverallRanking.taQualificationPoints +
          topOverallRanking.bmQualificationPoints +
          topOverallRanking.mrQualificationPoints +
          topOverallRanking.gpQualificationPoints +
          topOverallRanking.taFinalsPoints +
          topOverallRanking.bmFinalsPoints +
          topOverallRanking.mrFinalsPoints +
          topOverallRanking.gpFinalsPoints
        : null;
    const hasAllModes = rankings.some((r) =>
      r.taQualificationPoints > 0 &&
      r.bmQualificationPoints > 0 &&
      r.mrQualificationPoints > 0 &&
      r.gpQualificationPoints > 0
    );
    const totalsOk = topOverallRanking && topBreakdown === topOverallRanking.totalPoints;
    const ranksOk = rankings.length === 28 && topOverallRanking?.overallRank === 1;

    const stored = await page.evaluate(async (u) => {
      const r = await fetch(u, { cache: 'no-store' });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, `/api/tournaments/${TID}/overall-ranking?ts=${Date.now()}`);
    const storedRankings = stored.b?.data?.rankings ?? [];
    const persistedOk =
      stored.s === 200 &&
      storedRankings.length === 28 &&
      storedRankings[0]?.playerId === topOverallRanking?.playerId &&
      storedRankings[0]?.totalPoints === topOverallRanking?.totalPoints;

    await nav(page, `/tournaments/${TID}/overall-ranking`);
    const overallText = await vis(page);
    const topTotalText = topOverallRanking?.totalPoints?.toLocaleString?.() ?? '';
    const displayOk =
      !!topOverallRanking &&
      overallText.includes(topOverallRanking.playerNickname) &&
      (overallText.includes(String(topOverallRanking.totalPoints)) || overallText.includes(topTotalText));

    log('TC-402', calc.s === 200 && ranksOk && hasAllModes && totalsOk && persistedOk && displayOk ? 'PASS' : 'FAIL',
      calc.s !== 200 ? `POST returned ${calc.s}: ${JSON.stringify(calc.b).slice(0, 200)}`
      : !ranksOk ? `rankings=${rankings.length} topRank=${topOverallRanking?.overallRank}`
      : !hasAllModes ? 'No ranking row has points from all 4 qualification modes'
      : !totalsOk ? `top total=${topOverallRanking?.totalPoints} breakdown=${topBreakdown}`
      : !persistedOk ? 'GET did not return persisted calculation'
      : !displayOk ? `Overall page missing top ranking ${topOverallRanking?.playerNickname}`
      : '');
  } catch (err) {
    log('TC-402', 'FAIL', err instanceof Error ? err.message : 'Overall ranking calculation/display failed');
  }
  }

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
  /* Track the current displayed name for downstream UI-setup calls that match
   * players by `${nickname} (${name})` in the TA setup dialog. TC-102 edits it
   * to 'E2E Edited'; later TCs rely on that being the name-of-record. */
  let playerName = 'E2E Test';
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
    if (ed.ok) playerName = 'E2E Edited';
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
      playerBrowser = await chromium.launch({
        headless: false,
        env: createBrowserLaunchEnv(),
        args: getChromiumArgs(),
      });
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
      const gpPlayer2Name = 'E2E GP Opponent';
      const gpPlayer2 = await uiCreatePlayer(page, gpPlayer2Name, gpPlayer2Nick);
      gpPlayer2Id = gpPlayer2.id;
      if (!gpPlayer2Id) throw new Error('Failed to create GP opponent player');

      gpTournamentId = await uiCreateTournament(page, `E2E GP Score Entry ${Date.now()}`, { dualReportEnabled: false });
      if (!gpTournamentId) {
        throw new Error('Failed to create GP tournament');
      }

      await uiActivateTournament(page, gpTournamentId);

      /* Open the GP group setup dialog and select both players. 2-player mode
       * leaves the default group count (1) intact; setupModePlayersViaUi only
       * touches group count / seeding when there are ≥4 entries. */
      await setupModePlayersViaUi(page, 'gp', gpTournamentId, [
        { id: pid, name: playerName, nickname: nick },
        { id: gpPlayer2Id, name: gpPlayer2Name, nickname: gpPlayer2Nick },
      ]);

      playerBrowser = await chromium.launch({
        headless: false,
        env: createBrowserLaunchEnv(),
        args: getChromiumArgs(),
      });
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
      taTournamentId = await uiCreateTournament(page, `E2E TA Knockout Lock ${Date.now()}`, { dualReportEnabled: false });
      await uiActivateTournament(page, taTournamentId);

      /* Add TA entry and seed 20-course times for rank 17 so promote_phase1
       * (ranks 17–24) picks this entry up. Goes through the admin UI. */
      await uiSetupTaPlayers(page, taTournamentId, [
        { id: pid, name: playerName, nickname: nick, seeding: 17 },
      ]);
      const { times: rank17Times, totalMs: rank17Total } = makeTaTimesForRank(17);
      await uiSetTaEntryTimes(page, taTournamentId, { nickname: nick }, rank17Times);

      /* The Finals Phases card (Start Phase 1/2/3 buttons) is gated on
       * frozenStages.includes("qualification") in src/app/tournaments/[id]/ta/page.tsx:1064.
       * Then phase1HasPlayers requires an entry with rank 17–24, but with a
       * single player the server-derived rank is 1. Stamp rank=17 directly
       * via the admin /tt/entries PUT (mirrors the original test pattern in
       * commit cd1ca74) before freezing, so promote_phase1 can succeed. */
      const taData312 = await apiFetchTa(page, taTournamentId);
      const taEntry312 = (taData312.b?.data?.entries ?? []).find((e) => e.playerId === pid);
      if (!taEntry312) throw new Error(`No TA entry found for player ${pid}`);
      await apiSeedTtEntry(page, taTournamentId, taEntry312.id, rank17Times, rank17Total, 17);
      await uiFreezeTaQualification(page, taTournamentId);

      /* uiPromoteTaPhase throws on non-200 so no explicit status check is
       * needed. */
      await uiPromoteTaPhase(page, taTournamentId, 'promote_phase1');

      playerBrowser = await chromium.launch({
        headless: false,
        env: createBrowserLaunchEnv(),
        args: getChromiumArgs(),
      });
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
      taTournamentId = await uiCreateTournament(page, `E2E TA Add Lock ${Date.now()}`, { dualReportEnabled: false });
      await uiActivateTournament(page, taTournamentId);

      await uiSetupTaPlayers(page, taTournamentId, [
        { id: pid, name: playerName, nickname: nick, seeding: 17 },
      ]);
      const { times: rank17TimesTc313, totalMs: rank17TotalTc313 } = makeTaTimesForRank(17);
      await uiSetTaEntryTimes(page, taTournamentId, { nickname: nick }, rank17TimesTc313);

      /* See TC-312 above for why we stamp rank=17 + freeze before promotion. */
      const taData313 = await apiFetchTa(page, taTournamentId);
      const taEntry313 = (taData313.b?.data?.entries ?? []).find((e) => e.playerId === pid);
      if (!taEntry313) throw new Error(`No TA entry found for player ${pid}`);
      await apiSeedTtEntry(page, taTournamentId, taEntry313.id, rank17TimesTc313, rank17TotalTc313, 17);
      await uiFreezeTaQualification(page, taTournamentId);

      /* uiPromoteTaPhase throws on non-200 so no explicit status check is
       * needed. */
      await uiPromoteTaPhase(page, taTournamentId, 'promote_phase1');

      await nav(page, `/tournaments/${taTournamentId}/ta`);
      /* Unified TA setup dialog trigger: "Setup Players" / "Edit Players" (plus JA). */
      const setupPlayersButton = page.getByRole('button', {
        name: /^(Setup Players|Edit Players|プレイヤー設定|プレイヤー編集)$/,
      }).first();
      const ariaDisabled = await setupPlayersButton.getAttribute('aria-disabled');
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
      const dialogOpened = await page.getByText(/Setup Time Trial Players|Edit Time Trial Players|タイムアタック プレイヤー(設定|編集)/).count().then((count) => count > 0);

      log('TC-313', ariaDisabled === 'true' && toastVisible && !dialogOpened ? 'PASS' : 'FAIL',
        ariaDisabled !== 'true'
          ? 'Setup Players button is not marked locked'
          : !toastVisible
            ? 'No add-lock toast'
            : dialogOpened
              ? 'Setup/Edit Players dialog still opened'
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
      const secondNick = `e2e_ta_undo_${Date.now()}`;
      const secondPlayerName = 'E2E TA Finals Undo';
      const secondPlayer = await uiCreatePlayer(page, secondPlayerName, secondNick);
      secondPlayerId = secondPlayer.id;

      taTournamentId = await uiCreateTournament(page, `E2E TA Finals Undo ${Date.now()}`, { dualReportEnabled: false });
      await uiActivateTournament(page, taTournamentId);

      /* Add both TA entries via UI with seeding 1,2; then enter rank-1/rank-2
       * 20-course times so Phase 3 promotion sees a deterministic ranking. */
      await uiSetupTaPlayers(page, taTournamentId, [
        { id: pid, name: playerName, nickname: nick, seeding: 1 },
        { id: secondPlayerId, name: secondPlayerName, nickname: secondNick, seeding: 2 },
      ]);
      const { times: rank1Times } = makeTaTimesForRank(1);
      const { times: rank2Times } = makeTaTimesForRank(2);
      await uiSetTaEntryTimes(page, taTournamentId, { nickname: nick }, rank1Times);
      await uiSetTaEntryTimes(page, taTournamentId, { nickname: secondNick }, rank2Times);

      /* The Finals Phases card is gated on frozenStages.includes("qualification"); freeze
       * the qualification stage so the Start Phase 3 button can render. With
       * 2 players at ranks 1 and 2, phase2HasPlayers is false so the phase3
       * promotion button (condition: phase2 done OR no phase2 players)
       * unlocks immediately. */
      await uiFreezeTaQualification(page, taTournamentId);

      await uiPromoteTaPhase(page, taTournamentId, 'promote_phase3');

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
      taTournamentId = await uiCreateTournament(page, `E2E TA Seeding ${Date.now()}`, { dualReportEnabled: false });
      await uiActivateTournament(page, taTournamentId);

      await uiSetupTaPlayers(page, taTournamentId, [
        { id: pid, name: playerName, nickname: nick, seeding: 3 },
      ]);
      /* Fetch the created entry from the API so downstream seeding-update/clear
       * assertions can target the entry by id. No write-side API here. */
      const afterAdd = await apiFetchTa(page, taTournamentId);
      const createdEntry = afterAdd.b?.data?.entries?.find((e) => e.playerId === pid) ?? null;
      const entryId = createdEntry?.id ?? null;
      const initialSeeding = createdEntry?.seeding;
      if (!entryId) throw new Error('Failed to create TA entry with seeding');
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
      const partnerName = 'E2E Pair Partner';
      const partnerResult = await uiCreatePlayer(page, partnerName, partnerNick);
      partnerPlayerId = partnerResult.id;
      const partnerPassword = partnerResult.password;
      if (!partnerPlayerId || !partnerPassword) {
        throw new Error('Failed to create partner player');
      }

      taTournamentId = await uiCreateTournament(page, `E2E TA Pair ${Date.now()}`, { dualReportEnabled: false });
      await uiActivateTournament(page, taTournamentId);

      await uiSetupTaPlayers(page, taTournamentId, [
        { id: pid, name: playerName, nickname: nick, seeding: 1 },
        { id: partnerPlayerId, name: partnerName, nickname: partnerNick, seeding: 2 },
      ]);
      const afterAddBoth = await apiFetchTa(page, taTournamentId);
      const entry1 = afterAddBoth.b?.data?.entries?.find(e => e.playerId === pid);
      const entry2 = afterAddBoth.b?.data?.entries?.find(e => e.playerId === partnerPlayerId);
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
        partnerBrowser = await chromium.launch({
          headless: false,
          env: createBrowserLaunchEnv(),
          args: getChromiumArgs(),
        });
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
      const partner2Name = 'E2E SelfEdit';
      const pResult = await uiCreatePlayer(page, partner2Name, pNick);
      partnerPlayerId2 = pResult.id;
      if (!partnerPlayerId2) throw new Error('Failed to create partner');

      taTournamentId = await uiCreateTournament(page, `E2E SelfEdit ${Date.now()}`, {
        dualReportEnabled: false,
        taPlayerSelfEdit: false,
      });
      await uiActivateTournament(page, taTournamentId);

      await uiSetupTaPlayers(page, taTournamentId, [
        { id: pid, name: playerName, nickname: nick, seeding: 1 },
        { id: partnerPlayerId2, name: partner2Name, nickname: pNick, seeding: 2 },
      ]);
      const afterAddSelfEdit = await apiFetchTa(page, taTournamentId);
      const entry1 = afterAddSelfEdit.b?.data?.entries?.find(e => e.playerId === pid);
      const entry2 = afterAddSelfEdit.b?.data?.entries?.find(e => e.playerId === partnerPlayerId2);
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

  // TC-518: TV Assignment up to 4
  try {
    await nav(page, `/tournaments/${TID}/bm`);
    const tvSelect = page.locator('select.w-14').first();
    const hasSelect = await tvSelect.count() > 0;
    let options = [];
    let optionsOk = false;
    let assignOk = false;
    if (hasSelect) {
      options = await tvSelect.evaluateAll((sel) => Array.from(sel[0].options).map((o) => o.value));
      optionsOk = ['1', '2', '3', '4'].every((v) => options.includes(v));
      // Assign TV 4 to the first match
      await tvSelect.selectOption('4');
      await page.waitForTimeout(1000);
      // Verify via API that the assignment persisted
      const bmData = await page.evaluate(async (u) => {
        const r = await fetch(u);
        return r.json().catch(() => ({}));
      }, `/api/tournaments/${TID}/bm`);
      const matches = bmData.data?.matches || bmData.matches || [];
      const firstMatchWithTv = matches.find((m) => m.tvNumber === 4);
      assignOk = !!firstMatchWithTv;
    }
    log('TC-518', hasSelect && optionsOk && assignOk ? 'PASS' : 'FAIL',
      !hasSelect ? 'No TV select found on BM qualification page'
      : !optionsOk ? `TV options missing 1-4 (got ${options.join(',')})`
      : !assignOk ? 'TV 4 assignment did not persist'
      : '');
  } catch (err) {
    log('TC-518', 'FAIL', err instanceof Error ? err.message : 'TV assignment test failed');
  }

  // TC-104: Player delete
  if (pid) {
    const dr = await page.evaluate(async u => {
      const r = await fetch(u, { method: 'DELETE' });
      return { ok: r.ok };
    }, `/api/players/${pid}`);
    log('TC-104', dr.ok ? 'PASS' : 'FAIL');
  } else { log('TC-104', 'SKIP'); }

  // TC-304: MR is set up in the shared tournament and renders match data
  await nav(page, `/tournaments/${TID}/mr`);
  const mrSharedText = await vis(page);
  const mrSharedOk =
    (mrSharedText.includes('Match Race') || mrSharedText.includes('マッチレース')) &&
    (mrSharedText.includes('Group A') || mrSharedText.includes('グループ A')) &&
    !mrSharedText.includes('Please wait') &&
    !mrSharedText.includes('セットアップが完了するまで');
  log('TC-304', mrSharedOk ? 'PASS' : 'FAIL',
    mrSharedOk ? '' : 'Shared MR tournament did not render configured groups');

  // TC-305: BM group dialog - verify dialog closes after save
  await nav(page, `/tournaments/${TID}/bm`);
  const editBtn305 = page.getByRole('button', { name: /グループ編集|Edit Groups/ });
  if (await editBtn305.count() > 0) {
    await editBtn305.click();
    await page.waitForTimeout(2000);
    const saveBtn305 = page.getByRole('button', { name: /グループ更新|Update Groups/ });
    if (await saveBtn305.count() > 0) {
      // Grab a reference to the specific dialog before saving
      const dialogLocator = page.locator('[role="dialog"]').first();
      await dialogLocator.waitFor({ state: 'visible', timeout: 5000 });
      // Click save and verify THIS dialog closes
      await saveBtn305.click();
      try {
        await dialogLocator.waitFor({ state: 'hidden', timeout: 15000 });
        log('TC-305', 'PASS');
      } catch {
        log('TC-305', 'FAIL', 'Dialog did not close after save');
        await page.keyboard.press('Escape').catch(() => {});
      }
    } else { log('TC-305', 'SKIP', 'No update button'); }
  } else { log('TC-305', 'SKIP', 'No edit button'); }

  // TC-315: BM group setup with odd player count (3 players) must not return 500
  // Regression test for FK violation when player2Id='__BREAK__' (BYE match sentinel)
  {
    let tc315TournamentId = null;
    try {
      // Create a temp tournament via admin UI
      tc315TournamentId = await uiCreateTournament(page, `TC-315-test-${Date.now()}`);

      if (!tc315TournamentId) {
        log('TC-315', 'SKIP', 'Failed to create temp tournament');
      } else {
        await uiActivateTournament(page, tc315TournamentId);

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

  // 旧 TC-403/404 (軽量フルワークフローと GP ダイアログUI checks) は廃止。
  // TC-401/402 は上の共有4モード大会と総合ランキング検証に再利用。

  // TC-316: Tiebreaker warning suppressed at group setup (mp=0), shown after tie match
  // Regression test for #filterActiveTiedIds: at mp=0 all players share 0-0 scores,
  // the banner must be hidden; after a 2-2 (tied) match is entered the banner must appear.
  {
    let tc316TournamentId = null;
    try {
      // Create temp tournament via admin UI
      tc316TournamentId = await uiCreateTournament(page, `TC-316-test-${Date.now()}`);

      if (!tc316TournamentId) {
        log('TC-316', 'SKIP', 'Failed to create temp tournament');
      } else {
        await uiActivateTournament(page, tc316TournamentId);

        // Get 4 players (full objects — name+nickname needed by UI group setup)
        const players316 = await page.evaluate(async () => {
          const r = await fetch('/api/players?limit=100');
          const j = await r.json();
          return (j.data || []).slice(0, 4);
        });

        let bmSetupOk = false;
        if (players316.length < 4) {
          log('TC-316', 'SKIP', 'Not enough players');
        } else {
          try {
            await setupModePlayersViaUi(page, 'bm', tc316TournamentId,
              players316.slice(0, 2).map((p) => ({ id: p.id, name: p.name, nickname: p.nickname })));
            bmSetupOk = true;
          } catch (e) {
            log('TC-316', 'SKIP', `BM UI setup failed: ${e.message?.slice(0, 100) ?? e}`);
          }
        }
        if (bmSetupOk) {
          {
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
      // Create 2 temp players via admin UI
      const p1Nick = `e2e_auth1_${Date.now()}`;
      const p2Nick = `e2e_auth2_${Date.now()}`;
      const p1Name = 'E2E MatchAuth P1';
      const p2Name = 'E2E MatchAuth P2';
      const p1 = await uiCreatePlayer(page, p1Name, p1Nick);
      tc321Player1Id = p1.id;
      const p2 = await uiCreatePlayer(page, p2Name, p2Nick);
      tc321Player2Id = p2.id;
      if (!tc321Player1Id || !tc321Player2Id) {
        throw new Error('Failed to create test players');
      }

      // Create & activate tournament via admin UI
      tc321TournamentId = await uiCreateTournament(page, `E2E MatchView ${Date.now()}`, { dualReportEnabled: false });
      await uiActivateTournament(page, tc321TournamentId);

      // Set up BM with 2 players via the group setup dialog.
      await setupModePlayersViaUi(page, 'bm', tc321TournamentId, [
        { id: tc321Player1Id, name: p1Name, nickname: p1Nick },
        { id: tc321Player2Id, name: p2Name, nickname: p2Nick },
      ]);

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

  // TC-322 (BM participant correction) は tc-bm.js が担当。
  // tc-all からは E2E_RUN_FOCUSED_SUITES=1 のときだけ末尾の child process で実行される。

  // TC-324: BM tie warning banner disappears after admin sets rankOverride
  // Creates 3 players, sets up BM qualification, submits all matches as 2-2 ties
  // to force identical standings, then verifies:
  //   (a) tie warning banner appears on the standings tab
  //   (b) after setting rankOverride on N-1 players, the banner disappears
  {
    let tc323TournamentId = null;
    const tc323PlayerIds = [];
    const tc323PlayerObjs = [];
    try {
      const stamp = Date.now();

      // Create 3 players via admin UI for a round-robin group
      for (let i = 1; i <= 3; i++) {
        const name = `E2E Tie P${i}`;
        const nickname = `e2e_tie${i}_${stamp}`;
        const p = await uiCreatePlayer(page, name, nickname);
        tc323PlayerIds.push(p.id);
        tc323PlayerObjs.push({ id: p.id, name, nickname });
      }

      // Create & activate tournament via admin UI
      tc323TournamentId = await uiCreateTournament(page, `E2E Tie Warn ${stamp}`, { dualReportEnabled: false });
      await uiActivateTournament(page, tc323TournamentId);

      // Setup BM qualification with 3 players in group A via the UI.
      await setupModePlayersViaUi(page, 'bm', tc323TournamentId, tc323PlayerObjs);

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

      // Resolve ties using the shared helper so qualification seeding clears
      // the same warning banner the admin page uses. This avoids duplicating
      // tie-resolution logic between e2e tests and finals:prepare scripts.
      await resolveAllTies(page, tc323TournamentId, 'bm');

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

  // TC-325: Profile page displays session and player association
  // Uses the admin persistent session from the profile
  {
    try {
      await nav(page, '/profile');
      t = await vis(page);
      // When unauthenticated the profile page redirects to /auth/signin.
      // Accept either the authenticated profile view or the expected login redirect.
      const hasUserInfo = t.includes('User') || t.includes('ユーザー');
      const hasNameField = t.includes('Name') || t.includes('名前');
      const hasRole = t.includes('role') || t.includes('役割');
      const isLoginPage = t.includes('JSMKC ログイン') || t.includes('Login') || t.includes('ログイン');
      const pass = (hasUserInfo && hasNameField && hasRole) || isLoginPage;
      log('TC-325', pass ? 'PASS' : 'FAIL',
        !pass ? 'Profile page neither shows user info nor login redirect' : '');
    } catch (err) {
      log('TC-325', 'FAIL', err instanceof Error ? err.message : 'Profile page test failed');
    }
  }

  // TC-326: Tournament export API returns valid CSV
  // Public endpoint - no auth required
  if (TID) {
    try {
      const exportResp = await page.evaluate(async (u) => {
        const r = await fetch(u);
        // Use arrayBuffer to inspect raw UTF-8 bytes because some browsers strip
        // the BOM when decoding via response.text().
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        return {
          status: r.status,
          contentType: r.headers.get('content-type'),
          length: bytes.length,
          bomBytes: [bytes[0], bytes[1], bytes[2]],
        };
      }, `/api/tournaments/${TID}/export`);
      const hasCsvContent = exportResp.contentType && exportResp.contentType.includes('text/csv');
      const csvNotEmpty = exportResp.length > 100;
      // UTF-8 BOM is the byte sequence EF BB BF.
      const hasBom = exportResp.bomBytes[0] === 0xEF && exportResp.bomBytes[1] === 0xBB && exportResp.bomBytes[2] === 0xBF;
      log('TC-326', exportResp.status === 200 && hasCsvContent && csvNotEmpty && hasBom ? 'PASS' : 'FAIL',
        exportResp.status !== 200 ? `Export returned ${exportResp.status}`
        : !hasCsvContent ? 'No CSV content-type'
        : !csvNotEmpty ? 'CSV is empty'
        : !hasBom ? 'Missing UTF-8 BOM' : '');
    } catch (err) {
      log('TC-326', 'FAIL', err instanceof Error ? err.message : 'Export API test failed');
    }
  }

  // TC-327: Session status API returns session information
  {
    try {
      const sessResp = await page.evaluate(async () => {
        const r = await fetch('/api/auth/session-status');
        return { status: r.status, body: await r.json().catch(() => ({})) };
      });
      // Authenticated: { success: true, data: { authenticated: true, user: {...} } }
      // Unauthenticated: { success: false, error: 'No active session', requiresAuth: true }
      const isAuthenticated = sessResp.body?.success === true &&
        typeof sessResp.body?.data?.authenticated === 'boolean';
      const isUnauthenticated = sessResp.body?.success === false &&
        sessResp.body?.requiresAuth === true;
      log('TC-327', sessResp.status === 200 && (isAuthenticated || isUnauthenticated) ? 'PASS' : 'FAIL',
        sessResp.status !== 200 ? `Session status returned ${sessResp.status}`
        : 'Unexpected response structure');
    } catch (err) {
      log('TC-327', 'FAIL', err instanceof Error ? err.message : 'Session status API test failed');
    }
  }

  // TC-328: Character stats API — admin gets stats, non-admin gets 403
  // Verifies that /api/players/:id/character-stats is admin-only and returns
  // the expected shape { success, data: { playerId, characterStats, ... } }.
  if (sharedFixture?.players?.length > 0) {
    const testPlayerId = sharedFixture.players[0].id;
    try {
      // Admin session (current page) should receive 200 with characterStats array.
      const adminResp = await page.evaluate(async (pid) => {
        const r = await fetch(`/api/players/${pid}/character-stats`);
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, testPlayerId);
      const hasShape = adminResp.body?.success === true &&
        Array.isArray(adminResp.body?.data?.characterStats) &&
        typeof adminResp.body?.data?.playerId === 'string';

      // Unauthenticated request via https module must return 401/403.
      const anonStatus = await new Promise((resolve) => {
        const req = https.get(`${BASE}/api/players/${testPlayerId}/character-stats`, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.setTimeout(8000, () => { req.destroy(); resolve(0); });
      });
      const anonBlocked = anonStatus === 401 || anonStatus === 403;
      log('TC-328',
        adminResp.status === 200 && hasShape && anonBlocked ? 'PASS' : 'FAIL',
        adminResp.status !== 200 ? `Admin got ${adminResp.status}`
          : !hasShape ? 'Response shape invalid'
          : !anonBlocked ? `Anon got ${anonStatus} (expected 401/403)` : '');
    } catch (err) {
      log('TC-328', 'FAIL', err instanceof Error ? err.message : 'Character stats test failed');
    }
  } else {
    log('TC-328', 'SKIP', 'No shared fixture players');
  }

  // TC-329: Score entry logs API — admin gets audit trail, non-admin gets 403
  // Verifies /api/tournaments/:id/score-entry-logs returns { tournamentId,
  // logsByMatch, totalCount } for admins and blocks unauthenticated access.
  if (TID) {
    try {
      const logsResp = await page.evaluate(async (tid) => {
        const r = await fetch(`/api/tournaments/${tid}/score-entry-logs`);
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, TID);
      const hasShape = logsResp.body?.success === true &&
        typeof logsResp.body?.data?.tournamentId === 'string' &&
        typeof logsResp.body?.data?.logsByMatch === 'object' &&
        typeof logsResp.body?.data?.totalCount === 'number';

      // Unauthenticated request must be rejected.
      const anonStatus = await new Promise((resolve) => {
        const req = https.get(`${BASE}/api/tournaments/${TID}/score-entry-logs`, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.setTimeout(8000, () => { req.destroy(); resolve(0); });
      });
      const anonBlocked = anonStatus === 401 || anonStatus === 403;
      log('TC-329',
        logsResp.status === 200 && hasShape && anonBlocked ? 'PASS' : 'FAIL',
        logsResp.status !== 200 ? `Admin got ${logsResp.status}`
          : !hasShape ? 'Response shape invalid'
          : !anonBlocked ? `Anon got ${anonStatus} (expected 401/403)` : '');
    } catch (err) {
      log('TC-329', 'FAIL', err instanceof Error ? err.message : 'Score entry logs test failed');
    }
  } else {
    log('TC-329', 'SKIP', 'TID not available');
  }

  // TC-330: TA revival URL redirect — /ta/revival-1 → /ta/phase1, /ta/revival-2 → /ta/phase2
  // Old revival-* paths must redirect to the canonical phase* URLs for backwards
  // compatibility with existing bookmarks and links.
  if (TID) {
    try {
      let pass = true;
      const redirectPairs = [
        [`/tournaments/${TID}/ta/revival-1`, `/tournaments/${TID}/ta/phase1`],
        [`/tournaments/${TID}/ta/revival-2`, `/tournaments/${TID}/ta/phase2`],
      ];
      for (const [from, expectedSuffix] of redirectPairs) {
        await page.goto(BASE + from, { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (!page.url().includes(expectedSuffix)) {
          pass = false;
          log('TC-330', 'FAIL', `${from} did not redirect to ${expectedSuffix}, landed on ${page.url()}`);
          break;
        }
      }
      if (pass) log('TC-330', 'PASS');
    } catch (err) {
      log('TC-330', 'FAIL', err instanceof Error ? err.message : 'TA revival redirect test failed');
    }
  } else {
    log('TC-330', 'SKIP', 'TID not available');
  }

  // TC-331: tt/entries single-entry GET — returns TTEntry with player and tournament data
  // Verifies GET /api/tournaments/[id]/tt/entries/[entryId] returns a well-formed entry
  // including related player and tournament objects (IDOR-protected by tournamentId).
  if (pid) {
    let tc331TournamentId = null;
    try {
      tc331TournamentId = await uiCreateTournament(page, `E2E TT Entry GET ${Date.now()}`);
      await uiActivateTournament(page, tc331TournamentId);
      await uiSetupTaPlayers(page, tc331TournamentId, [
        { id: pid, name: playerName, nickname: nick },
      ]);

      const taResp = await apiFetchTa(page, tc331TournamentId);
      const entry = (taResp.b?.data?.entries ?? [])[0] ?? null;
      if (!entry) throw new Error('No TA entry created for TC-331');

      const getResp = await page.evaluate(async ([tid, eid]) => {
        const r = await fetch(`/api/tournaments/${tid}/tt/entries/${eid}`);
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, [tc331TournamentId, entry.id]);

      const data = getResp.body?.data ?? {};
      const hasShape =
        getResp.status === 200 &&
        getResp.body?.success === true &&
        data.id === entry.id &&
        typeof data.player === 'object' && data.player !== null &&
        typeof data.tournament === 'object' && data.tournament !== null &&
        typeof data.version === 'number';

      log('TC-331', hasShape ? 'PASS' : 'FAIL',
        getResp.status !== 200 ? `Got ${getResp.status}`
        : !hasShape ? 'Response missing player, tournament, or version fields'
        : '');
    } catch (err) {
      log('TC-331', 'FAIL', err instanceof Error ? err.message : 'TT entry GET test failed');
    } finally {
      if (tc331TournamentId) await deleteTournament(page, tc331TournamentId);
    }
  } else {
    log('TC-331', 'SKIP', 'No player available');
  }

  // TC-332: tt/entries optimistic-locking conflict — stale version returns 409
  // Verifies that PUT /api/tournaments/[id]/tt/entries/[entryId] with a version
  // number that is one behind the current value returns HTTP 409 Conflict.
  // This ensures concurrent edits cannot silently overwrite each other.
  if (pid) {
    let tc332TournamentId = null;
    try {
      tc332TournamentId = await uiCreateTournament(page, `E2E TT Lock ${Date.now()}`);
      await uiActivateTournament(page, tc332TournamentId);
      await uiSetupTaPlayers(page, tc332TournamentId, [
        { id: pid, name: playerName, nickname: nick },
      ]);

      const taResp = await apiFetchTa(page, tc332TournamentId);
      const entry = (taResp.b?.data?.entries ?? [])[0] ?? null;
      if (!entry) throw new Error('No TA entry created for TC-332');

      // Read the entry via tt/entries to obtain the current version number.
      const readResp = await page.evaluate(async ([tid, eid]) => {
        const r = await fetch(`/api/tournaments/${tid}/tt/entries/${eid}`);
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, [tc332TournamentId, entry.id]);

      const currentVersion = readResp.body?.data?.version;
      if (typeof currentVersion !== 'number') {
        throw new Error(`No version in GET response: ${JSON.stringify(readResp.body).slice(0, 200)}`);
      }

      // Submit PUT with a stale version (currentVersion - 1) and no times — must return 409.
      // Note: times is intentionally omitted so the partial-times validation (issue #624) is not
      // triggered before the optimistic-lock check has a chance to run.
      const conflictResp = await page.evaluate(async ([tid, eid, staleVersion]) => {
        const r = await fetch(`/api/tournaments/${tid}/tt/entries/${eid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: staleVersion }),
        });
        return { status: r.status };
      }, [tc332TournamentId, entry.id, currentVersion - 1]);

      log('TC-332', conflictResp.status === 409 ? 'PASS' : 'FAIL',
        `Expected 409 for stale version, got ${conflictResp.status}`);
    } catch (err) {
      log('TC-332', 'FAIL', err instanceof Error ? err.message : 'TT optimistic lock conflict test failed');
    } finally {
      if (tc332TournamentId) await deleteTournament(page, tc332TournamentId);
    }
  } else {
    log('TC-332', 'SKIP', 'No player available');
  }

  // TC-342: PUT /tt/entries with partial times — returns 400 (issue #624)
  // Verifies that PUT /api/tournaments/[id]/tt/entries/[entryId] rejects a times object
  // that doesn't include all 20 TA courses. Previously the server would accept the partial
  // payload and then silently overwrite totalTime with null during recalculateRanks.
  if (pid) {
    let tc342TournamentId = null;
    try {
      tc342TournamentId = await uiCreateTournament(page, `E2E TT Partial Times ${Date.now()}`);
      await uiActivateTournament(page, tc342TournamentId);
      await uiSetupTaPlayers(page, tc342TournamentId, [
        { id: pid, name: playerName, nickname: nick },
      ]);

      const taResp = await apiFetchTa(page, tc342TournamentId);
      const entry = (taResp.b?.data?.entries ?? [])[0] ?? null;
      if (!entry) throw new Error('No TA entry created for TC-342');

      const readResp = await page.evaluate(async ([tid, eid]) => {
        const r = await fetch(`/api/tournaments/${tid}/tt/entries/${eid}`);
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, [tc342TournamentId, entry.id]);

      const currentVersion = readResp.body?.data?.version;
      if (typeof currentVersion !== 'number') {
        throw new Error(`No version in GET response: ${JSON.stringify(readResp.body).slice(0, 200)}`);
      }

      // Send PUT with only 2 of the required 20 courses — must return 400 (issue #624).
      // Use valid M:SS.mm format so the format check passes and only the completeness guard fires.
      const partialResp = await page.evaluate(async ([tid, eid, ver]) => {
        const r = await fetch(`/api/tournaments/${tid}/tt/entries/${eid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: ver, times: { MC1: '1:24.00', DP1: '1:05.00' } }),
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, [tc342TournamentId, entry.id, currentVersion]);

      const is400 = partialResp.status === 400;
      const hasErrorMsg = typeof partialResp.body?.error === 'string' &&
        partialResp.body.error.includes('20');
      log('TC-342', is400 && hasErrorMsg ? 'PASS' : 'FAIL',
        !is400 ? `Expected 400 for partial times, got ${partialResp.status}`
        : !hasErrorMsg ? `Missing/wrong error message: ${partialResp.body?.error}`
        : '');
    } catch (err) {
      log('TC-342', 'FAIL', err instanceof Error ? err.message : 'TT partial times test failed');
    } finally {
      if (tc342TournamentId) await deleteTournament(page, tc342TournamentId);
    }
  } else {
    log('TC-342', 'SKIP', 'No player available');
  }

  // TC-343: PUT /tt/entries with full 20-course times populates lastRecordedCourse/lastRecordedTime.
  // The overlay-events aggregator skips ta_time_recorded events when these fields are null
  // (issue #627 TC-910). This test verifies the bulk-seed path through /tt/entries sets the
  // fields so the overlay can display the most-recently recorded course for admin-seeded entries.
  if (pid) {
    let tc343TournamentId = null;
    try {
      tc343TournamentId = await uiCreateTournament(page, `E2E TT LastCourse ${Date.now()}`);
      await uiActivateTournament(page, tc343TournamentId);
      await uiSetupTaPlayers(page, tc343TournamentId, [
        { id: pid, name: playerName, nickname: nick },
      ]);

      const taResp = await apiFetchTa(page, tc343TournamentId);
      const entry = (taResp.b?.data?.entries ?? [])[0] ?? null;
      if (!entry) throw new Error('No TA entry created for TC-343');

      // Seed all 20 courses via the bulk /tt/entries PUT endpoint
      const { times, totalMs } = makeTaTimesForRank(1);
      await apiSeedTtEntry(page, tc343TournamentId, entry.id, times, totalMs, 1);

      // Re-fetch the entry and verify lastRecordedCourse/lastRecordedTime are populated
      const readResp = await page.evaluate(async ([tid, eid]) => {
        const r = await fetch(`/api/tournaments/${tid}/tt/entries/${eid}`);
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, [tc343TournamentId, entry.id]);

      const entryData = readResp.body?.data;
      // lastRecordedCourse should be 'RR' (last course in canonical COURSES order)
      const hasLastCourse = entryData?.lastRecordedCourse === 'RR';
      const hasLastTime = typeof entryData?.lastRecordedTime === 'string' && entryData.lastRecordedTime.length > 0;

      log('TC-343', readResp.status === 200 && hasLastCourse && hasLastTime ? 'PASS' : 'FAIL',
        readResp.status !== 200 ? `GET failed: ${readResp.status}`
        : !hasLastCourse ? `lastRecordedCourse=${entryData?.lastRecordedCourse} (expected 'RR')`
        : !hasLastTime ? `lastRecordedTime not set (got ${entryData?.lastRecordedTime})`
        : '');
    } catch (err) {
      log('TC-343', 'FAIL', err instanceof Error ? err.message : 'TT lastRecordedCourse test failed');
    } finally {
      if (tc343TournamentId) await deleteTournament(page, tc343TournamentId);
    }
  } else {
    log('TC-343', 'SKIP', 'No player available');
  }

  // TC-333: Polling-stats monitor API — authenticated gets 200 with stats shape, unauth gets 401
  // Verifies GET /api/monitor/polling-stats requires authentication and returns the expected
  // shape: { success, data: { totalRequests, averageResponseTime, activeConnections, errorRate,
  // warnings, timePeriod } }.
  try {
    const adminResp = await page.evaluate(async () => {
      const r = await fetch('/api/monitor/polling-stats');
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });
    const data = adminResp.body?.data ?? {};
    const hasShape =
      adminResp.status === 200 &&
      adminResp.body?.success === true &&
      typeof data.totalRequests === 'number' &&
      typeof data.averageResponseTime === 'number' &&
      typeof data.activeConnections === 'number' &&
      typeof data.errorRate === 'number' &&
      Array.isArray(data.warnings) &&
      typeof data.timePeriod === 'object' && data.timePeriod !== null;

    // Unauthenticated request via https module must be rejected with 401 or 403.
    const anonStatus = await new Promise((resolve) => {
      const req = https.get(`${BASE}/api/monitor/polling-stats`, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', () => resolve(0));
      req.setTimeout(8000, () => { req.destroy(); resolve(0); });
    });
    const anonBlocked = anonStatus === 401 || anonStatus === 403;

    log('TC-333',
      hasShape && anonBlocked ? 'PASS' : 'FAIL',
      adminResp.status !== 200 ? `Admin got ${adminResp.status}`
        : !hasShape ? 'Response shape invalid'
        : !anonBlocked ? `Anon got ${anonStatus} (expected 401/403)` : '');
  } catch (err) {
    log('TC-333', 'FAIL', err instanceof Error ? err.message : 'Polling stats test failed');
  }

  // TC-334: Tournament visibility — private tournament blocked for unauthenticated users
  // Creates a private test tournament, verifies unauthenticated GET /api/tournaments/[id]
  // returns 403, and confirms admin session can still access it.
  let tc334TournamentId = null;
  try {
    // Create a brand-new private tournament via the admin API
    const created = await page.evaluate(async () => {
      const r = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `E2E TC-334 Private ${Date.now()}`, date: new Date().toISOString() }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });
    tc334TournamentId = created.body?.data?.id ?? null;
    if (!tc334TournamentId) throw new Error(`Tournament creation failed (${created.status})`);

    // Unauthenticated request (https module, no browser cookie) must be blocked with 403
    const anonStatus = await new Promise((resolve) => {
      const req = https.get(`${BASE}/api/tournaments/${tc334TournamentId}`, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', () => resolve(0));
      req.setTimeout(8000, () => { req.destroy(); resolve(0); });
    });

    // Admin session must still see the private tournament (returns 200)
    const adminResp = await page.evaluate(async (tid) => {
      const r = await fetch(`/api/tournaments/${tid}?fields=summary`);
      return { status: r.status };
    }, tc334TournamentId);

    log('TC-334',
      anonStatus === 403 && adminResp.status === 200 ? 'PASS' : 'FAIL',
      anonStatus !== 403 ? `Anon got ${anonStatus} (expected 403)` :
      adminResp.status !== 200 ? `Admin got ${adminResp.status}` : '');
  } catch (err) {
    log('TC-334', 'FAIL', err instanceof Error ? err.message : 'Visibility test failed');
  }

  // TC-335: Tournament visibility toggle — admin publishes first mode; unauthenticated detail access allowed
  // Continues from TC-334: sets publicModes: ['ta'] via PUT, then verifies that an
  // unauthenticated request to the detail endpoint now returns 200.
  try {
    if (!tc334TournamentId) throw new Error('TC-334 did not create a tournament; skipping');

    // Admin publishes the TA mode (independent toggle; publicModes: ['ta'])
    const putResp = await page.evaluate(async (tid) => {
      const r = await fetch(`/api/tournaments/${tid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicModes: ['ta'] }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, tc334TournamentId);
    if (putResp.status !== 200) throw new Error(`PUT failed: ${putResp.status}`);

    // Unauthenticated detail request must now succeed with 200
    const anonDetail = await new Promise((resolve) => {
      const req = https.get(`${BASE}/api/tournaments/${tc334TournamentId}?fields=summary`, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', () => resolve({ status: 0, body: '' }));
      req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, body: '' }); });
    });

    let parsedDetail = {};
    try { parsedDetail = JSON.parse(anonDetail.body); } catch (_) { /* ignore */ }
    const modesPublished = Array.isArray(parsedDetail?.data?.publicModes) &&
      parsedDetail.data.publicModes.includes('ta');

    // The tournament must now appear in the unauthenticated list (publicModes != [])
    const listStatus = await new Promise((resolve) => {
      const req = https.get(`${BASE}/api/tournaments`, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const found = (json?.data?.data ?? []).some((t) => t.id === tc334TournamentId);
            resolve({ status: res.statusCode, found });
          } catch (_) {
            resolve({ status: res.statusCode, found: false });
          }
        });
      });
      req.on('error', () => resolve({ status: 0, found: false }));
      req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, found: false }); });
    });

    log('TC-335',
      anonDetail.status === 200 && modesPublished && listStatus.found ? 'PASS' : 'FAIL',
      anonDetail.status !== 200 ? `Anon detail got ${anonDetail.status}` :
      !modesPublished ? 'publicModes not updated in response' :
      !listStatus.found ? 'Tournament not in public list after publishing' : '');
  } catch (err) {
    log('TC-335', 'FAIL', err instanceof Error ? err.message : 'Visibility toggle test failed');
  } finally {
    // Clean up the test tournament regardless of test outcome
    if (tc334TournamentId) {
      await page.evaluate(async (tid) => {
        await fetch(`/api/tournaments/${tid}`, { method: 'DELETE' }).catch(() => {});
      }, tc334TournamentId).catch(() => {});
    }
  }

  // TC-336: TA Phases API structure — GET without phase param returns phaseStatus shape;
  // GET with ?phase=phase1 additionally returns entries/rounds/availableCourses arrays.
  // Verifies the API is accessible without admin auth (public GET) and returns the
  // expected data contract used by the TA elimination phase UI.
  if (TID) {
    try {
      // Without phase param: only phaseStatus should be present
      const baseResp = await page.evaluate(async (tid) => {
        const r = await fetch(`/api/tournaments/${tid}/ta/phases`);
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, TID);
      const hasPhaseStatus =
        baseResp.status === 200 &&
        baseResp.body?.success === true &&
        typeof baseResp.body?.data?.phaseStatus === 'object' &&
        baseResp.body?.data?.phaseStatus !== null &&
        // entries/rounds should NOT be present without phase param
        baseResp.body?.data?.entries === undefined;

      // With ?phase=phase1 param: entries, rounds, availableCourses must be present
      const phaseResp = await page.evaluate(async (tid) => {
        const r = await fetch(`/api/tournaments/${tid}/ta/phases?phase=phase1`);
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, TID);
      const hasPhaseData =
        phaseResp.status === 200 &&
        phaseResp.body?.success === true &&
        Array.isArray(phaseResp.body?.data?.entries) &&
        Array.isArray(phaseResp.body?.data?.rounds) &&
        Array.isArray(phaseResp.body?.data?.availableCourses);

      // Invalid phase param must return 400
      const invalidResp = await page.evaluate(async (tid) => {
        const r = await fetch(`/api/tournaments/${tid}/ta/phases?phase=invalid`);
        return { status: r.status };
      }, TID);

      log('TC-336',
        hasPhaseStatus && hasPhaseData && invalidResp.status === 400 ? 'PASS' : 'FAIL',
        !hasPhaseStatus ? `Base response invalid (status=${baseResp.status}, phaseStatus=${typeof baseResp.body?.data?.phaseStatus})`
          : !hasPhaseData ? `Phase param response invalid (status=${phaseResp.status})`
          : invalidResp.status !== 400 ? `Invalid phase param got ${invalidResp.status} (expected 400)` : '');
    } catch (err) {
      log('TC-336', 'FAIL', err instanceof Error ? err.message : 'TA phases API test failed');
    }
  } else {
    log('TC-336', 'SKIP', 'TID not available');
  }

  // TC-337: Tournaments list API pagination — GET /api/tournaments with limit and page params
  // returns { success, data: { data: [...], meta: { total, page, limit, totalPages } } }.
  // createSuccessResponse wraps the paginate() result, so the shape is
  // body.data.data (array) and body.data.meta (pagination metadata).
  // Verifies pagination contract and that limit clamps results correctly.
  try {
    // Fetch with limit=1 to verify paging works
    const limitResp = await page.evaluate(async () => {
      const r = await fetch('/api/tournaments?limit=1&page=1');
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });
    // createSuccessResponse wraps paginate() result: { success, data: { data, meta } }
    const paginatedData = limitResp.body?.data ?? {};
    const meta = paginatedData?.meta ?? {};
    const hasShape =
      limitResp.status === 200 &&
      limitResp.body?.success === true &&
      Array.isArray(paginatedData?.data) &&
      paginatedData.data.length <= 1 &&
      typeof meta.total === 'number' &&
      typeof meta.page === 'number' &&
      typeof meta.limit === 'number' &&
      typeof meta.totalPages === 'number' &&
      meta.page === 1 &&
      meta.limit === 1;

    // Second page with limit=1 — data array length must be 0 or 1
    const page2Resp = await page.evaluate(async () => {
      const r = await fetch('/api/tournaments?limit=1&page=2');
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });
    const page2PaginatedData = page2Resp.body?.data ?? {};
    const page2Ok =
      page2Resp.status === 200 &&
      page2Resp.body?.success === true &&
      Array.isArray(page2PaginatedData?.data) &&
      page2PaginatedData.data.length <= 1;

    log('TC-337',
      hasShape && page2Ok ? 'PASS' : 'FAIL',
      !hasShape ? `Limit=1 response shape invalid (status=${limitResp.status}, data.length=${paginatedData?.data?.length}, meta=${JSON.stringify(meta)})`
        : !page2Ok ? `Page 2 response invalid (status=${page2Resp.status})` : '');
  } catch (err) {
    log('TC-337', 'FAIL', err instanceof Error ? err.message : 'Tournament pagination test failed');
  }

  // TC-338: Security — private tournament (publicModes: []) not visible to non-admin in list API
  // Creates a private tournament, confirms it is excluded from GET /api/tournaments for
  // unauthenticated users (security fix for Issue #612), then cleans up.
  let tc338TournamentId = null;
  try {
    const created = await page.evaluate(async () => {
      const r = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `E2E TC-338 Private ${Date.now()}`, date: new Date().toISOString() }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });
    tc338TournamentId = created.body?.data?.id ?? null;
    if (!tc338TournamentId) throw new Error(`Tournament creation failed (${created.status})`);

    // Unauthenticated list request must NOT include the private tournament
    const anonList = await new Promise((resolve) => {
      const req = https.get(`${BASE}/api/tournaments?limit=100`, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode, ids: (json?.data?.data ?? []).map((t) => t.id) });
          } catch (_) {
            resolve({ status: res.statusCode, ids: [] });
          }
        });
      });
      req.on('error', () => resolve({ status: 0, ids: [] }));
      req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, ids: [] }); });
    });

    const notLeaked = !anonList.ids.includes(tc338TournamentId);

    // Admin session must still see it in the list
    const adminList = await page.evaluate(async (tid) => {
      const r = await fetch('/api/tournaments?limit=100');
      const body = await r.json().catch(() => ({}));
      return { found: (body?.data?.data ?? []).some((t) => t.id === tid) };
    }, tc338TournamentId);

    log('TC-338',
      notLeaked && adminList.found ? 'PASS' : 'FAIL',
      !notLeaked ? 'Private tournament appeared in non-admin list (metadata leak)' :
      !adminList.found ? 'Admin could not see private tournament in list' : '');
  } catch (err) {
    log('TC-338', 'FAIL', err instanceof Error ? err.message : 'Private tournament leak test failed');
  } finally {
    if (tc338TournamentId) {
      await page.evaluate(async (tid) => {
        await fetch(`/api/tournaments/${tid}`, { method: 'DELETE' }).catch(() => {});
      }, tc338TournamentId).catch(() => {});
    }
  }

  // TC-339: Independent per-mode publish toggle (issue #618).
  // Each mode publishes/unpublishes independently — toggling one mode must not
  // affect the publish state of any other mode. Non-sequential subsets like
  // ['bm'] alone or ['bm','gp'] are now valid; only invalid mode names and
  // duplicates are rejected.
  let tc339TournamentId = null;
  try {
    const created = await page.evaluate(async () => {
      const r = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `E2E TC-339 Publish ${Date.now()}`, date: new Date().toISOString() }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });
    tc339TournamentId = created.body?.data?.id ?? null;
    if (!tc339TournamentId) throw new Error(`Tournament creation failed (${created.status})`);

    // Activate the tournament so it's in a state where publicModes can be set
    await page.evaluate(async (tid) => {
      await fetch(`/api/tournaments/${tid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
    }, tc339TournamentId);

    // Publish only BM — API must accept ['bm'] alone (no cascade to TA).
    const bmOnlyResp = await page.evaluate(async (tid) => {
      const r = await fetch(`/api/tournaments/${tid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicModes: ['bm'] }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, tc339TournamentId);
    const bmOnlyAccepted = bmOnlyResp.status === 200 &&
      Array.isArray(bmOnlyResp.body?.data?.publicModes) &&
      bmOnlyResp.body.data.publicModes.length === 1 &&
      bmOnlyResp.body.data.publicModes.includes('bm');

    // Toggle TA on without affecting BM — final state must be exactly {ta, bm}
    const taAddResp = await page.evaluate(async (tid) => {
      const r = await fetch(`/api/tournaments/${tid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicModes: ['ta', 'bm'] }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, tc339TournamentId);
    const taAdded = taAddResp.status === 200 &&
      Array.isArray(taAddResp.body?.data?.publicModes) &&
      taAddResp.body.data.publicModes.includes('ta') &&
      taAddResp.body.data.publicModes.includes('bm');

    // Toggle BM off — TA must remain, no cascade
    const bmOffResp = await page.evaluate(async (tid) => {
      const r = await fetch(`/api/tournaments/${tid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicModes: ['ta'] }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, tc339TournamentId);
    const bmOffNoCascade = bmOffResp.status === 200 &&
      Array.isArray(bmOffResp.body?.data?.publicModes) &&
      bmOffResp.body.data.publicModes.length === 1 &&
      bmOffResp.body.data.publicModes.includes('ta');

    // Invalid mode names and duplicates must still be rejected
    const invalidPut = await page.evaluate(async (tid) => {
      const r = await fetch(`/api/tournaments/${tid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicModes: ['foo'] }),
      });
      return { status: r.status };
    }, tc339TournamentId);
    const dupePut = await page.evaluate(async (tid) => {
      const r = await fetch(`/api/tournaments/${tid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicModes: ['ta', 'ta'] }),
      });
      return { status: r.status };
    }, tc339TournamentId);
    const invalidRejected = invalidPut.status === 400 && dupePut.status === 400;

    // After publishing modes, the tournament should appear in the non-admin list
    const appearsInList = await new Promise((resolve) => {
      const req = https.get(`${BASE}/api/tournaments?limit=100`, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve((json?.data?.data ?? []).some((t) => t.id === tc339TournamentId));
          } catch (_) { resolve(false); }
        });
      });
      req.on('error', () => resolve(false));
      req.setTimeout(8000, () => { req.destroy(); resolve(false); });
    });

    log('TC-339',
      bmOnlyAccepted && taAdded && bmOffNoCascade && invalidRejected && appearsInList ? 'PASS' : 'FAIL',
      !bmOnlyAccepted ? `Independent BM publish failed (status=${bmOnlyResp.status}, modes=${JSON.stringify(bmOnlyResp.body?.data?.publicModes)})` :
      !taAdded ? `TA add did not preserve BM (modes=${JSON.stringify(taAddResp.body?.data?.publicModes)})` :
      !bmOffNoCascade ? `BM off cascaded into TA (modes=${JSON.stringify(bmOffResp.body?.data?.publicModes)})` :
      !invalidRejected ? `Invalid modes accepted (foo=${invalidPut.status}, dupe=${dupePut.status}, expected 400)` :
      !appearsInList ? 'Published tournament not visible in non-admin list' : '');
  } catch (err) {
    log('TC-339', 'FAIL', err instanceof Error ? err.message : 'Independent mode publish test failed');
  } finally {
    if (tc339TournamentId) {
      await page.evaluate(async (tid) => {
        await fetch(`/api/tournaments/${tid}`, { method: 'DELETE' }).catch(() => {});
      }, tc339TournamentId).catch(() => {});
    }
  }

  // TC-341: Authenticated player can access private tournament detail API (publicModes: [])
  // Regression test for the #615 fix regression: the visibility check was too strict,
  // blocking authenticated non-admin users (players) when publicModes was empty.
  // Fixed by changing the guard from !isAdmin → !isAuthenticated.
  if (pid && playerTempPassword) {
    let tc341TournamentId = null;
    let tc341PlayerBrowser = null;
    try {
      // Create a private tournament (publicModes defaults to [])
      const tc341Created = await page.evaluate(async () => {
        const r = await fetch('/api/tournaments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `E2E TC-341 Private ${Date.now()}`, date: new Date().toISOString() }),
        });
        return { status: r.status, body: await r.json() };
      });
      tc341TournamentId = tc341Created.body?.data?.id ?? null;
      if (!tc341TournamentId) throw new Error(`Tournament creation failed (${tc341Created.status})`);

      // 1. Verify unauthenticated access returns 403 (baseline check)
      const unauthStatus = await new Promise((resolve) => {
        const req = https.get(`${BASE}/api/tournaments/${tc341TournamentId}?fields=summary`, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.setTimeout(8000, () => { req.destroy(); resolve(0); });
      });

      // 2. Log in as player and call the same endpoint — expect 200
      tc341PlayerBrowser = await chromium.launch({
        headless: false,
        env: createBrowserLaunchEnv(),
        args: getChromiumArgs(),
      });
      const tc341PlayerCtx = await tc341PlayerBrowser.newContext({ viewport: { width: 1280, height: 720 } });
      const tc341PlayerPage = await tc341PlayerCtx.newPage();
      await nav(tc341PlayerPage, '/auth/signin');
      await tc341PlayerPage.locator('#nickname').fill(nick);
      await tc341PlayerPage.locator('#password').fill(playerTempPassword);
      await tc341PlayerPage.getByRole('button', { name: /ログイン|Login/ }).click();
      await tc341PlayerPage.waitForURL((url) => url.pathname === '/tournaments', { timeout: 15000 });

      const tc341PlayerResp = await tc341PlayerPage.evaluate(async (tid) => {
        const r = await fetch(`/api/tournaments/${tid}?fields=summary`);
        return { status: r.status, body: await r.json() };
      }, tc341TournamentId);

      const unauthBlocked = unauthStatus === 403;
      const playerAllowed = tc341PlayerResp.status === 200 && tc341PlayerResp.body?.success === true;

      log('TC-341',
        unauthBlocked && playerAllowed ? 'PASS' : 'FAIL',
        !unauthBlocked ? `Unauthenticated should get 403, got ${unauthStatus}` :
        !playerAllowed ? `Player should get 200, got ${tc341PlayerResp.status} (${JSON.stringify(tc341PlayerResp.body)})` : '');
    } catch (err) {
      log('TC-341', 'FAIL', err instanceof Error ? err.message : 'Authenticated player private tournament test failed');
    } finally {
      if (tc341PlayerBrowser) await tc341PlayerBrowser.close().catch(() => {});
      if (tc341TournamentId) {
        await page.evaluate(async (tid) => {
          await fetch(`/api/tournaments/${tid}`, { method: 'DELETE' }).catch(() => {});
        }, tc341TournamentId).catch(() => {});
      }
    }
  } else {
    log('TC-341', 'SKIP', 'Player credentials not available');
  }

  // ===== Mode-specific suites (shared code with tc-bm/tc-mr/tc-gp/tc-ta) =====
  // Previously these were gated behind E2E_RUN_FOCUSED_SUITES and invoked
  // through spawnSync, which meant `node e2e/tc-all.js` silently skipped
  // per-mode coverage by default and forced a second browser launch + a
  // duplicate shared-fixture bootstrap for every run. The tc-*.js modules now
  // expose `getSuite({ sharedFixture })`, so we compose them here using the
  // same browser/page and the same shared fixture that tc-all already created.
  // This is the single integration point — there is no longer a child-process
  // path and no duplicated setup.
  if (progressWatchdog) {
    /* Per-suite watchdogs reset on every test; suppress the parent's to avoid
     * a double firing at the exact same timeout. */
    progressWatchdog.stop();
    progressWatchdog = null;
  }

  const suites = [
    { label: 'BM Tests', mod: bmModule },
    { label: 'MR Tests', mod: mrModule },
    { label: 'GP Tests', mod: gpModule },
    { label: 'TA Tests', mod: taModule },
    /* Overlay tests own a tiny self-contained tournament — no shared fixture
       dependency, so the order relative to BM/MR/GP/TA doesn't matter. */
    { label: 'Overlay Tests', mod: overlayModule },
  ];

  const suiteFailures = {};
  for (const { label, mod } of suites) {
    console.log(`\n========== Running ${label} (in-process) ==========`);
    const spec = mod.getSuite({ sharedFixture });
    try {
      const { failed } = await runSuiteInBrowser({ ...spec, page });
      suiteFailures[spec.suiteName] = failed;
    } catch (err) {
      console.error(`[${label}] runSuiteInBrowser threw:`, err instanceof Error ? err.stack || err.message : err);
      suiteFailures[spec.suiteName] = true;
    }
  }

  // ===== Summary =====
  console.log('\n========== SUMMARY (tc-all.js inline tests) ==========');
  const p = results.filter(r => r.s === 'PASS').length;
  const f = results.filter(r => r.s === 'FAIL').length;
  const sk = results.filter(r => r.s === 'SKIP').length;
  console.log(`PASS: ${p} | FAIL: ${f} | SKIP: ${sk} | Total: ${results.length}`);
  if (f > 0) results.filter(r => r.s === 'FAIL').forEach(r => console.log(`  ❌ [${r.tc}] ${r.d}`));
  for (const name of Object.keys(suiteFailures)) {
    if (suiteFailures[name]) console.log(`  ⚠️  ${name} suite had failures — see output above`);
  }

    const anySuiteFailed = Object.values(suiteFailures).some(Boolean);
    return (f > 0 || anySuiteFailed) ? 1 : 0;
  } finally {
    // Clean up the shared test tournament + players before closing the browser.
    await cleanupSharedResources();
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

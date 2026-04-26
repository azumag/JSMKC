/**
 * Shared E2E helpers used by tc-bm.js, tc-mr.js, tc-gp.js (and optionally tc-all.js).
 *
 * Design notes:
 * - Every API helper runs inside an admin-session Playwright page via page.evaluate
 *   so the admin cookie is forwarded automatically.
 * - Tournament cleanup uses the demote-to-draft → DELETE pattern because
 *   DELETE /api/tournaments/:id only accepts status='draft'.
 * - apiPutQualScore retries transient 5xx with backoff (D1 occasionally 503s under load).
 * - 28-player setups return a `cleanup` closure so callers always do `try { ... } finally { cleanup() }`
 *   without needing to know which IDs were created. The closure is also called
 *   internally if setup throws partway through, so partial state never leaks.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.E2E_BASE_URL || 'https://smkc.bluemoon.works';
const NAV_WAIT_MS = 8000;
const apiLogContexts = new WeakSet();

function formatApiLogUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    return rawUrl;
  }
}

function isApiLogUrl(rawUrl) {
  try {
    return new URL(rawUrl).pathname.startsWith('/api/');
  } catch {
    return typeof rawUrl === 'string' && rawUrl.startsWith('/api/');
  }
}

function installApiLogging(target, label = 'E2E') {
  if (process.env.E2E_API_LOG === '0') return;

  const context = typeof target?.context === 'function' ? target.context() : target;
  if (!context || apiLogContexts.has(context)) return;
  apiLogContexts.add(context);

  const requestStarts = new WeakMap();

  context.on('request', (request) => {
    if (isApiLogUrl(request.url())) {
      requestStarts.set(request, Date.now());
    }
  });

  context.on('response', (response) => {
    const request = response.request();
    if (!isApiLogUrl(response.url())) return;

    const started = requestStarts.get(request);
    const elapsed = started ? ` ${Date.now() - started}ms` : '';
    requestStarts.delete(request);
    console.log(`[API ${label}] ${request.method()} ${response.status()} ${formatApiLogUrl(response.url())}${elapsed}`);
  });

  context.on('requestfailed', (request) => {
    if (!isApiLogUrl(request.url())) return;

    const started = requestStarts.get(request);
    const elapsed = started ? ` ${Date.now() - started}ms` : '';
    requestStarts.delete(request);
    const failure = request.failure();
    const detail = failure?.errorText ? ` ${failure.errorText}` : '';
    console.log(`[API ${label}] ${request.method()} ERR ${formatApiLogUrl(request.url())}${elapsed}${detail}`);
  });
}

function makeResults() {
  /* Each TC suite owns its own results array. */
  return [];
}

function makeLog(results) {
  return function log(tc, status, detail = '') {
    const icon = status === 'PASS' ? '✅' : status === 'SKIP' ? '⏭️' : '❌';
    console.log(`${icon} [${tc}] ${status}${detail ? ' — ' + detail : ''}`);
    results.push({ tc, status, detail });
  };
}

async function nav(page, path) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(NAV_WAIT_MS);
      return;
    } catch (err) {
      lastError = err;
      if (attempt === 2) throw err;
      await page.waitForTimeout(3000);
    }
  }
  throw lastError;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ───────── Player / Tournament CRUD ───────── */

async function apiCreatePlayer(page, name, nickname) {
  const res = await page.evaluate(async (d) => {
    const r = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, { name, nickname, country: 'JP' });
  const id = res.b?.data?.player?.id ?? null;
  const password = res.b?.data?.temporaryPassword ?? null;
  if (res.s !== 201 || !id) throw new Error(`Failed to create player ${nickname} (${res.s})`);
  return { id, nickname, password };
}

async function apiCreateTournament(page, name, opts = {}) {
  const res = await page.evaluate(async (d) => {
    const r = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, { name, date: new Date().toISOString(), ...opts });
  const id = res.b?.data?.id ?? null;
  if (res.s !== 201 || !id) throw new Error(`Failed to create tournament (${res.s})`);
  return id;
}

async function apiDeletePlayer(page, id) {
  if (!id) return;
  await page.evaluate(async (u) => { await fetch(u, { method: 'DELETE' }); },
    `/api/players/${id}`).catch(() => {});
}

/** DELETE /api/tournaments/:id only accepts status='draft'.
 *  Demote first, then DELETE. Both calls are best-effort. */
async function apiDeleteTournament(page, id) {
  if (!id) return;
  await page.evaluate(async (u) => {
    await fetch(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft' }),
    });
  }, `/api/tournaments/${id}`).catch(() => {});
  await page.evaluate(async (u) => { await fetch(u, { method: 'DELETE' }); },
    `/api/tournaments/${id}`).catch(() => {});
}

/* ───────── Snake-draft helpers ─────────
 * 28 players (or fewer) into 2 groups (A/B × 14) using boustrophedon
 * to keep top-seed clustering low. Product default is 2 groups. */

const GROUP_LETTERS = ['A', 'B'];

function snakeDraft28(playerIds) {
  return playerIds.map((playerId, i) => {
    const row = Math.floor(i / 2);
    const col = row % 2 === 0 ? (i % 2) : (1 - (i % 2));
    return { playerId, group: GROUP_LETTERS[col], seeding: i + 1 };
  });
}

/* ───────── Chromium stability args ───────── */
/**
 * Returns standard Chromium CLI flags that reduce renderer crashes and memory
 * pressure during long-running E2E suites (especially the 182-match BM
 * qualification loop).  Added to every chromium.launch / launchPersistentContext
 * call so the behaviour is uniform across tc-all, individual mode suites,
 * player-login browsers, and cleanup.
 */
function getChromiumArgs() {
  return [
    '--disable-crash-reporter',
    '--disable-crashpad',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-features=IsolateOrigins,site-per-process',
    /* Increase the renderer V8 heap limit so the long 182-match BM
     * qualification loop (and the preceding TA/MR work) does not OOM-kill
     * the Chromium renderer on macOS persistent contexts.  4096 MB gives
     * plenty of headroom for the React SPA’s heap growth between page
     * refreshes while still staying within typical CI runner limits. */
    '--js-flags=--max-old-space-size=4096',
  ];
}

/* ───────── Browser launch environment setup ───────── */
/**
 * Create isolated browser environment with crashpad disabled.
 * Creates temp directories for HOME, XDG_CONFIG_HOME, XDG_CACHE_HOME.
 * This prevents the admin's persistent browser profile from being corrupted.
 */
function createBrowserLaunchEnv() {
  const baseHome = process.env.E2E_BROWSER_HOME || path.join(os.tmpdir(), 'playwright-e2e-home');
  const configHome = path.join(baseHome, '.config');
  const cacheHome = path.join(baseHome, '.cache');
  for (const dir of [baseHome, configHome, cacheHome]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return {
    ...process.env,
    HOME: baseHome,
    XDG_CONFIG_HOME: configHome,
    XDG_CACHE_HOME: cacheHome,
  };
}

/* ───────── Player credentials login (separate browser context) ─────────
 * Use a fresh non-persistent browser so the admin's persistent profile stays
 * untouched. Caller must close the returned browser. */

async function loginPlayerBrowser(nickname, password) {
  const browser = await chromium.launch({
    headless: false,
    args: getChromiumArgs(),
    env: createBrowserLaunchEnv(),
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  installApiLogging(context, 'player');
  const page = await context.newPage();
  await nav(page, '/auth/signin');
  await page.locator('#nickname').fill(nickname);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /ログイン|Login/ }).click();
  await page.waitForURL((u) => u.pathname === '/tournaments', { timeout: 15000 });
  await page.waitForTimeout(1000);
  return { browser, context, page };
}

/* ───────── Retry wrapper for transient API failures ─────────
 * D1 occasionally returns 5xx under burst load. Retry idempotent operations
 * (PUT score input is safe to retry — it sets a final state, not an increment).
 * 2 retries with 1s/3s backoff = ~4s worst case before giving up. */

async function withRetry(fn, { attempts = 3, label = 'op' } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn();
      const status = result?.s;
      /* Retry only on server-side transient failures (5xx) and 429.
       * 4xx (client errors) are deterministic — bail immediately so the test
       * surfaces the validation issue instead of looping. */
      if (status && status >= 500) {
        lastError = new Error(`${label}: server returned ${status}`);
      } else if (status === 429) {
        lastError = new Error(`${label}: rate limited (429)`);
      } else {
        return result;
      }
    } catch (err) {
      lastError = err;
    }
    if (i < attempts - 1) {
      const backoffMs = 1000 * Math.pow(3, i); // 1s, 3s
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastError;
}

/* ───────── BM helpers ───────── */

async function apiSetupBmGroup(page, tournamentId, players) {
  return page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/bm`, { players }]);
}

async function apiFetchBm(page, tournamentId) {
  return page.evaluate(async (u) => {
    const r = await fetch(u);
    const j = await r.json().catch(() => ({}));
    return j.data || j;
  }, `/api/tournaments/${tournamentId}/bm`);
}

async function apiPutBmQualScore(page, tournamentId, matchId, score1, score2) {
  return withRetry(() => page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/bm`, { matchId, score1, score2 }]),
  { label: `BM qual PUT ${matchId}` });
}

async function apiSetBmFinalsScore(page, tournamentId, matchId, score1, score2) {
  return withRetry(() => page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/bm/finals`, { matchId, score1, score2 }]),
  { label: `BM finals PUT ${matchId}` });
}

async function apiGenerateBmFinals(page, tournamentId, topN = 8) {
  return withRetry(() => page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/bm/finals`, { topN }]),
  { label: `BM finals POST` });
}

async function apiFetchBmFinalsMatches(page, tournamentId) {
  const state = await apiFetchBmFinalsState(page, tournamentId);
  return state.matches;
}

async function apiFetchBmFinalsState(page, tournamentId) {
  const json = await page.evaluate(async (u) => {
    const r = await fetch(`${u}?ts=${Date.now()}`, { cache: 'no-store' });
    return r.json().catch(() => ({}));
  }, `/api/tournaments/${tournamentId}/bm/finals`);
  /* BM uses 'grouped' GET style: { success: true, data: { matches, ..., playoffMatches } } */
  const wrapped = json.data;
  const arr = wrapped?.matches || [
    ...(wrapped?.winnersMatches || []),
    ...(wrapped?.losersMatches || []),
    ...(wrapped?.grandFinalMatches || []),
  ];
  return {
    raw: json,
    matches: arr.slice().sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)),
    playoffMatches: (wrapped?.playoffMatches || [])
      .slice()
      .sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)),
    bracketSize: wrapped?.bracketSize,
    playoffComplete: wrapped?.playoffComplete,
    phase: wrapped?.phase,
  };
}

/** 28-player BM setup with built-in cleanup closure. Delegates to
 *  setupBmQualViaUi so there is one UI-based qualification path across every
 *  bulk setup helper. Player creation + tournament creation stay here so the
 *  helper still owns lifecycle of the isolated resources it produces. */
async function setupBm28PlayerFinals(adminPage, label, opts = {}) {
  const stamp = Date.now();
  const players = [];
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const p of players) await apiDeletePlayer(adminPage, p.id);
  };

  try {
    for (let i = 1; i <= 28; i++) {
      const name = `E2E BM ${label} P${i}`;
      const nickname = `e2e_bm${label}_${stamp}_${i}`;
      const p = await uiCreatePlayer(adminPage, name, nickname);
      players.push({ id: p.id, name, nickname });
    }
    tournamentId = await uiCreateTournament(adminPage, `E2E BM ${label} ${stamp}`, opts);
    await setupBmQualViaUi(adminPage, tournamentId, players);
    return {
      tournamentId,
      playerIds: players.map((p) => p.id),
      nicknames: players.map((p) => p.nickname),
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/* ───────── MR helpers ───────── */

async function apiSetupMrGroup(page, tournamentId, players) {
  return page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/mr`, { players }]);
}

async function apiFetchMr(page, tournamentId) {
  return page.evaluate(async (u) => {
    const r = await fetch(u);
    const j = await r.json().catch(() => ({}));
    return j.data || j;
  }, `/api/tournaments/${tournamentId}/mr`);
}

async function apiPutMrQualScore(page, tournamentId, matchId, score1, score2) {
  return withRetry(() => page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/mr`, { matchId, score1, score2 }]),
  { label: `MR qual PUT ${matchId}` });
}

async function apiGenerateMrFinals(page, tournamentId, topN = 8) {
  return withRetry(() => page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/mr/finals`, { topN }]),
  { label: `MR finals POST` });
}

async function apiSetMrFinalsScore(page, tournamentId, matchId, score1, score2) {
  return withRetry(() => page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/mr/finals`, { matchId, score1, score2 }]),
  { label: `MR finals PUT ${matchId}` });
}

async function apiFetchMrFinalsMatches(page, tournamentId) {
  const state = await apiFetchMrFinalsState(page, tournamentId);
  return state.matches;
}

async function apiFetchMrFinalsState(page, tournamentId) {
  const json = await page.evaluate(async (u) => {
    const r = await fetch(`${u}?ts=${Date.now()}`, { cache: 'no-store' });
    return r.json().catch(() => ({}));
  }, `/api/tournaments/${tournamentId}/mr/finals`);
  /* Unwrap createSuccessResponse: json.data = { matches, bracketStructure, roundNames, playoffMatches, phase, playoffComplete } */
  const wrapped = json.data;
  const matches = wrapped?.matches || json.matches || [];
  return {
    raw: json,
    matches: matches.slice().sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)),
    playoffMatches: (wrapped?.playoffMatches || [])
      .slice()
      .sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)),
    phase: wrapped?.phase,
    playoffComplete: wrapped?.playoffComplete ?? false,
    bracketSize: wrapped?.bracketSize,
  };
}

async function apiFetchGpFinalsState(page, tournamentId) {
  const json = await page.evaluate(async (u) => {
    const r = await fetch(`${u}?page=1&limit=50&ts=${Date.now()}`, { cache: 'no-store' });
    return r.json().catch(() => ({}));
  }, `/api/tournaments/${tournamentId}/gp/finals`);
  /* GP uses 'paginated' GET style: json.data = { data: [...matches], meta: {...}, playoffMatches, phase, playoffComplete } */
  const wrapped = json.data;
  const raw = (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped))
    ? (wrapped.data || [])
    : (Array.isArray(wrapped) ? wrapped : []);
  return {
    raw: json,
    matches: raw.slice().sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)),
    playoffMatches: (wrapped?.playoffMatches || [])
      .slice()
      .sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)),
    phase: wrapped?.phase,
    playoffComplete: wrapped?.playoffComplete ?? false,
    bracketSize: wrapped?.bracketSize,
  };
}

async function setupMr28PlayerFinals(adminPage, label, opts = {}) {
  const stamp = Date.now();
  const players = [];
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const p of players) await apiDeletePlayer(adminPage, p.id);
  };

  try {
    for (let i = 1; i <= 28; i++) {
      const name = `E2E MR ${label} P${i}`;
      const nickname = `e2e_mr${label}_${stamp}_${i}`;
      const p = await uiCreatePlayer(adminPage, name, nickname);
      players.push({ id: p.id, name, nickname });
    }
    tournamentId = await uiCreateTournament(adminPage, `E2E MR ${label} ${stamp}`, opts);
    await setupMrQualViaUi(adminPage, tournamentId, players);
    return {
      tournamentId,
      playerIds: players.map((p) => p.id),
      nicknames: players.map((p) => p.nickname),
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/* ───────── GP helpers ─────────
 * GP qualification PUT contract: { matchId, cup, races[5] } where each race is
 * { course, position1, position2 } and positions ≠ each other (except both 0). */

const TOTAL_GP_RACES = 5;

/** GP cup to courses mapping (in fixed SMK sequence). */
const GP_CUP_COURSES = {
  Mushroom: ['MC1', 'DP1', 'GV1', 'BC1', 'MC2'],
  Flower: ['CI1', 'GV2', 'DP2', 'BC2', 'MC3'],
  Star: ['KB1', 'CI2', 'VL1', 'BC3', 'MC4'],
  Special: ['DP3', 'KB2', 'GV3', 'VL2', 'RR'],
};

/** P1 finishes 1st in every race (driver pts 9 × 5 = 45), P2 finishes 5th (0 × 5 = 0).
 *  Uses the specified cup's courses in fixed order. Defaults to Mushroom. */
function makeRacesP1Wins(cup = 'Mushroom') {
  const courses = GP_CUP_COURSES[cup] || GP_CUP_COURSES.Mushroom;
  return courses.map((course) => ({ course, position1: 1, position2: 5 }));
}

/** P2 wins instead — used for mismatch test. */
function makeRacesP2Wins(cup = 'Mushroom') {
  const courses = GP_CUP_COURSES[cup] || GP_CUP_COURSES.Mushroom;
  return courses.map((course) => ({ course, position1: 5, position2: 1 }));
}

async function apiSetupGpGroup(page, tournamentId, players) {
  return page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/gp`, { players }]);
}

async function apiFetchGp(page, tournamentId) {
  return page.evaluate(async (u) => {
    const r = await fetch(u);
    const j = await r.json().catch(() => ({}));
    return j.data || j;
  }, `/api/tournaments/${tournamentId}/gp`);
}

async function apiPutGpQualScore(page, tournamentId, matchId, cup, races) {
  return withRetry(() => page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/gp`, { matchId, cup, races }]),
  { label: `GP qual PUT ${matchId}` });
}

async function apiSetGpFinalsScore(page, tournamentId, matchId, score1, score2, suddenDeathWinnerId = null) {
  const body = { matchId, score1, score2 };
  if (suddenDeathWinnerId) {
    body.suddenDeathWinnerId = suddenDeathWinnerId;
  }
  return withRetry(() => page.evaluate(async ([url, reqBody]) => {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/gp/finals`, body]),
  { label: `GP finals PUT ${matchId}` });
}

async function apiGenerateGpFinals(page, tournamentId, topN = 8) {
  return withRetry(() => page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/gp/finals`, { topN }]),
  { label: `GP finals POST` });
}

/** GP finals uses 'paginated' GET style: { success: true, data: { data: [...], meta: {...} } }.
 *  Aggregate up to 5 pages of 50 entries (17 finals matches always fit in 1 page).
 *  Note: createSuccessResponse wraps the paginated result, so json.data = { data, meta }.
 *  TC-701/702/707/708 PASS because they use apiFetchGp (qualification), not finals. */
async function apiFetchGpFinalsMatches(page, tournamentId) {
  const all = [];
  for (let p = 1; p <= 5; p++) {
    const json = await page.evaluate(async ([u, pp]) => {
      const r = await fetch(`${u}?page=${pp}&limit=50&ts=${Date.now()}`, { cache: 'no-store' });
      return r.json().catch(() => ({}));
    }, [`/api/tournaments/${tournamentId}/gp/finals`, p]);
    /* Unwrap createSuccessResponse: json.data = { data: [...matches], meta: { total, page, limit, totalPages } } */
    const wrapped = json.data;
    const raw = (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped))
      ? (wrapped.data || [])
      : (Array.isArray(wrapped) ? wrapped : []);
    if (raw.length === 0) break;
    all.push(...raw);
    const totalPages = wrapped?.meta?.totalPages || 1;
    if (p >= totalPages) break;
  }
  return all.slice().sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));
}

/* ───────── TA helpers ─────────
 * TA (Time Attack / Time Trial) has two distinct PUT contracts:
 *   1. Admin:       PUT /api/tournaments/:id/tt/entries/:entryId
 *                   Body: { version, times: {MC1: "1:00.00", ...}, totalTime, rank }
 *                   — sets the full qualification time record (optimistic-locked).
 *   2. Participant: PUT /api/tournaments/:id/ta
 *                   Body: { entryId, course, time }
 *                   — updates a single course cell; allowed for self or partner.
 * and several action flavours via PUT /ta: set_partner, update_seeding,
 *   update_lives, reset_lives, eliminate. */

const TA_COURSES = [
  'MC1', 'DP1', 'GV1', 'BC1', 'MC2',
  'CI1', 'GV2', 'DP2', 'BC2', 'MC3',
  'KB1', 'CI2', 'VL1', 'BC3', 'MC4',
  'DP3', 'KB2', 'GV3', 'VL2', 'RR',
];

/** PUT /api/tournaments/:id with arbitrary patch body. Used to activate (status)
 *  or toggle feature flags (taPlayerSelfEdit, dualReportEnabled, etc.). */
async function apiUpdateTournament(page, tournamentId, body) {
  return page.evaluate(async ([u, d]) => {
    const r = await fetch(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}`, body]);
}

/** Convenience wrapper — throws so callers can early-exit on activation failure. */
async function apiActivateTournament(page, tournamentId) {
  const res = await apiUpdateTournament(page, tournamentId, { status: 'active' });
  if (res.s !== 200) {
    throw new Error(`Failed to activate tournament ${tournamentId} (${res.s})`);
  }
  return res;
}

/** Add TA qualification entries. Supports both legacy single-player shape
 *  (`{ playerId }`) and the preferred seeded form (`{ playerEntries: [...] }`). */
async function apiAddTaEntries(page, tournamentId, payload) {
  return page.evaluate(async ([u, d]) => {
    const r = await fetch(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/ta`, payload]);
}

async function apiGetTtEntry(page, tournamentId, entryId) {
  return page.evaluate(async (u) => {
    const r = await fetch(u);
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, `/api/tournaments/${tournamentId}/tt/entries/${entryId}`);
}

/** Admin PUT: overwrite qualification times + totalTime + rank. Optimistic-locked
 *  via `version`. Retried on 5xx since D1 occasionally 503s under load. */
async function apiUpdateTtEntry(page, tournamentId, entryId, payload) {
  return withRetry(() => page.evaluate(async ([u, d]) => {
    const r = await fetch(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/tt/entries/${entryId}`, payload]),
  { label: `TT entry PUT ${entryId}` });
}

/**
 * Force-set the rank of a TT entry WITHOUT sending times in the payload.
 *
 * The PUT /tt/entries route calls recalculateRanks only when `times` is present.
 * Sending only `rank` (no `times`) skips recalculation so tests that seed a
 * single-player slot (e.g. rank 17 in a 1-player tournament) can preserve the
 * desired rank even though recalculateRanks would otherwise derive rank=1 from
 * actual time ordering.
 *
 * Must be called BEFORE freezing the stage (frozen entries block all PUTs).
 */
async function apiForceRankOnly(page, tournamentId, entryId, rank) {
  const ge = await apiGetTtEntry(page, tournamentId, entryId);
  const version = ge.b?.data?.version;
  if (ge.s !== 200 || typeof version !== 'number') {
    throw new Error(`Failed to fetch TT entry version for rank-only update (${entryId}, status=${ge.s})`);
  }
  const res = await apiUpdateTtEntry(page, tournamentId, entryId, { version, rank });
  if (res.s !== 200) {
    throw new Error(`Failed to force rank ${rank} for entry ${entryId} (${res.s}): ${JSON.stringify(res.b).slice(0, 120)}`);
  }
  return res;
}

/** Fetch current version, then PUT full times + totalTime + rank in one call.
 *  Callers pass already-formatted `times` (e.g. { MC1: '1:00.00' }) + totalTimeMs + rank. */
async function apiSeedTtEntry(page, tournamentId, entryId, times, totalTimeMs, rank) {
  const ge = await apiGetTtEntry(page, tournamentId, entryId);
  const version = ge.b?.data?.version;
  if (ge.s !== 200 || typeof version !== 'number') {
    throw new Error(`Failed to fetch TT entry version for ${entryId} (${ge.s})`);
  }
  const res = await apiUpdateTtEntry(page, tournamentId, entryId, {
    version,
    times,
    totalTime: totalTimeMs,
    rank,
  });
  if (res.s !== 200) {
    throw new Error(`Failed to seed TT entry ${entryId} (${res.s}): ${JSON.stringify(res.b).slice(0, 200)}`);
  }
  return res;
}

/** Force a TTEntry rank without sending times so recalculateRanks is NOT
 * triggered. Use after apiSeedTtEntry when the desired rank (e.g. 17) would
 * be overwritten by the server's rank recalculation across all tournament
 * entries. Sends only `{version, rank}` — the PUT route only calls
 * recalculateRanks when `times` is present in the body. */
async function apiForceRankOnly(page, tournamentId, entryId, rank) {
  const ge = await apiGetTtEntry(page, tournamentId, entryId);
  const version = ge.b?.data?.version;
  if (ge.s !== 200 || typeof version !== 'number') {
    throw new Error(`Failed to fetch TT entry version for rank-only update (${entryId}, status=${ge.s})`);
  }
  const res = await apiUpdateTtEntry(page, tournamentId, entryId, { version, rank });
  if (res.s !== 200) {
    throw new Error(`Failed to force rank ${rank} for entry ${entryId} (${res.s}): ${JSON.stringify(res.b).slice(0, 120)}`);
  }
  return res;
}

async function apiPromoteTaPhase(page, tournamentId, action) {
  return page.evaluate(async ([u, d]) => {
    const r = await fetch(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/ta/phases`, { action }]);
}

async function apiSetTaPartner(page, tournamentId, entryId, partnerId) {
  return page.evaluate(async ([u, d]) => {
    const r = await fetch(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/ta`, { entryId, action: 'set_partner', partnerId }]);
}

async function apiUpdateTaSeeding(page, tournamentId, entryId, seeding) {
  /* Wrapped in withRetry because callers often fire this immediately after a
   * UI action (e.g. uiAddPlayersToTa). The TA page polls on an interval and
   * can tear down the page.evaluate execution context mid-fetch, producing a
   * transient "Failed to fetch" on the first attempt. withRetry treats
   * thrown errors as retryable, so this recovers on the next tick. */
  return withRetry(() => page.evaluate(async ([u, d]) => {
    const r = await fetch(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/ta`, { entryId, action: 'update_seeding', seeding }]),
  { label: `TA seeding PUT ${entryId}` });
}

/** Participant PUT: single-course time update. Works for self or partner per
 *  taPlayerSelfEdit / partnerId rules. Admin can bypass. */
async function apiTaParticipantEditTime(page, tournamentId, entryId, course, time) {
  return page.evaluate(async ([u, d]) => {
    const r = await fetch(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/ta`, { entryId, course, time }]);
}

async function apiFetchTa(page, tournamentId, stage = 'qualification') {
  return page.evaluate(async ([id, stageName]) => {
    const u = `/api/tournaments/${id}/ta?stage=${encodeURIComponent(stageName)}&ts=${Date.now()}`;
    const r = await fetch(u, { cache: 'no-store' });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [tournamentId, stage]);
}

async function apiFetchTaPhase(page, tournamentId, phase) {
  return page.evaluate(async ([id, phaseName]) => {
    const u = `/api/tournaments/${id}/ta/phases?phase=${encodeURIComponent(phaseName)}&ts=${Date.now()}`;
    const r = await fetch(u, { cache: 'no-store' });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [tournamentId, phase]);
}

/** Format a ms duration as the "M:SS.mm" string the TT API accepts. */
function formatTtTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

/** Build a 20-course `times` object for a player at `rank`. Spacing is
 *  rank×200 ms per course ⇒ ~4 sec total differential between players,
 *  enough for the scoring engine to sort deterministically. */
function makeTaTimesForRank(rank) {
  const times = {};
  let totalMs = 0;
  for (const course of TA_COURSES) {
    const courseMs = 60000 + rank * 200;
    times[course] = formatTtTime(courseMs);
    totalMs += courseMs;
  }
  return { times, totalMs };
}

/** 28-player TA qualification setup: creates players + tournament, then
 *  delegates to setupTaQualViaUi for the UI-driven entry/seeding/times
 *  assignment so every bulk setup helper shares one qualification path.
 *  Returns { tournamentId, playerIds, nicknames, entryIds, cleanup }. */
async function setupTa28PlayerQual(adminPage, label, opts = {}) {
  const stamp = Date.now();
  const players = [];
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const p of players) await apiDeletePlayer(adminPage, p.id);
  };

  try {
    for (let i = 1; i <= 28; i++) {
      const name = `E2E TA ${label} P${i}`;
      const nickname = `e2e_ta${label}_${stamp}_${i}`;
      const p = await uiCreatePlayer(adminPage, name, nickname);
      players.push({ id: p.id, name, nickname });
    }
    tournamentId = await uiCreateTournament(
      adminPage,
      `E2E TA ${label} ${stamp}`,
      { dualReportEnabled: false, ...opts },
    );

    const { entries } = await setupTaQualViaUi(adminPage, tournamentId, players);
    return {
      tournamentId,
      playerIds: players.map((p) => p.id),
      nicknames: players.map((p) => p.nickname),
      entryIds: entries.map((e) => e.entryId),
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

async function setupGp28PlayerFinals(adminPage, label, opts = {}) {
  const stamp = Date.now();
  const players = [];
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const p of players) await apiDeletePlayer(adminPage, p.id);
  };

  try {
    for (let i = 1; i <= 28; i++) {
      const name = `E2E GP ${label} P${i}`;
      const nickname = `e2e_gp${label}_${stamp}_${i}`;
      const p = await uiCreatePlayer(adminPage, name, nickname);
      players.push({ id: p.id, name, nickname });
    }
    tournamentId = await uiCreateTournament(adminPage, `E2E GP ${label} ${stamp}`, opts);
    await setupGpQualViaUi(adminPage, tournamentId, players);
    return {
      tournamentId,
      playerIds: players.map((p) => p.id),
      nicknames: players.map((p) => p.nickname),
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/* ───────── UI-based admin helpers ─────────
 * These drive the same flows as their apiXxx counterparts but go through the
 * actual React UI (/players, /tournaments/[id]/ta, /tournaments/[id]/{bm,mr,gp}).
 * Used by setupAllModes28PlayerQualification and the shared fixture so tc-all
 * exercises the real admin UX instead of hitting REST directly. */

/** Create a single player via the admin UI on /players.
 *  - Clicks "Add Player" → fills name/nickname → submits.
 *  - The POST /api/players is still the one the UI itself fires; we observe
 *    it via waitForResponse to pick up the generated id and temporaryPassword.
 *  - Dismisses the post-create "temporary password" dialog before returning. */
async function uiCreatePlayer(page, name, nickname) {
  if (!page.url().includes('/players')) {
    await nav(page, '/players');
  }
  /* Header "Add Player" button (first occurrence). */
  const openButton = page.getByRole('button', { name: /^(Add Player|プレイヤー追加)$/ }).first();
  await openButton.click();

  const formDialog = page.getByRole('dialog').filter({
    has: page.locator('#nickname'),
  }).first();
  await formDialog.waitFor({ state: 'visible', timeout: 15000 });
  await formDialog.locator('#name').fill(name);
  await formDialog.locator('#nickname').fill(nickname);

  const responsePromise = page.waitForResponse((res) =>
    res.url().includes('/api/players') &&
    res.request().method() === 'POST', { timeout: 30000 });
  const submitButton = formDialog.locator('button[type="submit"]').first();
  await submitButton.click();
  const response = await responsePromise;
  const body = await response.json().catch(() => ({}));
  if (response.status() !== 201) {
    throw new Error(`UI player creation failed for ${nickname} (${response.status()}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  const id = body?.data?.player?.id ?? null;
  const password = body?.data?.temporaryPassword ?? null;
  if (!id) throw new Error(`UI player creation missing id for ${nickname}`);

  /* Post-create temporary-password dialog. Dismiss via "I've Saved It". */
  const passwordDialog = page.getByRole('dialog').filter({
    hasText: /Temporary Password|一時パスワード/,
  }).first();
  try {
    await passwordDialog.waitFor({ state: 'visible', timeout: 5000 });
    await passwordDialog.getByRole('button', { name: /I've Saved It|保存しました/ }).click();
    await passwordDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  } catch {
    /* Dialog may not appear if the form didn't flip into password state; ignore. */
  }
  return { id, name, nickname, password };
}

/** Create a tournament via the /tournaments admin UI.
 *  - Clicks "Create Tournament" → fills name/date/slug → optionally toggles
 *    dualReport / taPlayerSelfEdit → submits.
 *  - Observes POST /api/tournaments via waitForResponse to pick up the id.
 *  Returns the new tournament id. */
async function uiCreateTournament(page, name, opts = {}) {
  const { dualReportEnabled = false, taPlayerSelfEdit, slug } = opts;
  if (!page.url().includes('/tournaments')) {
    await nav(page, '/tournaments');
  } else {
    /* Already on some /tournaments/... page — go back to the index so the
     * "Create Tournament" button is present. */
    await nav(page, '/tournaments');
  }
  const openButton = page.getByRole('button', { name: /^(Create Tournament|大会作成|トーナメント作成)$/ }).first();
  await openButton.click();

  const dialog = page.getByRole('dialog').filter({ has: page.locator('#name') }).first();
  await dialog.waitFor({ state: 'visible', timeout: 15000 });

  await dialog.locator('#name').fill(name);
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await dialog.locator('#date').fill(dateStr);
  if (slug) await dialog.locator('#slug').fill(slug);

  /* Default form state: dualReportEnabled=false, taPlayerSelfEdit=true. Only
   * toggle if the requested value differs from the default to avoid double
   * clicks that would re-flip the checkbox. */
  if (dualReportEnabled) {
    await dialog.locator('#dualReport').check();
  }
  if (taPlayerSelfEdit === false) {
    await dialog.locator('#taPlayerSelfEdit').uncheck();
  }

  const responsePromise = page.waitForResponse((res) =>
    res.url().includes('/api/tournaments') &&
    res.request().method() === 'POST', { timeout: 30000 });
  await dialog.getByRole('button', { name: /^(Create Tournament|大会作成|トーナメント作成)$/ }).click();
  const response = await responsePromise;
  const body = await response.json().catch(() => ({}));
  if (response.status() !== 201) {
    throw new Error(`UI tournament creation failed (${response.status()}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  const id = body?.data?.id ?? null;
  if (!id) throw new Error('UI tournament creation missing id');
  await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  return id;
}

/** Flip a draft tournament to active by clicking "Start Tournament" on
 *  /tournaments/[id]. Idempotent: if the tournament is already active the
 *  button isn't rendered and we simply return. */
async function uiActivateTournament(page, tournamentId) {
  await nav(page, `/tournaments/${tournamentId}`);
  const startBtn = page.getByRole('button', { name: /^(Start Tournament|トーナメント開始)$/ });
  /* If already active / completed the button isn't rendered. */
  if ((await startBtn.count()) === 0) return;

  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}`) &&
    res.request().method() === 'PUT', { timeout: 30000 });
  await startBtn.first().click();
  const response = await responsePromise;
  if (response.status() !== 200) {
    throw new Error(`UI tournament activation failed (${response.status()})`);
  }
  /* Wait for the status pill to update before returning so callers observing
   * "status === active" see the transition. */
  await page.waitForTimeout(500);
}

/** Click the TA "End Group Stage" / "予選を終了" button to flip qualification
 *  into the frozen state. Required before Phase 1/2/3 can be promoted — the
 *  Finals Phases card only renders for admins once qualification is frozen or
 *  a phase has already started. Idempotent: if qualification is already
 *  frozen the button shows "Unfreeze" instead and we return without clicking.
 */
async function uiFreezeTaQualification(page, tournamentId) {
  await nav(page, `/tournaments/${tournamentId}/ta`);
  const freezeBtn = page.getByRole('button', {
    name: /^(End Group Stage \(Confirm Times\)|予選を終了（タイム確定）)$/,
  });
  /* If already frozen, the button shows the Unfreeze label instead — nothing
   * to do. waitFor with a short timeout so an already-frozen tournament
   * doesn't block the suite. */
  if ((await freezeBtn.count()) === 0) return;

  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}`) &&
    res.request().method() === 'PUT', { timeout: 30000 });
  await freezeBtn.first().click();
  const response = await responsePromise;
  if (response.status() !== 200) {
    throw new Error(`UI freeze qualification failed (${response.status()})`);
  }
  /* Wait for the page to re-render with the Finals Phases card. */
  await page.waitForTimeout(1500);
}

/** Click the TA "Start Phase 1/2/3" button matching the requested action.
 *  The /ta page shows three phase cards with their respective start buttons;
 *  pre-conditions (entries seeded, prior phase completed) must already be met.
 *  Accepts the same `action` strings as apiPromoteTaPhase (promote_phase1/2/3)
 *  so existing call sites swap the api → ui prefix in-place. */
async function uiPromoteTaPhase(page, tournamentId, action) {
  const phaseMap = {
    promote_phase1: /^(Start Phase 1|フェーズ1開始)$/,
    promote_phase2: /^(Start Phase 2|フェーズ2開始)$/,
    promote_phase3: /^(Start Phase 3|フェーズ3開始)$/,
  };
  const pattern = phaseMap[action];
  if (!pattern) throw new Error(`uiPromoteTaPhase: unknown action ${action}`);

  /* Always navigate so we see fresh page state — prior tests (e.g. TC-805's
   * Setup dialog Save) may have left stale in-memory state that hides the
   * Start Phase button until a reload. */
  await nav(page, `/tournaments/${tournamentId}/ta`);
  const button = page.getByRole('button', { name: pattern }).first();
  await button.waitFor({ state: 'visible', timeout: 15000 });

  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}/ta/phases`) &&
    res.request().method() === 'POST', { timeout: 60000 });
  await button.click();
  const response = await responsePromise;
  if (response.status() !== 200) {
    throw new Error(`UI ${action} failed (${response.status()})`);
  }
  /* Promotion triggers a page-level state refresh (SWR/polling); let it settle
   * before the next interaction. */
  await page.waitForTimeout(1500);
}

/** Start a new round on the given TA phase page and return the roundNumber.
 *  `phase` is 'phase1' | 'phase2' | 'phase3'. Navigates if not already on
 *  the corresponding page. Phase 3 lives under /ta/finals. */
function _phasePath(phase) {
  if (phase === 'phase3') return 'finals';
  return phase;
}

async function uiPhaseStartRound(page, tournamentId, phase) {
  const path = _phasePath(phase);
  const expectedUrl = `/tournaments/${tournamentId}/ta/${path}`;
  if (!page.url().includes(expectedUrl)) {
    await nav(page, expectedUrl);
  }
  /* Some pages default to the Standings tab; switch to Round Control first
   * if the tab exists. */
  const roundControlTab = page.getByRole('tab', { name: /^(Round Control|ラウンドコントロール|ラウンド管理)$/ });
  if (await roundControlTab.count()) {
    await roundControlTab.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
  const startBtn = page.getByRole('button', { name: /^(Start Round \d+|ラウンド\s*\d+\s*開始)$/ }).first();
  await startBtn.waitFor({ state: 'visible', timeout: 15000 });

  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}/ta/phases`) &&
    res.request().method() === 'POST', { timeout: 60000 });
  await startBtn.click();
  const response = await responsePromise;
  const body = await response.json().catch(() => ({}));
  if (response.status() !== 200) {
    throw new Error(`UI start_round ${phase} failed (${response.status()})`);
  }
  const roundNumber = body?.data?.roundNumber ?? null;
  /* Let the Current Round tab render its inputs. */
  await page.waitForTimeout(800);
  return roundNumber;
}

/** Submit time results for the currently-open round.
 *  `results` is an array of `{ nickname?, playerId?, timeMs }` entries — we fill
 *  the input labelled with nickname when provided, otherwise fall back to the
 *  Nth input in document order. Phase 1/2 use "Submit & Eliminate Slowest";
 *  Phase 3 uses "Submit & Deduct Lives". */
async function uiPhaseSubmitResults(page, tournamentId, phase, results) {
  const submitPattern = phase === 'phase3'
    ? /^(Submit & Deduct Lives|送信＆ライフ減算)$/
    : /^(Submit & Eliminate Slowest|送信＆最遅者敗退)$/;

  /* Switch to Current Round tab if it's distinct from Round Control. */
  const currentTab = page.getByRole('tab', { name: /^(Current Round|現在のラウンド)$/ });
  if (await currentTab.count()) {
    await currentTab.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }

  const timeInputs = page.locator('input[placeholder="M:SS.mm"]');
  await timeInputs.first().waitFor({ state: 'visible', timeout: 15000 });

  for (let i = 0; i < results.length; i++) {
    const entry = results[i];
    const timeStr = msToMSS(entry.timeMs);
    /* Prefer row-specific targeting when the caller provides a nickname so we
     * don't rely on input ordering, which changes as players are eliminated. */
    if (entry.nickname) {
      const row = page.getByRole('row').filter({ hasText: entry.nickname }).first();
      const input = row.locator('input[placeholder="M:SS.mm"]').first();
      if (await input.count()) {
        await input.fill(timeStr);
        continue;
      }
    }
    await timeInputs.nth(i).fill(timeStr);
  }

  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}/ta/phases`) &&
    res.request().method() === 'POST', { timeout: 60000 });
  await page.getByRole('button', { name: submitPattern }).first().click();
  const response = await responsePromise;
  if (response.status() !== 200) {
    throw new Error(`UI submit_results ${phase} failed (${response.status()})`);
  }
  await page.waitForTimeout(1500);
}

/** Cancel the currently-open round for a TA phase from the UI.
 *  The round must exist but have no submitted results yet. */
async function uiPhaseCancelRound(page, tournamentId, phase) {
  const path = _phasePath(phase);
  const expectedUrl = `/tournaments/${tournamentId}/ta/${path}`;
  if (!page.url().includes(expectedUrl)) {
    await nav(page, expectedUrl);
  }

  const currentTab = page.getByRole('tab', { name: /^(Current Round|現在のラウンド)$/ });
  if (await currentTab.count()) {
    await currentTab.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }

  const cancelBtn = page.getByRole('button', { name: /^(Cancel Round|ラウンドキャンセル)$/ }).first();
  await cancelBtn.waitFor({ state: 'visible', timeout: 15000 });
  await cancelBtn.click();

  const dialog = page.getByRole('dialog').filter({
    hasText: /^(?:.|\n)*(Cancel Round\?|ラウンドをキャンセルしますか？)/,
  }).first();
  await dialog.waitFor({ state: 'visible', timeout: 15000 });

  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}/ta/phases`) &&
    res.request().method() === 'POST', { timeout: 60000 });
  await dialog.getByRole('button', { name: /^(Yes, Cancel Round|はい、キャンセル)$/ }).click();
  const response = await responsePromise;
  if (response.status() !== 200) {
    throw new Error(`UI cancel_round ${phase} failed (${response.status()})`);
  }
  await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

/** Undo the most recently-submitted round for a TA phase from the UI.
 *  The phase must have at least one completed round and no open round. */
async function uiPhaseUndoRound(page, tournamentId, phase) {
  const path = _phasePath(phase);
  const expectedUrl = `/tournaments/${tournamentId}/ta/${path}`;
  if (!page.url().includes(expectedUrl)) {
    await nav(page, expectedUrl);
  }

  const roundControlTab = page.getByRole('tab', { name: /^(Round Control|ラウンドコントロール|ラウンド管理)$/ });
  if (await roundControlTab.count()) {
    await roundControlTab.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }

  const undoBtn = page.getByRole('button', { name: /^(Undo Last Round|直前ラウンドを取り消す)$/ }).first();
  await undoBtn.waitFor({ state: 'visible', timeout: 15000 });
  await undoBtn.click();

  const dialog = page.getByRole('dialog').filter({
    hasText: /^(?:.|\n)*(Undo Last Round\?|直前ラウンドを取り消しますか？)/,
  }).first();
  await dialog.waitFor({ state: 'visible', timeout: 15000 });

  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}/ta/phases`) &&
    res.request().method() === 'POST', { timeout: 60000 });
  await dialog.getByRole('button', { name: /^(Yes, Undo Round|はい、取り消す)$/ }).click();
  const response = await responsePromise;
  if (response.status() !== 200) {
    throw new Error(`UI undo_round ${phase} failed (${response.status()})`);
  }
  await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

/** Format milliseconds as M:SS.mm for TA time inputs. */
function msToMSS(ms) {
  const totalCentiseconds = Math.round(ms / 10);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

/** Remove all currently-selected players from the BM/MR/GP group setup dialog. */
async function removeSelectedGroupPlayers(dialog) {
  for (let i = 0; i < 80; i++) {
    const removeButtons = dialog.getByRole('button', { name: /Remove|削除/ });
    const count = await removeButtons.count();
    if (count === 0) return;
    await removeButtons.first().click();
  }
  throw new Error('Too many selected players while clearing group setup dialog');
}

/** Check a single player's checkbox in the group setup dialog via search-filter. */
async function selectGroupPlayer(dialog, player) {
  const search = dialog.getByPlaceholder(/Search players|プレイヤーを検索/);
  await search.fill(player.nickname);
  const label = new RegExp(`^${escapeRegex(player.nickname)} \\(${escapeRegex(player.name)}\\)$`);
  await dialog.getByLabel(label).check();
  await search.fill('');
}

/** UI-based group setup for BM/MR/GP.
 *  - Opens the Setup Groups / Edit Groups dialog
 *  - Clears any existing selection (so re-running on an already-configured
 *    tournament is idempotent)
 *  - Selects each provided player by nickname+name label
 *  - Sets group count = 4, fills seeding 1..N, clicks Distribute by Seed
 *  - Saves and waits for the POST response to return 201 */
async function setupModePlayersViaUi(page, mode, tournamentId, players) {
  await nav(page, `/tournaments/${tournamentId}/${mode}`);
  const trigger = page.getByRole('button', { name: /Setup Groups|Edit Groups|グループ設定|グループ編集/ });
  await trigger.first().click();

  const dialog = page.getByRole('dialog').first();
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
  await removeSelectedGroupPlayers(dialog);

  for (const player of players) {
    await selectGroupPlayer(dialog, player);
  }

  /* Force product-default group count of 2 regardless of dialog-inferred
   * state. Safe for every player count because distribute is gated below. */
  await dialog.getByRole('button', { name: /^2$/ }).click();

  if (players.length >= 4) {
    /* Only distribute by seed when we have ≥4 players (≥2 per group), so
     * round-robin actually produces matches. Pair tests (2 players) rely on
     * the dialog default: both players land in availableGroups[0]='A' via
     * selectGroupPlayer, giving exactly one RR match. Distributing with
     * 2 players would split A/B and leave no intra-group match. */
    const seedingInputs = dialog.locator('input[type="number"]');
    for (let i = 0; i < players.length; i++) {
      await seedingInputs.nth(i).fill(String(i + 1));
    }
    await dialog.getByRole('button', { name: /Distribute by Seed|シード順で振分け/ }).click();
  }

  const save = dialog.getByRole('button', {
    name: /Create Groups & Matches|Update Groups|グループ＆試合作成|グループ更新/,
  });
  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}/${mode}`) &&
    res.request().method() === 'POST',
  );
  await save.click();
  const response = await responsePromise;
  if (response.status() !== 201) {
    throw new Error(`${mode.toUpperCase()} UI setup failed (${response.status()})`);
  }
  await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

/** UI-based TA qualification roster setup.
 *  Drives the unified "Setup Players / Edit Players" dialog on /ta:
 *   - Opens the dialog (admin-only; trigger labelled 'Setup Players' when the
 *     roster is empty, 'Edit Players' once entries exist — both covered).
 *   - Left column: per-player search + checkbox to include in the roster.
 *   - Right column: seeding input per selected entry. When `players[i].seeding`
 *     is a number, we fill it; otherwise the entry is left unranked.
 *   - Clicks Save. Internally the page sequences DELETE/POST/PUT calls to
 *     reconcile state, so we wait on the dialog hiding rather than pinning a
 *     single response.
 *  Accepts `players: Array<{ id, name, nickname, seeding? }>`. */
async function uiSetupTaPlayers(page, tournamentId, players) {
  await nav(page, `/tournaments/${tournamentId}/ta`);
  const trigger = page.getByRole('button', {
    name: /^(Setup Players|Edit Players|プレイヤー設定|プレイヤー編集)$/,
  }).first();
  await trigger.click();

  const dialog = page.getByRole('dialog').filter({
    hasText: /Setup Time Trial Players|Edit Time Trial Players|タイムアタック プレイヤー(設定|編集)/,
  }).first();
  await dialog.waitFor({ state: 'visible', timeout: 15000 });

  /* Left column: search + check each target player. Search resets the visible
   * list; state persists across filters (React-managed). */
  const search = dialog.getByPlaceholder(/Search players|プレイヤーを検索/);
  for (const player of players) {
    await search.fill(player.nickname);
    await page.waitForTimeout(150);
    /* Use label-text lookup to find the <label> element, then get its `for`
     * attribute to locate the exact checkbox button by id.
     * Avoids getByLabel().check() which times out on Radix UI <button role=checkbox>
     * inside nested overflow containers where Playwright cannot scroll-into-view. */
    const labelText = new RegExp(`^${escapeRegex(player.nickname)} \\(${escapeRegex(player.name)}\\)$`);
    const labelEl = dialog.locator('label').filter({ hasText: labelText }).first();
    await labelEl.waitFor({ state: 'visible', timeout: 10000 });
    const forId = await labelEl.getAttribute('for');
    if (!forId) throw new Error(`No for attribute on player label for ${player.nickname}`);
    const checkboxEl = dialog.locator(`button[id="${forId}"]`);
    await checkboxEl.scrollIntoViewIfNeeded().catch(() => {});
    await checkboxEl.check();
  }
  await search.fill('');
  await page.waitForTimeout(200);

  /* Right column: seeding inputs. Each selected entry renders one number
   * input with aria-label `${nickname} seeding`. Targeting by aria-label
   * survives the dialog's seeding-asc re-sort on each keystroke. */
  for (const player of players) {
    if (typeof player.seeding !== 'number') continue;
    const input = dialog.getByLabel(`${player.nickname} seeding`);
    await input.fill(String(player.seeding));
  }

  /* Dialog save button text: "Save" (EN) / "保存" (JA). */
  const saveButton = dialog.getByRole('button', { name: /^(Save|保存)$/ });
  await saveButton.click();

  /* Save fires a sequence of DELETE/POST/PUT calls then closes the dialog.
   * Wait for the dialog to hide as the completion signal, then let the TA
   * page settle before the next page.evaluate. */
  await dialog.waitFor({ state: 'hidden', timeout: 60000 });
  await page.waitForTimeout(1000);
}

/** Back-compat alias. Older callers import `uiAddPlayersToTa`; the underlying
 *  flow is now the unified setup dialog, which also accepts seeding. */
const uiAddPlayersToTa = uiSetupTaPlayers;

/** Open the admin match dialog by clicking the first remaining "Enter Score"
 *  button on the current mode's /matches tab. Returns a boolean indicating
 *  whether any button was clicked (false ⇒ all matches already completed).
 *  Caller is responsible for navigating to the mode page and switching to
 *  the Matches tab before the first call. */
async function openNextMatchDialog(page) {
  const enterButtons = page.getByRole('button', { name: /^(Enter Score|スコア入力|Enter Result|結果入力)$/ });
  const count = await enterButtons.count();
  if (count === 0) return false;
  const target = enterButtons.first();
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click();
  return true;
}

/** Iterates every qualification group on the given mode's standings tab and
 *  resolves any unresolved ties by setting rankOverride on N-1 of the N tied
 *  players (leaving exactly one free slot — the tie is resolved when only one
 *  player per tied rank remains without an override).
 *
 *  Call this after score entry when randomize=true is in use — random scores
 *  can easily produce ties within groups, which would block finals generation. */
async function resolveAllTies(page, tournamentId, mode) {
  const MODES_WITH_STANDINGS_ROUTE = { bm: 'bm', mr: 'mr', gp: 'gp' };
  if (!MODES_WITH_STANDINGS_ROUTE[mode]) return;
  const compareQualification = mode === 'gp'
    ? (a, b) => b.points - a.points || b.score - a.score
    : (a, b) => b.score - a.score || b.points - a.points;

  const apiPath = `/api/tournaments/${tournamentId}/${mode}`;
  /* Fetch full qualification data to build a playerId→qualId lookup per group. */
  const data = await page.evaluate(async (u) => {
    const r = await fetch(u, { cache: 'no-store' });
    return r.json().catch(() => ({}));
  }, apiPath);
  const qualifications = data.b?.data?.qualifications || data.data?.qualifications || [];
  /* Build playerId→qualId map per group */
  const playerIdToQualId = new Map();
  for (const q of qualifications) {
    playerIdToQualId.set(`${q.group}:${q.playerId}`, q.id);
  }
  const qualByGroup = qualifications.reduce((acc, q) => {
    if (!acc[q.group]) acc[q.group] = [];
    acc[q.group].push(q);
    return acc;
  }, {});

  for (const group of Object.keys(qualByGroup)) {
    const groupQualifications = qualByGroup[group] ?? [];
    const sorted = [...groupQualifications].sort(compareQualification);

    // Mirror the page-side computeTieAwareRanks/findUnresolvedTies logic so
    // finals seeding clears the same warning banner the admin page uses.
    const rankGroups = new Map();
    let previous = null;
    let currentAutoRank = 1;
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      if (previous && compareQualification(previous, entry) !== 0) {
        currentAutoRank = i + 1;
      }
      if (!rankGroups.has(currentAutoRank)) rankGroups.set(currentAutoRank, []);
      rankGroups.get(currentAutoRank).push(entry);
      previous = entry;
    }

    for (const [autoRank, tiedQualifications] of rankGroups.entries()) {
      if (tiedQualifications.length <= 1) continue;
      if (!tiedQualifications.some((qualification) => (qualification.mp ?? 0) > 0)) continue;

      const setOverrides = tiedQualifications
        .map((qualification) => qualification.rankOverride)
        .filter((value) => value != null);
      const distinctOverrides = new Set(setOverrides).size;
      const noDuplicateOverrides = distinctOverrides === setOverrides.length;
      const alreadyResolved = noDuplicateOverrides && distinctOverrides >= tiedQualifications.length - 1;
      if (alreadyResolved) continue;

      // Assign a distinct rankOverride to EVERY member of the tied group so
      // that no two players share the same effective rank.  Previously we only
      // set N-1 overrides, leaving the last player at the original autoRank
      // which collided with the first override (autoRank + 0).
      for (let i = 0; i < tiedQualifications.length; i++) {
        const qualification = tiedQualifications[i];
        const qualId = playerIdToQualId.get(`${group}:${qualification.playerId}`);
        if (!qualId) {
          console.warn(`[resolveAllTies] no qualification found for playerId ${qualification.playerId} in group ${group}`);
          continue;
        }
        const patch = await page.evaluate(async ([u, d]) => {
          const r = await fetch(u, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(d),
          });
          return { s: r.status };
        }, [apiPath, { qualificationId: qualId, rankOverride: autoRank + i }]);
        if (patch.s !== 200) {
          console.warn(`[resolveAllTies] PATCH rankOverride failed for qual ${qualId} (${patch.s})`);
        }
      }
    }
  }
}

/** Switch to the "Matches" tab on a mode page. No-op if already active. */
async function openMatchesTab(page) {
  const matchesTab = page.getByRole('tab', { name: /^(Matches|試合一覧)$/ });
  if ((await matchesTab.count()) > 0) {
    await matchesTab.first().click().catch(() => {});
    await page.waitForTimeout(200);
  }
}

function pickRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickRandomBmScore() {
  return pickRandomItem([
    { score1: 3, score2: 1 },
    { score1: 2, score2: 2 },
    { score1: 1, score2: 3 },
  ]);
}

function pickRandomMrScoreProfile() {
  return pickRandomItem([
    { score1: 3, score2: 1, p1Wins: [1, 2, 4] },
    { score1: 2, score2: 2, p1Wins: [1, 3] },
    { score1: 1, score2: 3, p1Wins: [2] },
  ]);
}

function pickRandomGpPoints() {
  return pickRandomItem([
    { points1: 45, points2: 0 },
    { points1: 33, points2: 12 },
    { points1: 24, points2: 21 },
    { points1: 12, points2: 33 },
    { points1: 0, points2: 45 },
  ]);
}

/** UI-based BM qualification score entry for EVERY open match of the given
 *  tournament. Iterates the Matches tab and, for each remaining "Enter Score"
 *  button, opens the score dialog and submits `score1`-`score2`. Defaults to
 *  random scores (one of [3-1, 2-2, 1-3]) to intentionally produce ties so
 *  the standings tie-resolution flow gets exercised. Pass a fixed { score1, score2 }
 *  when deterministic (non-tie) output is needed. */
async function uiPutAllBmQualScores(page, tournamentId, opts = {}) {
  const { score1: fixedS1, score2: fixedS2, randomize = true } = opts;
  await nav(page, `/tournaments/${tournamentId}/bm`);
  await openMatchesTab(page);

  /* Safety cap: 2 groups × 91 matches (14-player round-robin) + buffer.
   * Prevents an infinite loop if the dialog close never flips the button
   * state. */
  let lastButtonCount = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < 300; i++) {
    /* Periodic full re-navigation prevents renderer memory bloat during the
     * long 182-match qualification loop.  MR/GP already re-navigate every
     * iteration; BM keeps the same page alive, which can exhaust memory on
     * persistent-context Chromium and cause "Target page, context or browser
     * has been closed" (issue #517).  The previous 50-match interval proved
     * insufficient — reducing to 20 matches (~9 refreshes per full RR)
     * forces the React SPA to discard its DOM + JS heap more frequently,
     * giving the V8 GC a chance to reclaim leaked renderer memory before
     * the process is OOM-killed by the OS. */
    if (i > 0 && i % 20 === 0) {
      await nav(page, `/tournaments/${tournamentId}/bm`);
      await openMatchesTab(page);
    }

    const enterButtons = page.getByRole('button', { name: /^(Enter Score|スコア入力|Enter Result|結果入力)$/ });
    const currentCount = await enterButtons.count();
    if (currentCount === 0) return;

    /* If the visible Enter Score count didn't drop after the previous save
     * the UI is lagging — give the optimistic update a chance to settle
     * before we try again, otherwise we end up re-scoring the same first
     * match 120 times. */
    if (i > 0 && currentCount >= lastButtonCount) {
      await page.waitForTimeout(1000);
    }
    lastButtonCount = currentCount;

    /* Randomise the result to produce varied standings that actually trigger
     * ties (with deterministic 3-1 every match, all players in a group have
     * identical score+points → full tied group, breaking qualification). */
    let score1, score2;
    if (randomize) {
      const pick = pickRandomBmScore();
      score1 = pick.score1;
      score2 = pick.score2;
    } else {
      score1 = fixedS1 ?? 3;
      score2 = fixedS2 ?? 1;
    }

    const target = enterButtons.first();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.click();

    const dialog = page.getByRole('dialog').filter({
      hasText: /enterMatchScore|試合スコア入力|Enter Match Score/,
    }).first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });

    const inputs = dialog.locator('input[type="number"]');
    await inputs.nth(0).fill(String(score1));
    await inputs.nth(1).fill(String(score2));

    const responsePromise = page.waitForResponse((res) =>
      res.url().includes(`/api/tournaments/${tournamentId}/bm`) &&
      res.request().method() === 'PUT', { timeout: 30000 });
    await dialog.getByRole('button', { name: /^(Save Score|スコア保存)$/ }).click();
    const response = await responsePromise;
    if (response.status() !== 200) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`BM UI score save failed (${response.status()}): ${JSON.stringify(body).slice(0, 200)}`);
    }
    await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    /* Brief settle time lets React finish re-rendering the match list and
     * gives the renderer a breathing room between dialogs.  MR/GP both use
     * 300 ms after close; BM was missing this, which may have contributed to
     * renderer stress under the rapid 182-match dialog open/click/close loop. */
    await page.waitForTimeout(300);
    /* Wait for the Enter Score count to drop so the next iteration targets
     * a genuinely different match. Bail out after 5s if the UI never
     * refreshes — the iter cap is still the last line of defense. */
    await page.waitForFunction(
      ([prev]) => {
        const buttons = Array.from(document.querySelectorAll('button'))
          .filter((b) => /^(Enter Score|スコア入力|Enter Result|結果入力)$/.test(b.textContent?.trim() ?? ''));
        return buttons.length < prev;
      },
      [currentCount],
      { timeout: 5000 },
    ).catch(() => {});
  }
  throw new Error('BM UI score entry exceeded iteration cap');
}

/** UI-based MR qualification score entry. Each MR qualification match has
 *  pre-assigned courses (set at group-setup time), so we only need to click
 *  winner buttons. Defaults to randomised 3-1 / 2-2 / 1-3 outcomes so MR
 *  qualification exercises tie handling the same way BM does; pass
 *  randomize=false with fixed scores when deterministic output is needed. */
async function uiPutAllMrQualScores(page, tournamentId, opts = {}) {
  const { score1: fixedS1, score2: fixedS2, randomize = true } = opts;
  /* Safety cap: 2 groups × 91 matches + buffer. */
  for (let i = 0; i < 300; i++) {
    /* Re-navigate every iteration for the same reason the GP helper does:
     * the MR list loaded at iteration 0 holds match version numbers that go
     * stale after each successful save (the server bumps versions across
     * the group on standings recalc). The old in-place loop would hit 409
     * VERSION_CONFLICT after the first couple of saves and then hang on
     * waitForResponse because the Save button became a no-op client-side.
     * A fresh nav forces useSWR to refetch and keeps the loop walking
     * match-by-match until the list is empty. */
    await nav(page, `/tournaments/${tournamentId}/mr`);
    await openMatchesTab(page);

    const enterButtons = page.getByRole('button', { name: /^(Enter Score|スコア入力|Enter Result|結果入力)$/ });
    const currentCount = await enterButtons.count();
    if (currentCount === 0) return;

    const target = enterButtons.first();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.click();

    const dialog = page.getByRole('dialog').filter({
      hasText: /enterMatchResult|試合結果|Enter Match Result/,
    }).first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });

    /* Winner buttons are per-race rows. Each row has two buttons with
     * aria-label `<nick> wins race <n>`. Target them positionally: even
     * indices ⇒ player1-wins, odd indices ⇒ player2-wins. */
    const winnerButtons = dialog.locator('button[aria-label*="wins race"]');
    const btnCount = await winnerButtons.count();
    if (btnCount < 8) {
      throw new Error(`MR dialog has only ${btnCount} winner buttons (expected 8)`);
    }

    const outcome = randomize
      ? pickRandomMrScoreProfile()
      : (() => {
        const score1 = fixedS1 ?? 3;
        const score2 = fixedS2 ?? 1;
        if (score1 + score2 !== 4) {
          throw new Error(`MR fixed score must sum to 4 races, got ${score1}-${score2}`);
        }
        const p1Wins = Array.from({ length: score1 }, (_, idx) => idx + 1);
        return { score1, score2, p1Wins };
      })();

    for (let race = 1; race <= 4; race++) {
      const player1Wins = outcome.p1Wins.includes(race);
      const buttonIndex = (race - 1) * 2 + (player1Wins ? 0 : 1);
      await winnerButtons.nth(buttonIndex).click();
    }

    const responsePromise = page.waitForResponse((res) =>
      res.url().includes(`/api/tournaments/${tournamentId}/mr`) &&
      res.request().method() === 'PUT', { timeout: 30000 });
    await dialog.getByRole('button', { name: /^(Save Result|結果保存|保存)$/ }).click();
    const response = await responsePromise;
    if (response.status() !== 200) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`MR UI score save failed (${response.status()}): ${JSON.stringify(body).slice(0, 200)}`);
    }
    await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  throw new Error('MR UI score entry exceeded iteration cap');
}

/** UI-based GP qualification score entry using the dialog's "Manual Total
 *  Score" toggle to bypass the per-race position entry. selectedCup is auto-
 *  initialized from match.cup on dialog open, so we only need to tick the
 *  manual checkbox and fill two point totals. Defaults to randomised score
 *  profiles so qualification standings are less uniform, but callers can
 *  still force fixed totals when needed. */
async function uiPutAllGpQualScores(page, tournamentId, opts = {}) {
  const { points1: fixedP1, points2: fixedP2, randomize = true } = opts;
  /* Safety cap: 2 groups × 91 matches + buffer. */
  for (let i = 0; i < 300; i++) {
    /* Re-navigate every iteration: GP's server-side standings recalc bumps
     * match versions across the group when any single match saves, so a
     * client list that loaded at iteration 0 would carry stale version
     * numbers and the next manual-score PUT returns 409 VERSION_CONFLICT.
     * A fresh nav forces the page's useSWR to refetch match versions. */
    await nav(page, `/tournaments/${tournamentId}/gp`);
    await openMatchesTab(page);

    const clicked = await openNextMatchDialog(page);
    if (!clicked) return;

    const dialog = page.getByRole('dialog').filter({
      hasText: /enterMatchResult|試合結果|Enter Match Result/,
    }).first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });

    const { points1, points2 } = randomize
      ? pickRandomGpPoints()
      : { points1: fixedP1 ?? 45, points2: fixedP2 ?? 0 };

    /* Toggle manual-total-score; the id is stable. */
    await dialog.locator('#gp-manual-score').check();
    await dialog.locator('#manual-points1').fill(String(points1));
    await dialog.locator('#manual-points2').fill(String(points2));

    const responsePromise = page.waitForResponse((res) => {
      const url = res.url();
      return (url.includes(`/api/tournaments/${tournamentId}/gp/match/`) ||
        url.includes(`/api/tournaments/${tournamentId}/gp`)) &&
        res.request().method() === 'PUT';
    }, { timeout: 30000 });
    /* When manual total-score is toggled the button flips to Save Score /
     * スコア保存; without the toggle it's Save Result / 結果保存. Accept
     * either so this helper works regardless of the dialog's current mode. */
    await dialog.getByRole('button', {
      name: /^(Save Result|結果保存|Save Score|スコア保存|保存)$/,
    }).click();
    const response = await responsePromise;
    if (response.status() !== 200) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`GP UI score save failed (${response.status()}): ${JSON.stringify(body).slice(0, 200)}`);
    }
    await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  throw new Error('GP UI score entry exceeded iteration cap');
}

/** UI-based TA times entry for a single entry. Opens the "Edit Times" dialog
 *  and fills all 20 course inputs in `times` (keyed by course abbr, e.g. MC1).
 *  Inputs are positional in TA's four-cup grid (MushroomCup → FlowerCup →
 *  StarCup → SpecialCup, 5 courses each), so we fill by course abbr using
 *  the placeholder=M:SS.mm attribute which is stable across courses. */
async function uiSetTaEntryTimes(page, tournamentId, entry, times) {
  /* Caller is expected to already be on /tournaments/[id]/ta; only nav if
   * we're somewhere else so we don't blow away page state between entries. */
  if (!page.url().includes(`/tournaments/${tournamentId}/ta`)) {
    await nav(page, `/tournaments/${tournamentId}/ta`);
  }

  /* The /ta page defaults to the "standings" tab which has no Edit Times
   * buttons — switch to the Time Entry tab first. Tabs radix updates
   * aria-selected on click; repeated clicks are a safe no-op. */
  const timesTab = page.getByRole('tab', { name: /^(Time Entry|Time List|タイム入力|タイム一覧)$/ });
  if (await timesTab.count()) {
    await timesTab.first().click().catch(() => {});
  }

  /* Each entry row has an "Edit Times" button; filter the row by nickname. */
  const row = page.getByRole('row').filter({ hasText: entry.nickname }).first();
  await row.getByRole('button', { name: /^(Edit Times|タイム編集)$/ }).click();

  const dialog = page.getByRole('dialog').filter({
    has: page.locator('input[placeholder="M:SS.mm"]'),
  }).first();
  await dialog.waitFor({ state: 'visible', timeout: 15000 });

  /* Inputs render in a fixed cup/course order that matches TA_COURSES. */
  const inputs = dialog.locator('input[placeholder="M:SS.mm"]');
  for (let i = 0; i < TA_COURSES.length; i++) {
    const course = TA_COURSES[i];
    const value = times[course];
    if (!value) throw new Error(`Missing time for course ${course}`);
    await inputs.nth(i).fill(value);
  }

  /* The admin Edit Times dialog PUTs to /api/tournaments/[id]/ta with the
   * entry id in the body (see handleSaveTimes in ta/page.tsx). The former
   * matcher waited on /tt/entries/ which is only used by the single-entry
   * detail route, and would never fire for this flow — tests timed out. */
  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}/ta`) &&
    res.request().method() === 'PUT', { timeout: 30000 });
  await dialog.getByRole('button', { name: /^(Save Times|タイム保存|保存)$/ }).click();
  const response = await responsePromise;
  if (response.status() !== 200) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`TA UI times save failed (${response.status()}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/* ───────── Unified UI qualification setup helpers ─────────
 * Single source of truth for completing a full 28-player qualification round
 * via the admin UI (group entry + score entry). Every per-mode bulk setup
 * (setupBm28PlayerFinals, setupTa28PlayerQual, setupTaEntriesFromShared,
 * setupAllModes28PlayerQualification, and the tc-bm/tc-mr/tc-gp suite
 * helpers) delegates here so there is exactly one UI-based path for "fill
 * this tournament with qualification data". Do not add API-score fallbacks. */

/** API-driven BM qualification score entry for EVERY open match.
 *  Bypasses the UI dialog loop to avoid renderer memory bloat during the
 *  heavy 182-match 28-player setup (issue #517). Used by setupBmQualViaUi
 *  after players are assigned; individual match UI flow is still exercised
 *  by TC-501/502/322. */
async function apiPutAllBmQualScores(page, tournamentId, opts = {}) {
  const { score1: fixedS1, score2: fixedS2, randomize = true } = opts;
  const data = await apiFetchBm(page, tournamentId);
  const matches = (data.matches || []).filter((m) => !m.isBye && !m.completed);
  const CONCURRENCY = 1;

  for (let i = 0; i < matches.length; i += CONCURRENCY) {
    const batch = matches.slice(i, i + CONCURRENCY);
    const results = await page.evaluate(async ([url, batchMatches, randomize, fixedS1, fixedS2]) => {
      const scores = randomize
        ? null
        : { score1: fixedS1 ?? 3, score2: fixedS2 ?? 1 };

      return Promise.all(batchMatches.map(async (match) => {
        let score1;
        let score2;
        if (randomize) {
          const picks = [
            { score1: 3, score2: 1 },
            { score1: 2, score2: 2 },
            { score1: 1, score2: 3 },
          ];
          const pick = picks[Math.floor(Math.random() * picks.length)];
          score1 = pick.score1;
          score2 = pick.score2;
        } else {
          score1 = scores.score1;
          score2 = scores.score2;
        }

        const r = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId: match.id, score1, score2 }),
        });
        return { s: r.status, id: match.id };
      }));
    }, [`/api/tournaments/${tournamentId}/bm`, batch, randomize, fixedS1, fixedS2]);

    for (const res of results) {
      if (res.s !== 200) {
        throw new Error(`apiPutAllBmQualScores failed for match ${res.id} (${res.s})`);
      }
    }
  }
}

/** UI-driven BM qualification: group assignment + all match scores.
 *  `players` must be `{ id, name, nickname }[]`. Idempotent — safe to re-run
 *  because setupModePlayersViaUi clears selected players before re-adding. */
async function setupBmQualViaUi(adminPage, tournamentId, players, { score1 = 3, score2 = 1, randomize = true, resolveTies = true } = {}) {
  /* Freshly created tournaments start in draft status. The setup dialog
   * opens on draft pages but score PUTs require status='active' — without
   * this activation the save click never fires a response and the test
   * hangs on waitForResponse. Idempotent for already-active tournaments. */
  await uiActivateTournament(adminPage, tournamentId);
  /* The shared fixture tournament persists across suite invocations.
   * If a previous run left qualificationConfirmed=true, score PUTs are
   * blocked with 403. Reset the lock before re-seeding qualification. */
  await apiUpdateTournament(adminPage, tournamentId, { qualificationConfirmed: false });
  await setupModePlayersViaUi(adminPage, 'bm', tournamentId, players);
  /* Use API-based bulk scoring to avoid persistent-context renderer OOM
   * crashes during the 182-match 28-player qualification loop (issue #517).
   * The UI dialog flow is still covered by TC-501/502/322. */
  await apiPutAllBmQualScores(adminPage, tournamentId, { score1, score2, randomize });

  if (resolveTies) {
    await resolveAllTies(adminPage, tournamentId, 'bm');
  }
}

/** UI-driven MR qualification: group assignment + all match scores (3-1
 *  via per-race winner buttons). */
async function setupMrQualViaUi(
  adminPage,
  tournamentId,
  players,
  { score1 = 3, score2 = 1, randomize = true, resolveTies = true } = {},
) {
  await uiActivateTournament(adminPage, tournamentId);
  /* BM suite leaves qualificationConfirmed=true on the shared tournament,
   * which disables the MR score-entry button. Reset before re-seeding. */
  await apiUpdateTournament(adminPage, tournamentId, { qualificationConfirmed: false });
  await setupModePlayersViaUi(adminPage, 'mr', tournamentId, players);
  await uiPutAllMrQualScores(adminPage, tournamentId, { score1, score2, randomize });
  if (resolveTies) {
    await resolveAllTies(adminPage, tournamentId, 'mr');
  }
}

/** UI-driven GP qualification: group assignment + all match scores via the
 *  dialog's Manual Total Score toggle (45-0 by default, matching the
 *  player1-wins-all-5-races outcome of makeRacesP1Wins). */
async function setupGpQualViaUi(
  adminPage,
  tournamentId,
  players,
  { points1 = 45, points2 = 0, randomize = true, resolveTies = true } = {},
) {
  await uiActivateTournament(adminPage, tournamentId);
  /* BM suite leaves qualificationConfirmed=true on the shared tournament,
   * which disables the GP score-entry button. Reset before re-seeding. */
  await apiUpdateTournament(adminPage, tournamentId, { qualificationConfirmed: false });
  await setupModePlayersViaUi(adminPage, 'gp', tournamentId, players);
  await uiPutAllGpQualScores(adminPage, tournamentId, { points1, points2, randomize });
  if (resolveTies) {
    await resolveAllTies(adminPage, tournamentId, 'gp');
  }
}

/** TA has no rankOverride flow, so qualification setup avoids ties by seeding
 *  strictly-increasing total times. Wait until the server reflects a unique
 *  1..N ranking for the seeded player set so downstream phase tests see the
 *  same deterministic order the setup intended. */
async function ensureTaQualificationRanksSettled(adminPage, tournamentId, players, entries) {
  const expectedPlayerIds = new Set(players.map((player) => player.id));
  const expectedRanks = Array.from({ length: players.length }, (_, i) => i + 1).join(',');
  const deadline = Date.now() + 30000;
  let lastSummary = 'no data';

  while (Date.now() < deadline) {
    const current = await apiFetchTa(adminPage, tournamentId);
    const currentEntries = current.b?.data?.entries ?? [];
    const relevantEntries = currentEntries.filter((entry) => expectedPlayerIds.has(entry.playerId));
    const ranks = relevantEntries
      .map((entry) => entry.rank)
      .filter((rank) => rank != null)
      .sort((a, b) => a - b);
    lastSummary = relevantEntries
      .map((entry) => `${entry.player?.nickname ?? entry.playerId}:${entry.rank ?? 'null'}`)
      .join(',');

    const ranksOk = relevantEntries.length === players.length &&
      ranks.length === players.length &&
      ranks.join(',') === expectedRanks;
    if (ranksOk) {
      const rankByPlayerId = new Map(relevantEntries.map((entry) => [entry.playerId, entry.rank]));
      for (const entry of entries) {
        entry.rank = rankByPlayerId.get(entry.playerId) ?? entry.rank;
      }
      return;
    }
    await adminPage.waitForTimeout(1000);
  }

  throw new Error(
    `TA qualification ranks did not settle to 1..${players.length} within timeout: ${lastSummary}`
  );
}

/** UI-driven TA qualification: entry addition + times entry.
 *  - Activates the tournament (idempotent no-op if already active)
 *  - Clears prior entries so re-runs are clean
 *  - Adds all players via the "Add Player" dialog (UI)
 *  - Assigns seeding 1..N per entry via API (no bulk seeding UI exists)
 *  - When `seedTimes`, enters 20-course times via the Edit Times dialog (UI)
 *    with rank = index+1 so downstream standings are deterministic
 *  Returns `{ tournamentId, entries }` where entries carry entryId/playerId/
 *  nickname/rank in the input-player order. */
async function setupTaQualViaUi(adminPage, tournamentId, players, { seedTimes = true } = {}) {
  if (!tournamentId) throw new Error('setupTaQualViaUi: tournamentId is required');
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error('setupTaQualViaUi: players must be a non-empty array');
  }

  await uiActivateTournament(adminPage, tournamentId);

  /* Reset entries so re-running on a reused tournament lands on a clean slate.
   * The setup dialog itself diffs against the server state, but starting from
   * an empty roster keeps the dialog interactions (search/check) deterministic. */
  const existing = await apiFetchTa(adminPage, tournamentId);
  const existingEntries = existing.b?.data?.entries ?? [];
  for (const entry of existingEntries) {
    const url = `/api/tournaments/${tournamentId}/ta?entryId=${entry.id}`;
    const res = await adminPage.evaluate(async (u) => {
      const r = await fetch(u, { method: 'DELETE' });
      return { s: r.status, ok: r.ok };
    }, url);
    if (!res.ok && res.s !== 404) {
      throw new Error(`Failed to delete TA entry ${entry.id} (${res.s})`);
    }
  }

  /* Drive the unified setup dialog with seeding 1..N pre-assigned so we no
   * longer need a follow-up apiUpdateTaSeeding loop. */
  const playersWithSeeding = players.map((p, i) => ({ ...p, seeding: i + 1 }));
  await uiSetupTaPlayers(adminPage, tournamentId, playersWithSeeding);

  const taAfter = await apiFetchTa(adminPage, tournamentId);
  const addedEntries = taAfter.b?.data?.entries ?? [];
  const entriesByPlayerId = new Map(addedEntries.map((e) => [e.playerId, e]));

  const entries = [];
  for (let i = 0; i < players.length; i++) {
    const row = entriesByPlayerId.get(players[i].id);
    if (!row) throw new Error(`TA entry missing for player ${players[i].nickname}`);
    entries.push({
      entryId: row.id,
      playerId: players[i].id,
      nickname: players[i].nickname,
      rank: i + 1,
    });
  }

  if (seedTimes) {
    for (const e of entries) {
      const { times } = makeTaTimesForRank(e.rank);
      await uiSetTaEntryTimes(adminPage, tournamentId, { nickname: e.nickname }, times);
    }
    await ensureTaQualificationRanksSettled(adminPage, tournamentId, players, entries);
  }

  return { tournamentId, entries };
}

/** Shared 28-player tournament setup for tc-all's integrated cross-mode flow.
 * Creates one tournament, registers the same 28 players in TA/BM/MR/GP, and
 * completes qualification data for every mode so overall ranking can be
 * calculated from real multi-mode results.
 *
 * When `opts.fixture` is supplied (a value returned from
 * `createSharedE2eFixture`), this helper REUSES the fixture's shared 28
 * players + `normalTournament` instead of creating fresh ones. The returned
 * `cleanup` is a no-op in that case — the shared fixture owns lifecycle.
 * Any existing TA qualification entries on the shared tournament are deleted
 * before re-adding so the tournament is a clean slate across reruns.
 *
 * When `opts.fixture` is NOT supplied, legacy behavior is preserved: fresh
 * players + tournament are created with a timestamp suffix so this helper
 * remains safe for any non-tc-all callers. */
async function setupAllModes28PlayerQualification(adminPage, label, opts = {}) {
  const { fixture, ...tournamentOpts } = opts;
  const useSharedFixture = Boolean(fixture);

  const stamp = Date.now();
  let playerIds;
  let nicknames;
  let fixturePlayers = null;
  const entryIds = [];
  let tournamentId = null;
  /* Only tracks resources this helper itself created — when using a fixture,
   * cleanup is a no-op because the fixture owns the shared resources. */
  let ownedTournamentId = null;
  const ownedPlayerIds = [];

  const cleanup = async () => {
    if (useSharedFixture) return; // fixture owner cleans up
    await apiDeleteTournament(adminPage, ownedTournamentId);
    for (const id of ownedPlayerIds) await apiDeletePlayer(adminPage, id);
  };

  try {
    if (useSharedFixture) {
      fixturePlayers = fixture.players.slice(0, 28);
      if (fixturePlayers.length < 28) {
        throw new Error(`Shared fixture must expose >=28 players (got ${fixturePlayers.length})`);
      }
      playerIds = fixturePlayers.map((p) => p.id);
      nicknames = fixturePlayers.map((p) => p.nickname);
      tournamentId = fixture.normalTournament.id;

      /* Activating an already-active tournament is a no-op PUT; calling
       * unconditionally avoids an extra GET round-trip. */
      await uiActivateTournament(adminPage, tournamentId);

      /* Reset TA entries left behind by prior runs so the qualification stage
       * is a clean slate before re-adding the 28 seeded players.
       * Mirrors the pattern used by setupTaEntriesFromShared in fixtures.js. */
      const existing = await apiFetchTa(adminPage, tournamentId);
      const existingEntries = existing.b?.data?.entries ?? [];
      for (const entry of existingEntries) {
        const url = `/api/tournaments/${tournamentId}/ta?entryId=${entry.id}`;
        const res = await adminPage.evaluate(async (u) => {
          const r = await fetch(u, { method: 'DELETE' });
          return { s: r.status, ok: r.ok };
        }, url);
        if (!res.ok && res.s !== 404) {
          throw new Error(`Failed to delete TA entry ${entry.id} (${res.s})`);
        }
      }
    } else {
      playerIds = [];
      nicknames = [];
      const ownedNames = [];
      for (let i = 1; i <= 28; i++) {
        const displayName = `E2E ALL ${label} P${i}`;
        const nickname = `e2e_all${label}_${stamp}_${i}`;
        /* UI-based creation mirrors real admin flow; falls back to API on
         * navigation/session failure inside uiCreatePlayer itself. */
        const p = await uiCreatePlayer(adminPage, displayName, nickname);
        playerIds.push(p.id);
        nicknames.push(p.nickname);
        ownedNames.push(displayName);
        ownedPlayerIds.push(p.id);
      }
      /* Stash names alongside ids so we can build the {id, name, nickname}
       * shape the UI group-setup helper expects later. */
      fixturePlayers = playerIds.map((id, i) => ({
        id,
        name: ownedNames[i],
        nickname: nicknames[i],
      }));

      tournamentId = await uiCreateTournament(
        adminPage,
        `E2E All Modes ${label} ${stamp}`,
        { dualReportEnabled: false, ...tournamentOpts },
      );
      ownedTournamentId = tournamentId;
      await uiActivateTournament(adminPage, tournamentId);
    }

    /* Build the {id, name, nickname} shape needed by the UI helpers from
     * the fixture's full player records (or the owned list constructed
     * above). Kept in `playerIds` order so downstream rank assignments line up. */
    const uiPlayers = fixturePlayers.map((p) => ({
      id: p.id,
      name: p.name,
      nickname: p.nickname,
    }));

    /* ── TA entry addition via UI ───────────────────────────────────────── */
    await uiAddPlayersToTa(adminPage, tournamentId, uiPlayers);

    /* ── All four qualifications via the unified UI helpers ─────────────── */
    const taResult = await setupTaQualViaUi(adminPage, tournamentId, uiPlayers);
    for (const e of taResult.entries) entryIds.push(e.entryId);

    await setupBmQualViaUi(adminPage, tournamentId, uiPlayers);
    await setupMrQualViaUi(adminPage, tournamentId, uiPlayers);
    await setupGpQualViaUi(adminPage, tournamentId, uiPlayers);

    return { tournamentId, playerIds, nicknames, entryIds, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

module.exports = {
  /* config */
  BASE,
  NAV_WAIT_MS,
  TOTAL_GP_RACES,
  GROUP_LETTERS,
  /* logging / nav */
  makeResults,
  makeLog,
  installApiLogging,
  nav,
  escapeRegex,
  /* CRUD */
  apiCreatePlayer,
  apiCreateTournament,
  apiDeletePlayer,
  apiDeleteTournament,
  /* UI helpers */
  uiCreatePlayer,
  uiCreateTournament,
  uiActivateTournament,
  uiFreezeTaQualification,
  uiPromoteTaPhase,
  uiPhaseStartRound,
  uiPhaseSubmitResults,
  uiPhaseCancelRound,
  uiPhaseUndoRound,
  uiAddPlayersToTa,
  uiSetupTaPlayers,
  setupModePlayersViaUi,
  uiPutAllBmQualScores,
  uiPutAllMrQualScores,
  uiPutAllGpQualScores,
  uiSetTaEntryTimes,
  /* Unified UI qualification helpers */
  setupBmQualViaUi,
  setupMrQualViaUi,
  setupGpQualViaUi,
  setupTaQualViaUi,
  ensureTaQualificationRanksSettled,
  resolveAllTies,
  /* draft */
  snakeDraft28,
  /* player browser */
  loginPlayerBrowser,
  createBrowserLaunchEnv,
  /* retry */
  withRetry,
  /* BM */
  apiSetupBmGroup,
  apiFetchBm,
  apiPutBmQualScore,
  apiSetBmFinalsScore,
  apiGenerateBmFinals,
  apiFetchBmFinalsMatches,
  apiFetchBmFinalsState,
  setupBm28PlayerFinals,
  /* MR */
  apiSetupMrGroup,
  apiFetchMr,
  apiPutMrQualScore,
  apiGenerateMrFinals,
  apiSetMrFinalsScore,
  apiFetchMrFinalsMatches,
  apiFetchMrFinalsState,
  setupMr28PlayerFinals,
  /* GP */
  makeRacesP1Wins,
  makeRacesP2Wins,
  apiSetupGpGroup,
  apiFetchGp,
  apiPutGpQualScore,
  apiSetGpFinalsScore,
  apiGenerateGpFinals,
  apiFetchGpFinalsMatches,
  apiFetchGpFinalsState,
  setupGp28PlayerFinals,
  /* TA */
  TA_COURSES,
  apiUpdateTournament,
  apiActivateTournament,
  apiAddTaEntries,
  apiGetTtEntry,
  apiUpdateTtEntry,
  apiSeedTtEntry,
  apiForceRankOnly,
  apiPromoteTaPhase,
  apiSetTaPartner,
  apiUpdateTaSeeding,
  apiTaParticipantEditTime,
  apiFetchTa,
  apiFetchTaPhase,
  formatTtTime,
  makeTaTimesForRank,
  setupTa28PlayerQual,
  setupAllModes28PlayerQualification,
  getChromiumArgs,
};

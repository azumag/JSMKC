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
 * 28 players (or fewer) into 4 groups (A/B/C/D × 7) using boustrophedon
 * to keep top-seed clustering low. */

const GROUP_LETTERS = ['A', 'B', 'C', 'D'];

function snakeDraft28(playerIds) {
  return playerIds.map((playerId, i) => {
    const row = Math.floor(i / 4);
    const col = row % 2 === 0 ? (i % 4) : (3 - (i % 4));
    return { playerId, group: GROUP_LETTERS[col], seeding: i + 1 };
  });
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
    args: ['--disable-crash-reporter', '--disable-crashpad'],
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
    tournamentId = await apiCreateTournament(adminPage, `E2E BM ${label} ${stamp}`, opts);
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
  const json = await page.evaluate(async (u) => {
    const r = await fetch(`${u}?ts=${Date.now()}`, { cache: 'no-store' });
    return r.json().catch(() => ({}));
  }, `/api/tournaments/${tournamentId}/mr/finals`);
  /* Unwrap createSuccessResponse: json.data = { matches, bracketStructure, roundNames } */
  const matches = json.data?.matches || json.matches || [];
  return matches.slice().sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));
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
    tournamentId = await apiCreateTournament(adminPage, `E2E MR ${label} ${stamp}`, opts);
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

/** P1 finishes 1st in every race (driver pts 9 × 5 = 45), P2 finishes 5th (0 × 5 = 0). */
function makeRacesP1Wins() {
  const races = [];
  for (let i = 0; i < TOTAL_GP_RACES; i++) {
    races.push({ course: `course${i + 1}`, position1: 1, position2: 5 });
  }
  return races;
}

/** P2 wins instead — used for mismatch test. */
function makeRacesP2Wins() {
  const races = [];
  for (let i = 0; i < TOTAL_GP_RACES; i++) {
    races.push({ course: `course${i + 1}`, position1: 5, position2: 1 });
  }
  return races;
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

async function apiSetGpFinalsScore(page, tournamentId, matchId, score1, score2) {
  return withRetry(() => page.evaluate(async ([url, body]) => {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/gp/finals`, { matchId, score1, score2 }]),
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
    tournamentId = await apiCreateTournament(
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
    tournamentId = await apiCreateTournament(adminPage, `E2E GP ${label} ${stamp}`, opts);
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

  if (players.length >= 4) {
    await dialog.getByRole('button', { name: /^4$/ }).click();
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
    const label = new RegExp(`^${escapeRegex(player.nickname)} \\(${escapeRegex(player.name)}\\)$`);
    await dialog.getByLabel(label).check();
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
  const enterButtons = page.getByRole('button', { name: /^(Enter Score|スコア入力)$/ });
  const count = await enterButtons.count();
  if (count === 0) return false;
  const target = enterButtons.first();
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click();
  return true;
}

/** Switch to the "Matches" tab on a mode page. No-op if already active. */
async function openMatchesTab(page) {
  const matchesTab = page.getByRole('tab', { name: /^(Matches|試合一覧)$/ });
  if ((await matchesTab.count()) > 0) {
    await matchesTab.first().click().catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** UI-based BM qualification score entry for EVERY open match of the given
 *  tournament. Iterates the Matches tab and, for each remaining "Enter Score"
 *  button, opens the score dialog and submits `score1`-`score2` (defaults to
 *  3-1, matching the prior API setup and satisfying the sum=4 constraint). */
async function uiPutAllBmQualScores(page, tournamentId, score1 = 3, score2 = 1) {
  await nav(page, `/tournaments/${tournamentId}/bm`);
  await openMatchesTab(page);

  /* Safety cap: 4 groups × 21 matches + buffer. Prevents an infinite loop if
   * the dialog close never flips the button state. */
  for (let i = 0; i < 120; i++) {
    const clicked = await openNextMatchDialog(page);
    if (!clicked) return;

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
    await page.waitForTimeout(300);
  }
  throw new Error('BM UI score entry exceeded iteration cap');
}

/** UI-based MR qualification score entry. Each MR qualification match has
 *  pre-assigned courses (set at group-setup time), so we only need to click
 *  winner buttons. Produces 3-1 by default: player1 wins first 3 races,
 *  player2 wins the 4th. */
async function uiPutAllMrQualScores(page, tournamentId) {
  await nav(page, `/tournaments/${tournamentId}/mr`);
  await openMatchesTab(page);

  for (let i = 0; i < 120; i++) {
    const clicked = await openNextMatchDialog(page);
    if (!clicked) return;

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
    /* Race 1/2/3 → player1 wins; Race 4 → player2 wins. */
    await winnerButtons.nth(0).click();
    await winnerButtons.nth(2).click();
    await winnerButtons.nth(4).click();
    await winnerButtons.nth(7).click();

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
 *  manual checkbox and fill two point totals. */
async function uiPutAllGpQualScores(page, tournamentId, points1 = 45, points2 = 0) {
  await nav(page, `/tournaments/${tournamentId}/gp`);
  await openMatchesTab(page);

  for (let i = 0; i < 120; i++) {
    const clicked = await openNextMatchDialog(page);
    if (!clicked) return;

    const dialog = page.getByRole('dialog').filter({
      hasText: /enterMatchResult|試合結果|Enter Match Result/,
    }).first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });

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
    await dialog.getByRole('button', { name: /^(Save Result|結果保存|保存)$/ }).click();
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

  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}/tt/entries/`) &&
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

/** UI-driven BM qualification: group assignment + all match scores.
 *  `players` must be `{ id, name, nickname }[]`. Idempotent — safe to re-run
 *  because setupModePlayersViaUi clears selected players before re-adding. */
async function setupBmQualViaUi(adminPage, tournamentId, players, { score1 = 3, score2 = 1 } = {}) {
  await setupModePlayersViaUi(adminPage, 'bm', tournamentId, players);
  await uiPutAllBmQualScores(adminPage, tournamentId, score1, score2);
}

/** UI-driven MR qualification: group assignment + all match scores (3-1
 *  via per-race winner buttons). */
async function setupMrQualViaUi(adminPage, tournamentId, players) {
  await setupModePlayersViaUi(adminPage, 'mr', tournamentId, players);
  await uiPutAllMrQualScores(adminPage, tournamentId);
}

/** UI-driven GP qualification: group assignment + all match scores via the
 *  dialog's Manual Total Score toggle (45-0 by default, matching the
 *  player1-wins-all-5-races outcome of makeRacesP1Wins). */
async function setupGpQualViaUi(adminPage, tournamentId, players, { points1 = 45, points2 = 0 } = {}) {
  await setupModePlayersViaUi(adminPage, 'gp', tournamentId, players);
  await uiPutAllGpQualScores(adminPage, tournamentId, points1, points2);
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

  await apiActivateTournament(adminPage, tournamentId);

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
      await apiActivateTournament(adminPage, tournamentId);

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

      tournamentId = await apiCreateTournament(
        adminPage,
        `E2E All Modes ${label} ${stamp}`,
        { dualReportEnabled: false, ...tournamentOpts },
      );
      ownedTournamentId = tournamentId;
      await apiActivateTournament(adminPage, tournamentId);
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
  setupGp28PlayerFinals,
  /* TA */
  TA_COURSES,
  apiUpdateTournament,
  apiActivateTournament,
  apiAddTaEntries,
  apiGetTtEntry,
  apiUpdateTtEntry,
  apiSeedTtEntry,
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
};

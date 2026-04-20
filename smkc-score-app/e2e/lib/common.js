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

/* ───────── Player credentials login (separate browser context) ─────────
 * Use a fresh non-persistent browser so the admin's persistent profile stays
 * untouched. Caller must close the returned browser. */

async function loginPlayerBrowser(nickname, password) {
  const baseHome = process.env.E2E_BROWSER_HOME || path.join(os.tmpdir(), 'playwright-e2e-home');
  const configHome = path.join(baseHome, '.config');
  const cacheHome = path.join(baseHome, '.cache');
  const appSupportHome = path.join(baseHome, 'Library', 'Application Support');
  for (const dir of [baseHome, configHome, cacheHome, appSupportHome]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-crash-reporter', '--disable-crashpad'],
    env: {
      ...process.env,
      HOME: baseHome,
      XDG_CONFIG_HOME: configHome,
      XDG_CACHE_HOME: cacheHome,
    },
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

/** 28-player BM setup with built-in cleanup closure. Throws on failure
 *  *after* invoking cleanup so partial data never leaks to production. */
async function setupBm28PlayerFinals(adminPage, label, opts = {}) {
  const stamp = Date.now();
  const playerIds = [];
  const nicknames = [];
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await apiDeletePlayer(adminPage, id);
  };

  try {
    for (let i = 1; i <= 28; i++) {
      const p = await apiCreatePlayer(
        adminPage,
        `E2E BM ${label} P${i}`,
        `e2e_bm${label}_${stamp}_${i}`,
      );
      playerIds.push(p.id);
      nicknames.push(p.nickname);
    }
    tournamentId = await apiCreateTournament(adminPage, `E2E BM ${label} ${stamp}`, opts);
    const setup = await apiSetupBmGroup(adminPage, tournamentId, snakeDraft28(playerIds));
    if (setup.s !== 201) {
      throw new Error(`BM 28-player setup failed (${setup.s}): ${JSON.stringify(setup.b).slice(0, 200)}`);
    }

    /* 7-player RR per group = 21 non-BYE matches × 4 groups = 84 PUTs.
     * 3-1 satisfies sum=4 and yields a deterministic seed order in standings. */
    const data = await apiFetchBm(adminPage, tournamentId);
    const matches = (data.matches || []).filter((m) => !m.isBye && !m.completed);
    for (const m of matches) {
      const res = await apiPutBmQualScore(adminPage, tournamentId, m.id, 3, 1);
      if (res.s !== 200) {
        throw new Error(`BM qual put failed (${res.s}) match=${m.id}: ${JSON.stringify(res.b).slice(0, 200)}`);
      }
    }
    return { tournamentId, playerIds, nicknames, cleanup };
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
  const playerIds = [];
  const nicknames = [];
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await apiDeletePlayer(adminPage, id);
  };

  try {
    for (let i = 1; i <= 28; i++) {
      const p = await apiCreatePlayer(
        adminPage,
        `E2E MR ${label} P${i}`,
        `e2e_mr${label}_${stamp}_${i}`,
      );
      playerIds.push(p.id);
      nicknames.push(p.nickname);
    }
    tournamentId = await apiCreateTournament(adminPage, `E2E MR ${label} ${stamp}`, opts);
    const setup = await apiSetupMrGroup(adminPage, tournamentId, snakeDraft28(playerIds));
    if (setup.s !== 201) {
      throw new Error(`MR 28-player setup failed (${setup.s}): ${JSON.stringify(setup.b).slice(0, 200)}`);
    }

    const data = await apiFetchMr(adminPage, tournamentId);
    const matches = (data.matches || []).filter((m) => !m.isBye && !m.completed);
    for (const m of matches) {
      const res = await apiPutMrQualScore(adminPage, tournamentId, m.id, 3, 1);
      if (res.s !== 200) {
        throw new Error(`MR qual put failed (${res.s}) match=${m.id}: ${JSON.stringify(res.b).slice(0, 200)}`);
      }
    }
    return { tournamentId, playerIds, nicknames, cleanup };
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
  return page.evaluate(async ([u, d]) => {
    const r = await fetch(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/ta`, { entryId, action: 'update_seeding', seeding }]);
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

/** 28-player TA qualification setup: creates players + tournament, activates,
 *  adds all 28 via playerEntries, then seeds each entry with 20-course times.
 *  Returns { tournamentId, playerIds, nicknames, entryIds, cleanup }. */
async function setupTa28PlayerQual(adminPage, label, opts = {}) {
  const stamp = Date.now();
  const playerIds = [];
  const nicknames = [];
  const entryIds = [];
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await apiDeletePlayer(adminPage, id);
  };

  try {
    for (let i = 1; i <= 28; i++) {
      const p = await apiCreatePlayer(
        adminPage,
        `E2E TA ${label} P${i}`,
        `e2e_ta${label}_${stamp}_${i}`,
      );
      playerIds.push(p.id);
      nicknames.push(p.nickname);
    }
    tournamentId = await apiCreateTournament(
      adminPage,
      `E2E TA ${label} ${stamp}`,
      { dualReportEnabled: false, ...opts },
    );
    await apiActivateTournament(adminPage, tournamentId);

    const add = await apiAddTaEntries(adminPage, tournamentId, {
      playerEntries: playerIds.map((playerId, i) => ({ playerId, seeding: i + 1 })),
    });
    if (add.s !== 201) {
      throw new Error(`TA 28-player add failed (${add.s}): ${JSON.stringify(add.b).slice(0, 200)}`);
    }

    /* Seed per-entry qualification times. Assign rank = seeding so the best
     * seed produces the fastest time; real ranks are recomputed server-side. */
    const entries = add.b?.data?.entries ?? [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rank = i + 1;
      const { times, totalMs } = makeTaTimesForRank(rank);
      await apiSeedTtEntry(adminPage, tournamentId, entry.id, times, totalMs, rank);
      entryIds.push(entry.id);
    }
    return { tournamentId, playerIds, nicknames, entryIds, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

async function setupGp28PlayerFinals(adminPage, label, opts = {}) {
  const stamp = Date.now();
  const playerIds = [];
  const nicknames = [];
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await apiDeletePlayer(adminPage, id);
  };

  try {
    for (let i = 1; i <= 28; i++) {
      const p = await apiCreatePlayer(
        adminPage,
        `E2E GP ${label} P${i}`,
        `e2e_gp${label}_${stamp}_${i}`,
      );
      playerIds.push(p.id);
      nicknames.push(p.nickname);
    }
    tournamentId = await apiCreateTournament(adminPage, `E2E GP ${label} ${stamp}`, opts);
    const setup = await apiSetupGpGroup(adminPage, tournamentId, snakeDraft28(playerIds));
    if (setup.s !== 201) {
      throw new Error(`GP 28-player setup failed (${setup.s}): ${JSON.stringify(setup.b).slice(0, 200)}`);
    }

    /* GP qualification matches each carry a pre-assigned cup. Use the assigned
     * cup as-is in the PUT (the validator rejects cup mismatches per §7.4). */
    const data = await apiFetchGp(adminPage, tournamentId);
    const matches = (data.matches || []).filter((m) => !m.isBye && !m.completed);
    for (const m of matches) {
      if (!m.cup) continue;
      const res = await apiPutGpQualScore(adminPage, tournamentId, m.id, m.cup, makeRacesP1Wins());
      if (res.s !== 200) {
        throw new Error(`GP qual put failed (${res.s}) match=${m.id}: ${JSON.stringify(res.b).slice(0, 200)}`);
      }
    }
    return { tournamentId, playerIds, nicknames, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Shared 28-player tournament setup for tc-all's integrated cross-mode flow.
 * Creates one tournament, registers the same 28 players in TA/BM/MR/GP, and
 * completes qualification data for every mode so overall ranking can be
 * calculated from real multi-mode results. */
async function setupAllModes28PlayerQualification(adminPage, label, opts = {}) {
  const stamp = Date.now();
  const playerIds = [];
  const nicknames = [];
  const entryIds = [];
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await apiDeletePlayer(adminPage, id);
  };

  try {
    for (let i = 1; i <= 28; i++) {
      const p = await apiCreatePlayer(
        adminPage,
        `E2E ALL ${label} P${i}`,
        `e2e_all${label}_${stamp}_${i}`,
      );
      playerIds.push(p.id);
      nicknames.push(p.nickname);
    }

    tournamentId = await apiCreateTournament(
      adminPage,
      `E2E All Modes ${label} ${stamp}`,
      { dualReportEnabled: false, ...opts },
    );
    await apiActivateTournament(adminPage, tournamentId);

    const addTa = await apiAddTaEntries(adminPage, tournamentId, {
      playerEntries: playerIds.map((playerId, i) => ({ playerId, seeding: i + 1 })),
    });
    if (addTa.s !== 201) {
      throw new Error(`TA shared setup failed (${addTa.s}): ${JSON.stringify(addTa.b).slice(0, 200)}`);
    }

    const entries = addTa.b?.data?.entries ?? [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rank = i + 1;
      const { times, totalMs } = makeTaTimesForRank(rank);
      await apiSeedTtEntry(adminPage, tournamentId, entry.id, times, totalMs, rank);
      entryIds.push(entry.id);
    }

    const assignments = snakeDraft28(playerIds);

    const bmSetup = await apiSetupBmGroup(adminPage, tournamentId, assignments);
    if (bmSetup.s !== 201) {
      throw new Error(`BM shared setup failed (${bmSetup.s}): ${JSON.stringify(bmSetup.b).slice(0, 200)}`);
    }
    const bmData = await apiFetchBm(adminPage, tournamentId);
    for (const match of (bmData.matches || []).filter((m) => !m.isBye && !m.completed)) {
      const res = await apiPutBmQualScore(adminPage, tournamentId, match.id, 3, 1);
      if (res.s !== 200) {
        throw new Error(`BM shared qual put failed (${res.s}) match=${match.id}: ${JSON.stringify(res.b).slice(0, 200)}`);
      }
    }

    const mrSetup = await apiSetupMrGroup(adminPage, tournamentId, assignments);
    if (mrSetup.s !== 201) {
      throw new Error(`MR shared setup failed (${mrSetup.s}): ${JSON.stringify(mrSetup.b).slice(0, 200)}`);
    }
    const mrData = await apiFetchMr(adminPage, tournamentId);
    for (const match of (mrData.matches || []).filter((m) => !m.isBye && !m.completed)) {
      const res = await apiPutMrQualScore(adminPage, tournamentId, match.id, 3, 1);
      if (res.s !== 200) {
        throw new Error(`MR shared qual put failed (${res.s}) match=${match.id}: ${JSON.stringify(res.b).slice(0, 200)}`);
      }
    }

    const gpSetup = await apiSetupGpGroup(adminPage, tournamentId, assignments);
    if (gpSetup.s !== 201) {
      throw new Error(`GP shared setup failed (${gpSetup.s}): ${JSON.stringify(gpSetup.b).slice(0, 200)}`);
    }
    const gpData = await apiFetchGp(adminPage, tournamentId);
    for (const match of (gpData.matches || []).filter((m) => !m.isBye && !m.completed)) {
      if (!match.cup) {
        throw new Error(`GP shared match missing cup match=${match.id}`);
      }
      const res = await apiPutGpQualScore(adminPage, tournamentId, match.id, match.cup, makeRacesP1Wins());
      if (res.s !== 200) {
        throw new Error(`GP shared qual put failed (${res.s}) match=${match.id}: ${JSON.stringify(res.b).slice(0, 200)}`);
      }
    }

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
  /* draft */
  snakeDraft28,
  /* player browser */
  loginPlayerBrowser,
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

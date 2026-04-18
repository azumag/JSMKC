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

const BASE = process.env.E2E_BASE_URL || 'https://smkc.bluemoon.works';
const NAV_WAIT_MS = 8000;

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
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
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
  const json = await page.evaluate(async (u) => {
    const r = await fetch(`${u}?ts=${Date.now()}`, { cache: 'no-store' });
    return r.json().catch(() => ({}));
  }, `/api/tournaments/${tournamentId}/bm/finals`);
  /* BM uses 'grouped' GET style. Fall back to grouped arrays if `matches` is absent. */
  const arr = json.matches || [
    ...(json.winnersMatches || []),
    ...(json.losersMatches || []),
    ...(json.grandFinalMatches || []),
  ];
  return arr.slice().sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));
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
  return (json.matches || []).slice().sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));
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

/** GP finals uses 'paginated' GET style: { data, meta, totalPages }.
 *  Aggregate up to 5 pages of 50 entries (17 finals matches always fit in 1 page). */
async function apiFetchGpFinalsMatches(page, tournamentId) {
  const all = [];
  for (let p = 1; p <= 5; p++) {
    const json = await page.evaluate(async ([u, pp]) => {
      const r = await fetch(`${u}?page=${pp}&limit=50&ts=${Date.now()}`, { cache: 'no-store' });
      return r.json().catch(() => ({}));
    }, [`/api/tournaments/${tournamentId}/gp/finals`, p]);
    const data = json.data || [];
    if (data.length === 0) break;
    all.push(...data);
    const totalPages = json.totalPages || 1;
    if (p >= totalPages) break;
  }
  return all.slice().sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));
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

module.exports = {
  /* config */
  BASE,
  NAV_WAIT_MS,
  TOTAL_GP_RACES,
  GROUP_LETTERS,
  /* logging / nav */
  makeResults,
  makeLog,
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
};

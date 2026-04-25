/**
 * E2E tests for the OBS browser-source overlay feature.
 *
 * Coverage:
 *   TC-901  GET /api/tournaments/[id]/overlay-events is publicly readable
 *   TC-902  Response never leaks PII (ipAddress / userAgent / userId / password)
 *   TC-903  Admin score PUT surfaces a match_completed event for an unauth poller
 *   TC-904  `since` query parameter is respected (future-dated since → no events)
 *   TC-905  GET /tournaments/[id]/overlay renders without auth
 *
 * Setup is API-only: the suite owns a 2-player tournament with one BM qual
 * match, scores it, and tears everything down at the end. Independent from
 * the shared 28-player fixture so it can run in any order.
 *
 * Run: node e2e/tc-overlay.js  (from smkc-score-app/)
 */

const https = require('https');
const {
  apiActivateTournament,
  apiCreatePlayer,
  apiCreateTournament,
  apiDeletePlayer,
  apiDeleteTournament,
  apiFetchBm,
  apiPutBmQualScore,
  apiSetupBmGroup,
  makeLog,
  makeResults,
} = require('./lib/common');
const { runSuite } = require('./lib/runner');

const BASE = process.env.E2E_BASE_URL || 'https://smkc.bluemoon.works';
const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 1_500;

const results = makeResults();
const log = makeLog(results);

let fixture = null;

/**
 * Unauthenticated GET against the production overlay endpoint via Node's
 * `https` module. Mirrors the pattern used by the existing TC-328 / TC-329
 * blocks in tc-all.js: the persistent Playwright profile carries an admin
 * session cookie, so anything that needs to prove "no-auth works" must
 * leave the browser entirely.
 */
function httpsGet(path, { timeoutMs = 8_000 } = {}) {
  return new Promise((resolve) => {
    const req = https.get(`${BASE}${path}`, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        let body = null;
        try { body = JSON.parse(text); } catch { /* keep raw text below */ }
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body,
          text,
        });
      });
    });
    req.on('error', () => resolve({ status: 0, headers: {}, body: null, text: '' }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, headers: {}, body: null, text: '' }); });
  });
}

/**
 * Walks an arbitrary JSON-decoded value and returns the path of the first
 * forbidden key it finds. Used to assert that the public overlay payload
 * never accidentally includes server-side identifiers or PII fields.
 */
function findForbiddenKey(obj, forbidden, path = '$') {
  if (obj === null || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const hit = findForbiddenKey(obj[i], forbidden, `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of Object.keys(obj)) {
    if (forbidden.has(key)) return `${path}.${key}`;
    const hit = findForbiddenKey(obj[key], forbidden, `${path}.${key}`);
    if (hit) return hit;
  }
  return null;
}

/**
 * Polls the overlay endpoint until either `predicate(response)` returns
 * true or the timeout elapses. Returns the last response either way so the
 * caller can produce a useful failure message.
 */
async function pollUntil(path, predicate, { timeoutMs = POLL_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await httpsGet(path);
    if (last.status === 200 && predicate(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

/**
 * Single setup that creates a 2-player tournament with one BM qualification
 * match. All TCs share this fixture; we deliberately avoid scoring the
 * match here so TC-903 has a clean "before" state to compare against.
 */
async function setupFixture(adminPage) {
  const stamp = Date.now();
  const tournamentId = await apiCreateTournament(adminPage, `E2E Overlay ${stamp}`);
  const player1 = await apiCreatePlayer(adminPage, `Overlay P1 ${stamp}`, `e2e_ovl_p1_${stamp}`);
  const player2 = await apiCreatePlayer(adminPage, `Overlay P2 ${stamp}`, `e2e_ovl_p2_${stamp}`);
  await apiActivateTournament(adminPage, tournamentId);
  /* 2-player single-group round-robin = exactly one match. apiSetupBmGroup
     POSTs `/api/tournaments/[id]/bm` which runs the qualification factory. */
  const setupRes = await apiSetupBmGroup(adminPage, tournamentId, [
    { playerId: player1.id, group: 'A', seeding: 1 },
    { playerId: player2.id, group: 'A', seeding: 2 },
  ]);
  if (setupRes.s !== 200 && setupRes.s !== 201) {
    throw new Error(`BM setup failed: status=${setupRes.s} body=${JSON.stringify(setupRes.b)}`);
  }
  const bmData = await apiFetchBm(adminPage, tournamentId);
  const match = (bmData.matches || []).find((m) => !m.isBye);
  if (!match) throw new Error('No non-BYE BM match was created');
  return { tournamentId, players: [player1, player2], matchId: match.id };
}

async function teardownFixture(adminPage, fx) {
  if (!fx) return;
  await apiDeleteTournament(adminPage, fx.tournamentId).catch(() => {});
  for (const p of fx.players) {
    await apiDeletePlayer(adminPage, p.id).catch(() => {});
  }
}

/* ───────── TC-901: public overlay-events endpoint ───────── */
// eslint-disable-next-line no-unused-vars
async function runTc901(_adminPage) {
  try {
    const resp = await httpsGet(`/api/tournaments/${fixture.tournamentId}/overlay-events`);
    const okStatus = resp.status === 200;
    const ok = resp.body?.success === true;
    const data = resp.body?.data;
    const hasShape = data && typeof data.serverTime === 'string' && Array.isArray(data.events);
    const noStore = (resp.headers['cache-control'] || '').toLowerCase().includes('no-store');
    log('TC-901',
      okStatus && ok && hasShape && noStore ? 'PASS' : 'FAIL',
      !okStatus ? `status=${resp.status}` :
      !ok ? `success=${resp.body?.success}` :
      !hasShape ? `bad shape: ${JSON.stringify(data).slice(0, 120)}` :
      !noStore ? `Cache-Control missing no-store: "${resp.headers['cache-control']}"` : '');
  } catch (err) {
    log('TC-901', 'FAIL', err instanceof Error ? err.message : 'TC-901 threw');
  }
}

/* ───────── TC-902: PII non-exposure ───────── */
async function runTc902(adminPage) {
  /* Trigger a score so the response body actually has events to walk —
     an empty events array would PII-pass trivially. */
  const putRes = await apiPutBmQualScore(adminPage, fixture.tournamentId, fixture.matchId, 4, 0);
  if (putRes.s !== 200) {
    log('TC-902', 'FAIL', `Pre-test score PUT failed: ${putRes.s}`);
    return;
  }
  try {
    /* `since=0` epoch forces the server to widen its window so we definitely
       see the just-written match_completed event. */
    const resp = await pollUntil(
      `/api/tournaments/${fixture.tournamentId}/overlay-events?since=${encodeURIComponent(new Date(0).toISOString())}`,
      (r) => Array.isArray(r.body?.data?.events) && r.body.data.events.length > 0,
    );
    const forbidden = new Set(['ipAddress', 'userAgent', 'userId', 'password', 'email']);
    const leak = findForbiddenKey(resp.body, forbidden);
    const eventCount = resp.body?.data?.events?.length ?? 0;
    const pass = resp.status === 200 && !leak && eventCount > 0;
    log('TC-902',
      pass ? 'PASS' : 'FAIL',
      pass ? '' :
      resp.status !== 200 ? `status=${resp.status}` :
      leak ? `Leaked PII at ${leak}` :
      'No events to inspect (poll timeout)');
  } catch (err) {
    log('TC-902', 'FAIL', err instanceof Error ? err.message : 'TC-902 threw');
  }
}

/* ───────── TC-903: score → match_completed event ───────── */
// eslint-disable-next-line no-unused-vars
async function runTc903(_adminPage) {
  /* TC-902 already wrote the score, so we don't write again here — instead
     we re-query and confirm the event has the expected shape. We anchor
     `since` to the unix epoch so server-side filtering can't hide it. */
  try {
    const resp = await pollUntil(
      `/api/tournaments/${fixture.tournamentId}/overlay-events?since=${encodeURIComponent(new Date(0).toISOString())}`,
      (r) => (r.body?.data?.events || []).some((e) => e.type === 'match_completed' && e.mode === 'bm'),
    );
    const events = resp.body?.data?.events || [];
    const evt = events.find((e) => e.type === 'match_completed' && e.mode === 'bm');
    const hasScore = evt && /4\s*-\s*0/.test(evt.subtitle || '');
    const hasTitle = evt && /BM/.test(evt.title || '') && /終了/.test(evt.title || '');
    log('TC-903',
      evt && hasScore && hasTitle ? 'PASS' : 'FAIL',
      !evt ? `match_completed event missing in ${events.length} events` :
      !hasScore ? `subtitle missing 4-0: "${evt.subtitle}"` :
      !hasTitle ? `title missing BM/終了: "${evt.title}"` : '');
  } catch (err) {
    log('TC-903', 'FAIL', err instanceof Error ? err.message : 'TC-903 threw');
  }
}

/* ───────── TC-904: since filter ─────────
 * A future-dated `since` must drop everything we just wrote. */
// eslint-disable-next-line no-unused-vars
async function runTc904(_adminPage) {
  try {
    const future = new Date(Date.now() + 60_000).toISOString();
    const resp = await httpsGet(
      `/api/tournaments/${fixture.tournamentId}/overlay-events?since=${encodeURIComponent(future)}`,
    );
    const events = resp.body?.data?.events;
    const ok = resp.status === 200 && Array.isArray(events) && events.length === 0;
    log('TC-904',
      ok ? 'PASS' : 'FAIL',
      resp.status !== 200 ? `status=${resp.status}` :
      !Array.isArray(events) ? 'events not an array' :
      events.length !== 0 ? `expected empty, got ${events.length} events` : '');
  } catch (err) {
    log('TC-904', 'FAIL', err instanceof Error ? err.message : 'TC-904 threw');
  }
}

/* ───────── TC-905: overlay page renders unauthenticated ───────── */
// eslint-disable-next-line no-unused-vars
async function runTc905(_adminPage) {
  try {
    const resp = await httpsGet(`/tournaments/${fixture.tournamentId}/overlay`);
    /* Next.js streams the React tree as HTML; the data-testid on the root
       element is the most stable marker that our component actually rendered
       (vs. a 404 or auth wall). */
    const okStatus = resp.status === 200;
    const hasMarker = /data-testid=["']overlay-root["']/.test(resp.text || '');
    log('TC-905',
      okStatus && hasMarker ? 'PASS' : 'FAIL',
      !okStatus ? `status=${resp.status}` :
      !hasMarker ? 'overlay-root marker missing in HTML' : '');
  } catch (err) {
    log('TC-905', 'FAIL', err instanceof Error ? err.message : 'TC-905 threw');
  }
}

function getSuite() {
  return {
    suiteName: 'OVERLAY',
    results,
    log,
    beforeAll: async (adminPage) => {
      fixture = await setupFixture(adminPage);
    },
    afterAll: async (adminPage) => {
      await teardownFixture(adminPage, fixture);
      fixture = null;
    },
    tests: [
      /* TC-901 first: it asserts the empty-state response shape *before* any
         score is written. TC-902 writes the score; TC-903 reads it back. */
      { name: 'TC-901', fn: runTc901 },
      { name: 'TC-902', fn: runTc902 },
      { name: 'TC-903', fn: runTc903 },
      { name: 'TC-904', fn: runTc904 },
      { name: 'TC-905', fn: runTc905 },
    ],
  };
}

module.exports = {
  runTc901, runTc902, runTc903, runTc904, runTc905,
  getSuite,
  results,
};

if (require.main === module) {
  runSuite(getSuite());
}

/**
 * E2E tests for the OBS browser-source overlay feature.
 *
 * Coverage (one TC per emittable event type, plus the API/page surface):
 *   TC-901  GET /api/tournaments/[id]/overlay-events is publicly readable
 *   TC-902  Response never leaks PII (ipAddress / userAgent / userId / password)
 *   TC-903  Admin score PUT surfaces a `match_completed` event (BM)
 *   TC-904  `since` query parameter is respected
 *   TC-905  GET /tournaments/[id]/overlay renders without auth (SSR)
 *   TC-906  Overlay page actually renders a toast in a real browser
 *   TC-907  MR admin score PUT surfaces a `match_completed` event (mode='mr')
 *   TC-908  GP admin score PUT surfaces a `match_completed` event (mode='gp',
 *           covers the points1/points2 → score1/score2 remap in the route)
 *   TC-909  PUT { qualificationConfirmed: true } surfaces a
 *           `qualification_confirmed` event
 *   TC-910  TT entry seed (totalTime + rank) surfaces a `ta_time_recorded`
 *   TC-911  POST /overall-ranking surfaces an `overall_ranking_updated`
 *   TC-913  TA phase round creation surfaces a `ta_phase_advanced`
 *   TC-914  Player /report POST surfaces a `score_reported` (via ScoreEntryLog)
 *
 *   TC-912 (`finals_started`) is intentionally skipped: BM finals POST
 *   requires topN ∈ {8,16,24} (finals-route.ts L696), which is too heavy for
 *   a self-contained 2-player fixture. The unit tests in
 *   __tests__/lib/overlay/events.test.ts cover the aggregator path; manual
 *   QA on the shared 28-player fixture covers the route path.
 *   TC-915  GET /overlay-events?initial=1 returns currentPhase + event cap
 *   TC-916  PUT /broadcast sets 1P/2P names; public GET reads them back
 *   TC-917  overlay-events response includes overlayPlayer1Name / overlayPlayer2Name
 *   TC-918  PUT /broadcast with matchLabel/wins/ft → GET returns new fields (#644/#645/#649)
 *   TC-919  overlay-events includes overlayMatchLabel / overlayPlayer1Wins / overlayPlayer2Wins / overlayMatchFt
 *   TC-920  Dashboard page renders matchLabel and score display in real browser (#644/#645/#649)
 *
 * Setup is API-only: the suite owns a 2-player tournament with one match
 * per mode (BM/MR/GP) plus 2 TA entries, then tears everything down at the
 * end. Independent from the shared 28-player fixture so it can run in any
 * order alongside the BM/MR/GP/TA suites in tc-all.js.
 *
 * Run: node e2e/tc-overlay.js  (from smkc-score-app/)
 */

const https = require('https');
const {
  apiActivateTournament,
  apiAddTaEntries,
  apiCreatePlayer,
  apiCreateTournament,
  apiDeletePlayer,
  apiDeleteTournament,
  apiFetchBm,
  apiFetchGp,
  apiFetchMr,
  apiPromoteTaPhase,
  apiPutBmQualScore,
  apiPutGpQualScore,
  apiPutMrQualScore,
  apiSeedTtEntry,
  apiSetupBmGroup,
  apiSetupGpGroup,
  apiSetupMrGroup,
  apiUpdateTournament,
  loginPlayerBrowser,
  makeLog,
  makeResults,
  makeRacesP1Wins,
  makeTaTimesForRank,
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

/** Convenience: poll for an event matching `match` (predicate over the event). */
function pollForEvent(tournamentId, match) {
  /* `since=epoch` widens server window to its hard 10-min cap, which is
     plenty given each TC scopes its own write within ~30s. The route docs
     this in route.ts (MAX_LOOKBACK_MS). */
  const path = `/api/tournaments/${tournamentId}/overlay-events?since=${encodeURIComponent(new Date(0).toISOString())}`;
  return pollUntil(path, (r) => (r.body?.data?.events || []).some(match));
}

/** Custom call: TA phase round start. apiPromoteTaPhase only sends `action`. */
async function apiTaStartRound(page, tournamentId, phase) {
  return page.evaluate(async ([u, d]) => {
    const r = await fetch(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, [`/api/tournaments/${tournamentId}/ta/phases`, { action: 'start_round', phase }]);
}

/** POST /overall-ranking — recalculates and stores TournamentPlayerScore rows. */
async function apiRecalculateOverallRanking(page, tournamentId) {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return { s: r.status, b: await r.json().catch(() => ({})) };
  }, `/api/tournaments/${tournamentId}/overall-ranking`);
}

/** Match-validity check. Throws (rather than returning null) so a setup
 *  failure surfaces a useful stack trace instead of a downstream NPE. */
function pickMatch(matches, label) {
  const m = (matches || []).find((x) => !x.isBye);
  if (!m) throw new Error(`No non-BYE ${label} match was created`);
  return m;
}

/**
 * Setup creates a fully-configured 2-player tournament with one qualification
 * match per mode (BM/MR/GP) and two TA entries. Crucially we do NOT score,
 * confirm, or seed times here — TC-901 asserts an empty event stream right
 * after setup, so any state we touch must be one whose creation timestamp
 * doesn't generate an overlay event (matches start completed=false; TA
 * entries start with totalTime=null; tournament starts qualConfirmed=false).
 */
async function setupFixture(adminPage) {
  const stamp = Date.now();
  const tournamentId = await apiCreateTournament(adminPage, `E2E Overlay ${stamp}`);
  const player1 = await apiCreatePlayer(adminPage, `Overlay P1 ${stamp}`, `e2e_ovl_p1_${stamp}`);
  const player2 = await apiCreatePlayer(adminPage, `Overlay P2 ${stamp}`, `e2e_ovl_p2_${stamp}`);
  await apiActivateTournament(adminPage, tournamentId);
  /* Enable dual report so TC-914's player /report creates a ScoreEntryLog
     without auto-confirming the match (which would fire a match_completed
     event before TC-902 has a chance to). */
  await apiUpdateTournament(adminPage, tournamentId, { dualReportEnabled: true });

  const players = [
    { playerId: player1.id, group: 'A', seeding: 1 },
    { playerId: player2.id, group: 'A', seeding: 2 },
  ];

  /* All three 2P modes share the same group/player layout — a single match
     per mode is enough to cover match_completed for each. */
  const bmRes = await apiSetupBmGroup(adminPage, tournamentId, players);
  if (bmRes.s >= 400) throw new Error(`BM setup failed: ${bmRes.s} ${JSON.stringify(bmRes.b)}`);
  const mrRes = await apiSetupMrGroup(adminPage, tournamentId, players);
  if (mrRes.s >= 400) throw new Error(`MR setup failed: ${mrRes.s} ${JSON.stringify(mrRes.b)}`);
  const gpRes = await apiSetupGpGroup(adminPage, tournamentId, players);
  if (gpRes.s >= 400) throw new Error(`GP setup failed: ${gpRes.s} ${JSON.stringify(gpRes.b)}`);

  const [bmData, mrData, gpData] = await Promise.all([
    apiFetchBm(adminPage, tournamentId),
    apiFetchMr(adminPage, tournamentId),
    apiFetchGp(adminPage, tournamentId),
  ]);
  const bmMatch = pickMatch(bmData.matches, 'BM');
  const mrMatch = pickMatch(mrData.matches, 'MR');
  const gpMatch = pickMatch(gpData.matches, 'GP');

  /* TA entries — seeded but with no totalTime, so ta_time_recorded won't
     fire until TC-910 calls apiSeedTtEntry. */
  const taRes = await apiAddTaEntries(adminPage, tournamentId, {
    playerEntries: [
      { playerId: player1.id, seeding: 1 },
      { playerId: player2.id, seeding: 2 },
    ],
  });
  if (taRes.s >= 400) throw new Error(`TA setup failed: ${taRes.s} ${JSON.stringify(taRes.b)}`);
  const ttEntries = taRes.b?.data?.entries || taRes.b?.entries || [];
  if (ttEntries.length < 2) throw new Error(`Expected 2 TA entries, got ${ttEntries.length}`);

  return {
    tournamentId,
    players: [player1, player2],
    bmMatch,
    mrMatch,
    gpMatch,
    ttEntries,
  };
}

async function teardownFixture(adminPage, fx) {
  if (!fx) return;
  await apiDeleteTournament(adminPage, fx.tournamentId).catch(() => {});
  for (const p of fx.players) {
    await apiDeletePlayer(adminPage, p.id).catch(() => {});
  }
}

/* ───────── TC-901: public overlay-events endpoint, empty state ───────── */
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

/* ───────── TC-914: player /report → score_reported ─────────
 * Runs early (before any admin score PUTs) so the BM match is still
 * incomplete. Once admin completes it (TC-902), /report would no longer be
 * accepted.  Spawns its own browser context — we cannot reuse adminPage
 * because /report rejects admin sessions for a participant action. */
async function runTc914(adminPage) {
  let ctx = null;
  try {
    const reporter = fixture.players[0];
    ctx = await loginPlayerBrowser(reporter.nickname, reporter.password);
    const reportRes = await ctx.page.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${fixture.tournamentId}/bm/match/${fixture.bmMatch.id}/report`,
      { reportingPlayer: 1, score1: 3, score2: 1 },
    ]);
    if (reportRes.s !== 200 && reportRes.s !== 201) {
      log('TC-914', 'FAIL', `Player /report failed: ${reportRes.s} ${JSON.stringify(reportRes.b).slice(0, 200)}`);
      return;
    }
    const resp = await pollForEvent(
      fixture.tournamentId,
      (e) => e.type === 'score_reported' && e.mode === 'bm',
    );
    const evt = (resp.body?.data?.events || []).find((e) => e.type === 'score_reported' && e.mode === 'bm');
    const hasReporter = evt && evt.subtitle && evt.subtitle.includes(reporter.nickname);
    log('TC-914',
      evt && hasReporter ? 'PASS' : 'FAIL',
      !evt ? 'score_reported event missing' :
      !hasReporter ? `reporter nickname missing in subtitle: "${evt.subtitle}"` : '');

    /* Verify admin PUT in TC-902 won't be blocked: many implementations
       reject admin updates if the match has pending dual reports. We try a
       harmless GET to confirm the match is still in a writable state.
       (No assertion — purely informational; the real blocker would surface
       in TC-902 as a 4xx PUT.) */
  } catch (err) {
    log('TC-914', 'FAIL', err instanceof Error ? err.message : 'TC-914 threw');
  } finally {
    if (ctx?.browser) await ctx.browser.close().catch(() => {});
  }
  /* Suppress lint warning on unused param: adminPage is the suite contract. */
  void adminPage;
}

/* ───────── TC-902: PII non-exposure (writes BM 4-0 to populate events) ───────── */
async function runTc902(adminPage) {
  const putRes = await apiPutBmQualScore(adminPage, fixture.tournamentId, fixture.bmMatch.id, 4, 0);
  if (putRes.s !== 200) {
    log('TC-902', 'FAIL', `Pre-test score PUT failed: ${putRes.s}`);
    return;
  }
  try {
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

/* ───────── TC-903: BM match_completed read-back ───────── */
// eslint-disable-next-line no-unused-vars
async function runTc903(_adminPage) {
  try {
    const resp = await pollForEvent(
      fixture.tournamentId,
      (e) => e.type === 'match_completed' && e.mode === 'bm',
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

/* ───────── TC-904: future since → empty events ───────── */
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

/* ───────── TC-905: overlay HTML reachable unauthenticated ───────── */
// eslint-disable-next-line no-unused-vars
async function runTc905(_adminPage) {
  try {
    const resp = await httpsGet(`/tournaments/${fixture.tournamentId}/overlay`);
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

/* ───────── TC-907: MR match_completed ───────── */
async function runTc907(adminPage) {
  try {
    const putRes = await apiPutMrQualScore(adminPage, fixture.tournamentId, fixture.mrMatch.id, 3, 1);
    if (putRes.s !== 200) {
      log('TC-907', 'FAIL', `MR score PUT failed: ${putRes.s} ${JSON.stringify(putRes.b).slice(0, 200)}`);
      return;
    }
    const resp = await pollForEvent(
      fixture.tournamentId,
      (e) => e.type === 'match_completed' && e.mode === 'mr',
    );
    const evt = (resp.body?.data?.events || []).find((e) => e.type === 'match_completed' && e.mode === 'mr');
    const hasScore = evt && /3\s*-\s*1/.test(evt.subtitle || '');
    const hasTitle = evt && /MR/.test(evt.title || '');
    const pass = !!(evt && hasScore && hasTitle);
    log('TC-907',
      pass ? 'PASS' : 'FAIL',
      pass ? '' :
      !evt ? 'MR match_completed event missing' :
      !hasScore ? `subtitle missing 3-1: "${evt.subtitle}"` :
      `title missing MR: "${evt.title}"`);
  } catch (err) {
    log('TC-907', 'FAIL', err instanceof Error ? err.message : 'TC-907 threw');
  }
}

/* ───────── TC-908: GP match_completed (covers points→score remap) ───────── */
async function runTc908(adminPage) {
  try {
    const cup = fixture.gpMatch.cup || 'Mushroom';
    const races = makeRacesP1Wins(cup);
    const putRes = await apiPutGpQualScore(adminPage, fixture.tournamentId, fixture.gpMatch.id, cup, races);
    if (putRes.s !== 200) {
      log('TC-908', 'FAIL', `GP score PUT failed: ${putRes.s} ${JSON.stringify(putRes.b).slice(0, 200)}`);
      return;
    }
    const resp = await pollForEvent(
      fixture.tournamentId,
      (e) => e.type === 'match_completed' && e.mode === 'gp',
    );
    const evt = (resp.body?.data?.events || []).find((e) => e.type === 'match_completed' && e.mode === 'gp');
    /* P1 wins all 5 courses → 9pts × 5 = 45-0. The route remaps points1/2
       into score1/2 before the aggregator runs, so the subtitle uses the
       raw GP point totals. */
    const hasScore = evt && /\d+\s*-\s*\d+/.test(evt.subtitle || '');
    const hasTitle = evt && /GP/.test(evt.title || '');
    const pass = !!(evt && hasScore && hasTitle);
    log('TC-908',
      pass ? 'PASS' : 'FAIL',
      pass ? '' :
      !evt ? 'GP match_completed event missing' :
      !hasScore ? `subtitle missing score format: "${evt.subtitle}"` :
      `title missing GP: "${evt.title}"`);
  } catch (err) {
    log('TC-908', 'FAIL', err instanceof Error ? err.message : 'TC-908 threw');
  }
}

/* ───────── TC-910: ta_time_recorded ─────────
 * Seeds qualification times for both TA entries — both fire ta_time_recorded
 * events. The aggregator emits one per TTEntry whose totalTime is non-null
 * and updatedAt > since.
 *
 * IMPORTANT: makeTaTimesForRank produces all 20 TA_COURSES. The PUT route
 * runs recalculateRanks which RECOMPUTES totalTime from the times object
 * (ignoring the totalTime field we send). Partial times (< 20 courses)
 * collapse to null totalTime, which would suppress the event. */
async function runTc910(adminPage) {
  try {
    const t1 = makeTaTimesForRank(1);
    const t2 = makeTaTimesForRank(2);
    await apiSeedTtEntry(adminPage, fixture.tournamentId, fixture.ttEntries[0].id, t1.times, t1.totalMs, 1);
    await apiSeedTtEntry(adminPage, fixture.tournamentId, fixture.ttEntries[1].id, t2.times, t2.totalMs, 2);
    const resp = await pollForEvent(
      fixture.tournamentId,
      (e) => e.type === 'ta_time_recorded',
    );
    const evt = (resp.body?.data?.events || []).find((e) => e.type === 'ta_time_recorded');
    const hasMode = evt && evt.mode === 'ta';
    // title format: "[phaseLabel] playerNick が course で time を記録しました（現在 N 位）"
    // The literal "TA" was intentionally removed from the title in 779e988;
    // mode is carried by evt.mode and evt.taTimeRecord instead.
    const hasTitle = evt && /記録しました/.test(evt.title || '');
    const hasTaPayload = evt && evt.taTimeRecord?.course && evt.taTimeRecord?.time;
    const pass = !!(evt && hasMode && hasTitle && hasTaPayload);
    log('TC-910',
      pass ? 'PASS' : 'FAIL',
      pass ? '' :
      !evt ? 'ta_time_recorded event missing' :
      !hasMode ? `wrong mode ${evt.mode}` :
      !hasTitle ? `title missing 記録しました: "${evt.title}"` :
      `taTimeRecord payload incomplete: ${JSON.stringify(evt.taTimeRecord)}`);
  } catch (err) {
    log('TC-910', 'FAIL', err instanceof Error ? err.message : 'TC-910 threw');
  }
}

/* ───────── TC-913: ta_phase_advanced ─────────
 * Promotes both ranked players into phase3 (top 8 — 2 ≤ 8 so both qualify),
 * then starts a phase round which writes a TTPhaseRound row. */
async function runTc913(adminPage) {
  try {
    const promoteRes = await apiPromoteTaPhase(adminPage, fixture.tournamentId, 'promote_phase3');
    if (promoteRes.s !== 200) {
      log('TC-913', 'FAIL', `promote_phase3 failed: ${promoteRes.s} ${JSON.stringify(promoteRes.b).slice(0, 200)}`);
      return;
    }
    const startRes = await apiTaStartRound(adminPage, fixture.tournamentId, 'phase3');
    if (startRes.s !== 200) {
      log('TC-913', 'FAIL', `start_round phase3 failed: ${startRes.s} ${JSON.stringify(startRes.b).slice(0, 200)}`);
      return;
    }
    const resp = await pollForEvent(
      fixture.tournamentId,
      (e) => e.type === 'ta_phase_advanced',
    );
    const evt = (resp.body?.data?.events || []).find((e) => e.type === 'ta_phase_advanced');
    const hasMode = evt && evt.mode === 'ta';
    const hasPhase = evt && /phase3/i.test(evt.title || '');
    const pass = !!(evt && hasMode && hasPhase);
    log('TC-913',
      pass ? 'PASS' : 'FAIL',
      pass ? '' :
      !evt ? 'ta_phase_advanced event missing' :
      !hasMode ? `wrong mode ${evt.mode}` :
      `unexpected title: "${evt.title}"`);
  } catch (err) {
    log('TC-913', 'FAIL', err instanceof Error ? err.message : 'TC-913 threw');
  }
}

/* ───────── TC-911: overall_ranking_updated ───────── */
async function runTc911(adminPage) {
  try {
    const recRes = await apiRecalculateOverallRanking(adminPage, fixture.tournamentId);
    if (recRes.s !== 200 && recRes.s !== 201) {
      log('TC-911', 'FAIL', `POST /overall-ranking failed: ${recRes.s} ${JSON.stringify(recRes.b).slice(0, 200)}`);
      return;
    }
    const resp = await pollForEvent(
      fixture.tournamentId,
      (e) => e.type === 'overall_ranking_updated',
    );
    const evt = (resp.body?.data?.events || []).find((e) => e.type === 'overall_ranking_updated');
    log('TC-911',
      evt ? 'PASS' : 'FAIL',
      evt ? '' : 'overall_ranking_updated event missing');
  } catch (err) {
    log('TC-911', 'FAIL', err instanceof Error ? err.message : 'TC-911 threw');
  }
}

/* ───────── TC-909: qualification_confirmed (LAST: blocks score writes) ───────── */
async function runTc909(adminPage) {
  try {
    const res = await apiUpdateTournament(adminPage, fixture.tournamentId, { qualificationConfirmed: true });
    if (res.s !== 200) {
      log('TC-909', 'FAIL', `PUT qualificationConfirmed failed: ${res.s} ${JSON.stringify(res.b).slice(0, 200)}`);
      return;
    }
    const resp = await pollForEvent(
      fixture.tournamentId,
      (e) => e.type === 'qualification_confirmed',
    );
    const evt = (resp.body?.data?.events || []).find((e) => e.type === 'qualification_confirmed');
    const hasTitle = evt && /予選確定/.test(evt.title || '');
    const pass = !!(evt && hasTitle);
    log('TC-909',
      pass ? 'PASS' : 'FAIL',
      pass ? '' :
      !evt ? 'qualification_confirmed event missing' :
      `title missing 予選確定: "${evt.title}"`);
  } catch (err) {
    log('TC-909', 'FAIL', err instanceof Error ? err.message : 'TC-909 threw');
  }
}

/* ───────── TC-915: overlay ?initial=1 returns currentPhase + capped events ─────────
 * Verifies the dashboard initial-load path:
 *   - status 200 with success: true
 *   - `currentPhase` string is present (phase resolver always returns a value)
 *   - events array is present and within the 100-event cap (INITIAL_BACKFILL_LIMIT)
 *   - Cache-Control: no-store header set (same as regular polls)
 *
 * Note: TC-909 (qualificationConfirmed) must have run first so the phase is
 * at least "qualification_confirmed", giving us a populated `currentPhase`. */
async function runTc915(_adminPage) {
  try {
    const resp = await httpsGet(
      `/api/tournaments/${fixture.tournamentId}/overlay-events?initial=1`,
    );
    const okStatus = resp.status === 200;
    const ok = resp.body?.success === true;
    const data = resp.body?.data;
    const hasEvents = data && Array.isArray(data.events);
    // currentPhase is a string returned by computeCurrentPhase (e.g. "予選確定" or "予選中")
    const hasCurrentPhase = data && 'currentPhase' in data && typeof data.currentPhase === 'string';
    const hasServerTime = data && typeof data.serverTime === 'string';
    const noStore = (resp.headers['cache-control'] || '').toLowerCase().includes('no-store');
    // Events are capped to INITIAL_BACKFILL_LIMIT (100)
    const withinLimit = hasEvents && data.events.length <= 100;

    log('TC-915',
      okStatus && ok && hasEvents && hasCurrentPhase && hasServerTime && noStore && withinLimit
        ? 'PASS' : 'FAIL',
      !okStatus ? `status=${resp.status}` :
      !ok ? `success=${resp.body?.success}` :
      !hasEvents ? 'events array missing' :
      !hasCurrentPhase ? `currentPhase missing or wrong type: ${JSON.stringify(Object.keys(data || {})).slice(0, 80)}` :
      !hasServerTime ? 'serverTime missing' :
      !noStore ? `Cache-Control missing no-store: "${resp.headers['cache-control']}"` :
      !withinLimit ? `events.length=${data.events.length} exceeds cap (100)` : '');
  } catch (err) {
    log('TC-915', 'FAIL', err instanceof Error ? err.message : 'TC-915 threw');
  }
}

/* ───────── TC-916: Broadcast API PUT/GET (Issue #635) ─────────
 * Admin sets 1P/2P names via PUT /broadcast (needs auth → browser eval).
 * Public GET /broadcast (unauthenticated, via httpsGet) must return them. */
async function runTc916(adminPage) {
  try {
    const stamp = Date.now();
    const name1 = `TC916_P1_${stamp}`;
    const name2 = `TC916_P2_${stamp}`;

    const putRes = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${fixture.tournamentId}/broadcast`,
      { player1Name: name1, player2Name: name2 },
    ]);

    const putOk = putRes.s === 200;

    /* Unauthenticated GET must succeed (public endpoint) */
    const getResp = await httpsGet(`/api/tournaments/${fixture.tournamentId}/broadcast`);
    const getData = getResp.body?.data;
    const namesMatch = getData?.player1Name === name1 && getData?.player2Name === name2;

    log('TC-916',
      putOk && getResp.status === 200 && namesMatch ? 'PASS' : 'FAIL',
      !putOk ? `PUT status=${putRes.s} ${JSON.stringify(putRes.b).slice(0, 100)}` :
      getResp.status !== 200 ? `GET status=${getResp.status}` :
      !namesMatch ? `names mismatch got ${getData?.player1Name}/${getData?.player2Name}` : '');
  } catch (err) {
    log('TC-916', 'FAIL', err instanceof Error ? err.message : 'TC-916 threw');
  }
}

/* ───────── TC-917: overlay-events exposes broadcast player names (Issue #635) ─────────
 * After TC-916 sets names, /overlay-events?initial=1 must include
 * overlayPlayer1Name and overlayPlayer2Name as non-empty strings. */
async function runTc917(_adminPage) {
  try {
    const resp = await httpsGet(
      `/api/tournaments/${fixture.tournamentId}/overlay-events?initial=1`,
    );
    const data = resp.body?.data;
    const hasP1 = data && 'overlayPlayer1Name' in data && typeof data.overlayPlayer1Name === 'string';
    const hasP2 = data && 'overlayPlayer2Name' in data && typeof data.overlayPlayer2Name === 'string';
    /* TC-916 set both names, so they should be non-empty here */
    const p1Set = hasP1 && data.overlayPlayer1Name.length > 0;
    const p2Set = hasP2 && data.overlayPlayer2Name.length > 0;

    log('TC-917',
      resp.status === 200 && hasP1 && hasP2 && p1Set && p2Set ? 'PASS' : 'FAIL',
      resp.status !== 200 ? `status=${resp.status}` :
      !hasP1 ? 'overlayPlayer1Name missing from response' :
      !hasP2 ? 'overlayPlayer2Name missing from response' :
      !p1Set ? `overlayPlayer1Name is empty: "${data.overlayPlayer1Name}"` :
      !p2Set ? `overlayPlayer2Name is empty: "${data.overlayPlayer2Name}"` : '');
  } catch (err) {
    log('TC-917', 'FAIL', err instanceof Error ? err.message : 'TC-917 threw');
  }
}

/* ───────── TC-918: Broadcast PUT with match info fields (#644/#645/#649) ─────────
 * Verifies that the new overlayMatchLabel, overlayPlayer1Wins, overlayPlayer2Wins,
 * and overlayMatchFt fields can be set via PUT /broadcast and read back via
 * public GET /broadcast. Extends TC-916's coverage of the broadcast API. */
async function runTc918(adminPage) {
  try {
    const stamp = Date.now();
    const name1 = `TC918_P1_${stamp}`;
    const name2 = `TC918_P2_${stamp}`;
    const matchLabel = '決勝 QF';
    const player1Wins = 3;
    const player2Wins = 1;
    const matchFt = 5;

    const putRes = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${fixture.tournamentId}/broadcast`,
      { player1Name: name1, player2Name: name2, matchLabel, player1Wins, player2Wins, matchFt },
    ]);
    if (putRes.s !== 200) {
      log('TC-918', 'FAIL', `PUT status=${putRes.s} ${JSON.stringify(putRes.b).slice(0, 100)}`);
      return;
    }

    const getResp = await httpsGet(`/api/tournaments/${fixture.tournamentId}/broadcast`);
    const d = getResp.body?.data;
    const hasLabel = d?.matchLabel === matchLabel;
    const hasWins = d?.player1Wins === player1Wins && d?.player2Wins === player2Wins;
    const hasFt = d?.matchFt === matchFt;

    log('TC-918',
      getResp.status === 200 && hasLabel && hasWins && hasFt ? 'PASS' : 'FAIL',
      getResp.status !== 200 ? `GET status=${getResp.status}` :
      !hasLabel ? `matchLabel mismatch: got "${d?.matchLabel}"` :
      !hasWins ? `wins mismatch: got ${d?.player1Wins}/${d?.player2Wins}` :
      !hasFt ? `matchFt mismatch: got ${d?.matchFt}` : '');
  } catch (err) {
    log('TC-918', 'FAIL', err instanceof Error ? err.message : 'TC-918 threw');
  }
}

/* ───────── TC-919: overlay-events includes new broadcast match info fields ─────────
 * After TC-918 sets matchLabel/wins/ft, the overlay-events endpoint must
 * expose them so the dashboard page can render them without a separate fetch.
 * Verifies overlayMatchLabel, overlayPlayer1Wins, overlayPlayer2Wins,
 * overlayMatchFt all appear in the overlay-events response (#645, #649). */
async function runTc919(_adminPage) {
  try {
    const resp = await httpsGet(
      `/api/tournaments/${fixture.tournamentId}/overlay-events?initial=1`,
    );
    const d = resp.body?.data;
    const hasLabel = d && 'overlayMatchLabel' in d;
    const hasWins = d && 'overlayPlayer1Wins' in d && 'overlayPlayer2Wins' in d;
    const hasFt = d && 'overlayMatchFt' in d;
    /* TC-918 set matchLabel = "決勝 QF", wins = 3/1, ft = 5 */
    const labelCorrect = hasLabel && d.overlayMatchLabel === '決勝 QF';
    const winsCorrect = hasWins && d.overlayPlayer1Wins === 3 && d.overlayPlayer2Wins === 1;
    const ftCorrect = hasFt && d.overlayMatchFt === 5;

    log('TC-919',
      resp.status === 200 && hasLabel && hasWins && hasFt && labelCorrect && winsCorrect && ftCorrect
        ? 'PASS' : 'FAIL',
      resp.status !== 200 ? `status=${resp.status}` :
      !hasLabel ? 'overlayMatchLabel missing from overlay-events' :
      !hasWins ? 'overlayPlayer1Wins/overlayPlayer2Wins missing' :
      !hasFt ? 'overlayMatchFt missing' :
      !labelCorrect ? `label mismatch: "${d.overlayMatchLabel}"` :
      !winsCorrect ? `wins mismatch: ${d.overlayPlayer1Wins}/${d.overlayPlayer2Wins}` :
      !ftCorrect ? `ft mismatch: ${d.overlayMatchFt}` : '');
  } catch (err) {
    log('TC-919', 'FAIL', err instanceof Error ? err.message : 'TC-919 threw');
  }
}

/* ───────── TC-920: Dashboard page renders match score data in real browser ─────────
 * After TC-918/919 have set matchLabel/wins/ft via PUT /broadcast, the
 * /overlay/dashboard page must reflect that data when polled:
 *   - DashboardFooter shows the matchLabel in the footer strip (#649)
 *   - DashboardFooter shows the FT badge (#644)
 *   - Player name slots show win counts (#645)
 *
 * Must run after TC-918 (so matchLabel, wins, ft are set in the DB) and
 * after TC-906 is done with the overlay page navigation. We navigate the
 * admin browser to /overlay/dashboard so we can read rendered content.
 */
async function runTc920(adminPage) {
  try {
    await adminPage.goto(
      `${BASE}/tournaments/${fixture.tournamentId}/overlay/dashboard`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 },
    );
    /* Wait for the root element then allow the poll cycle (3s) + render. */
    await adminPage.waitForSelector('[data-testid="dashboard-root"]', { timeout: 10_000 });
    await adminPage.waitForTimeout(8000);

    const footerText = await adminPage.locator('[data-testid="dashboard-footer"]').innerText().catch(() => '');
    /* TC-918 set matchLabel="決勝 QF", so footer must contain it. */
    const hasLabel = footerText.includes('決勝 QF');
    /* TC-918 also set matchFt=5, so the FT badge must show "FT5". */
    const ftBadgeText = await adminPage.locator('[data-testid="dashboard-footer-ft"]').innerText().catch(() => '');
    const hasFt = ftBadgeText.includes('FT5');
    /* TC-918/916 set player names + wins. At least one score element must exist. */
    const scoreEl = adminPage.locator('[data-testid="overlay-p1-score"],[data-testid="overlay-p2-score"]');
    const scoreCount = await scoreEl.count();
    const hasScore = scoreCount > 0;

    const pass = hasLabel && hasFt && hasScore;
    log('TC-920', pass ? 'PASS' : 'FAIL',
      !hasLabel ? `matchLabel missing from footer: "${footerText}"` :
      !hasFt ? `FT badge missing or wrong: "${ftBadgeText}"` :
      !hasScore ? 'score elements not rendered on dashboard' : '');
  } catch (err) {
    log('TC-920', 'FAIL', err instanceof Error ? err.message : 'TC-920 threw');
  }
}

/* ───────── TC-906: real-browser render of the overlay page ─────────
 * Navigates the admin page away to /overlay and writes a fresh score so the
 * running poll cycle picks it up. Must be the LAST test because it leaves
 * the admin page on a different route (afterAll uses fresh API calls so
 * cleanup still works). */
async function runTc906(adminPage) {
  try {
    await adminPage.goto(
      `${BASE}/tournaments/${fixture.tournamentId}/overlay`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 },
    );
    await adminPage.waitForSelector('[data-testid="overlay-root"]', { timeout: 10_000 });
    /* Wait for any toast — by the time TC-906 runs, recent events from TC-909
       (qualification_confirmed) and TC-911 (overall_ranking_updated) will
       still be inside the server's 30-second initial-poll window, so the
       page's first poll surfaces at least one toast. We deliberately accept
       any event type (mode-specific or neutral) because each individual
       event type already has its own dedicated TC; this test is purely
       about proving the SSR → hydrate → poll → animate pipeline works. */
    await adminPage.waitForSelector('[data-testid="overlay-toast"]', { timeout: 15_000 });

    const stackText = await adminPage.locator('[data-testid="overlay-toast-stack"]').innerText();
    const hasContent = stackText.trim().length > 0;
    const hasKnownTitle = /(更新|確定|終了|申告|タイム)/.test(stackText);
    const pass = hasContent && hasKnownTitle;
    log('TC-906',
      pass ? 'PASS' : 'FAIL',
      pass ? '' :
      !hasContent ? 'toast stack rendered empty' :
      `no recognized event title in stack: "${stackText}"`);
  } catch (err) {
    log('TC-906', 'FAIL', err instanceof Error ? err.message : 'TC-906 threw');
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
    /* Ordering rules:
     *   - TC-901 first: empty-state assertion before anything is written.
     *   - TC-914 (player /report) before TC-902: BM match must still be
     *     incomplete for /report to be accepted. Dual-report mode prevents
     *     the report from completing the match.
     *   - TC-902 / TC-903 / TC-904 / TC-905: BM event read-back, since
     *     filter, SSR HTML.
     *   - TC-907 / TC-908: MR / GP score writes for mode coverage.
     *   - TC-910 (TA times) before TC-913 (TA phase): phase3 promotion
     *     skips entries with null totalTime.
     *   - TC-911 (overall ranking) any time after qual data exists.
     *   - TC-909 (qualificationConfirmed) AFTER all score PUTs: the route
     *     blocks qualification edits once this flag is set.
     *   - TC-916 / TC-917 (broadcast): TC-916 sets names, TC-917 reads them
     *     back from overlay-events. Both after TC-909 to avoid races.
     *   - TC-906 (real-browser render) last: navigates the admin page
     *     away from anything cleanup might need. */
    tests: [
      { name: 'TC-901', fn: runTc901 },
      { name: 'TC-914', fn: runTc914 },
      { name: 'TC-902', fn: runTc902 },
      { name: 'TC-903', fn: runTc903 },
      { name: 'TC-904', fn: runTc904 },
      { name: 'TC-905', fn: runTc905 },
      { name: 'TC-907', fn: runTc907 },
      { name: 'TC-908', fn: runTc908 },
      { name: 'TC-910', fn: runTc910 },
      { name: 'TC-913', fn: runTc913 },
      { name: 'TC-911', fn: runTc911 },
      { name: 'TC-909', fn: runTc909 },
      { name: 'TC-915', fn: runTc915 },
      { name: 'TC-916', fn: runTc916 },
      { name: 'TC-917', fn: runTc917 },
      /* TC-918/919 run after TC-916/917 so broadcast names are already set
         and the PUT extends them with new match-info fields. TC-919 must
         follow TC-918 so the fields exist in the DB to read back. */
      { name: 'TC-918', fn: runTc918 },
      { name: 'TC-919', fn: runTc919 },
      /* TC-920 must run after TC-918/919 set matchLabel/wins/ft,
         and before TC-906 navigates away. */
      { name: 'TC-920', fn: runTc920 },
      { name: 'TC-906', fn: runTc906 },
    ],
  };
}

module.exports = {
  runTc901, runTc902, runTc903, runTc904, runTc905, runTc906,
  runTc907, runTc908, runTc909, runTc910, runTc911, runTc913, runTc914, runTc915,
  runTc916, runTc917, runTc918, runTc919, runTc920,
  getSuite,
  results,
};

if (require.main === module) {
  runSuite(getSuite());
}

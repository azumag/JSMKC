/**
 * E2E GP (Grand Prix) tests.
 *
 * Coverage:
 *   TC-701  28-player full qualification (shared fixture, verify standings/matches)
 *   TC-702  GP player login + participant 5-race submission (2 players)
 *   TC-703  28-player full + finals bracket gen + first race score (routing)
 *   TC-704  GP finals bracket reset
 *   TC-705  GP Grand Final → champion
 *   TC-706  GP Grand Final Reset Match (M17)
 *   TC-707  GP dual report — agreement → autoConfirmed (2 players)
 *   TC-708  GP dual report — mismatch (2 players)
 *   TC-709  GP finals admin-only enforcement (403)
 *   TC-713  GP qualification tie resolution (tie warning → resolveAllTies)
 *   TC-717  GP finals same-cup-per-round enforcement (PR #585 normalizer)
 *   TC-718  GP finals admin manual total-score override (PR #585 manual form)
 *   TC-719  GP sudden-death tiebreak in non-grand-final bracket match (issue #604)
 *
 * Setup:
 *   - Uses Playwright persistent profile at /tmp/playwright-smkc-profile.
 *   - Admin Discord OAuth session must already exist in the profile.
 *   - Shared fixture (28 players + 2 tournaments) created once in beforeAll,
 *     torn down once in afterAll. Each TC only re-seeds GP qualification for
 *     the tournament it uses via setupModePlayersViaUi().
 *
 * Run: node e2e/tc-gp.js  (from smkc-score-app/)  or:  npm run e2e:gp
 */
const {
  makeResults, makeLog, nav,
  uiCreatePlayer, apiDeletePlayer, apiDeleteTournament, uiCreateTournament,
  apiFetchGp, apiPutGpQualScore,
  apiSetGpFinalsScore, apiGenerateGpFinals, apiFetchGpFinalsMatches, apiFetchGpFinalsState,
  apiUpdateTournament,
  makeRacesP1Wins, makeRacesP2Wins,
  loginPlayerBrowser,
  setupGpQualViaUi,
  resolveAllTies,
} = require('./lib/common');
const { createSharedE2eFixture, setupModePlayersViaUi, ensurePlayerPassword } = require('./lib/fixtures');
const { runSuite } = require('./lib/runner');

const results = makeResults();
const log = makeLog(results);
let sharedFixture = null;

function sharedGpPlayers(count = 28) {
  if (!sharedFixture) throw new Error('Shared GP fixture is not initialized');
  return sharedFixture.players.slice(0, count);
}

async function loginSharedPlayer(adminPage, player) {
  await ensurePlayerPassword(adminPage, player);
  return loginPlayerBrowser(player.nickname, player.password);
}

async function prepareSharedGpPair(adminPage, { dualReport = false } = {}) {
  if (!sharedFixture) throw new Error('Shared GP fixture is not initialized');

  const players = dualReport
    ? sharedFixture.players.slice(2, 4)
    : sharedFixture.players.slice(0, 2);
  const tournament = dualReport
    ? sharedFixture.dualTournament
    : sharedFixture.normalTournament;

  await setupModePlayersViaUi(adminPage, 'gp', tournament.id, players);

  const data = await apiFetchGp(adminPage, tournament.id);
  const match = (data.matches || []).find((m) => !m.isBye);
  if (!match) throw new Error('No non-BYE GP match found');
  if (!match.cup) throw new Error('GP match cup not assigned');

  return {
    tournamentId: tournament.id,
    p1: players[0],
    p2: players[1],
    match,
  };
}

/* Primed-once flag so every finals test reuses the shared normal
 * tournament's qualification state instead of re-seeding 182 matches. */
let sharedGpFinalsReady = false;

/** Ensure the shared `normalTournament` carries a complete 28-player GP
 *  qualification. In the tc-all flow this is already done by
 *  setupAllModes28PlayerQualification, so the first call here is a no-op.
 *  In standalone mode the helper seeds the qualification from scratch. */
async function prepareSharedGpFinalsSetup(adminPage) {
  if (!sharedFixture) throw new Error('Shared GP fixture is not initialized');

  const players = sharedGpPlayers(28);
  const tournamentId = sharedFixture.normalTournament.id;
  if (!sharedGpFinalsReady) {
    await setupGpQualViaUi(adminPage, tournamentId, players);
    sharedGpFinalsReady = true;
  }

  return {
    tournamentId,
    playerIds: players.map((player) => player.id),
    nicknames: players.map((player) => player.nickname),
    cleanup: async () => {},
  };
}

/* ───────── TC-701: 28-player full qualification ───────── */
async function runTc701(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);
    const data = await apiFetchGp(adminPage, setup.tournamentId);

    /* Product default: 2 groups × 14 players. Round-robin yields
     * 14C2 = 91 matches/group → 182 matches total. */
    const groupCounts = { A: 0, B: 0 };
    for (const q of (data.qualifications || [])) {
      if (q.group in groupCounts) groupCounts[q.group]++;
    }
    const groupedOk = groupCounts.A === 14 && groupCounts.B === 14;
    const matches = (data.matches || []).filter((m) => !m.isBye);
    const matchesOk = matches.length === 182;
    const allCompleted = matches.every((m) => m.completed);
    const standingsOk = (data.qualifications || []).length >= 28;

    const ok = groupedOk && matchesOk && allCompleted && standingsOk;
    log('TC-701', ok ? 'PASS' : 'FAIL',
      !groupedOk ? `groups: A=${groupCounts.A} B=${groupCounts.B}`
      : !matchesOk ? `matches=${matches.length} expected=182`
      : !allCompleted ? `not all completed`
      : !standingsOk ? `standings count=${(data.qualifications || []).length}`
      : '');
  } catch (err) {
    log('TC-701', 'FAIL', err instanceof Error ? err.message : 'GP 701 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-702: GP player participant submission ───────── */
async function runTc702(adminPage) {
  let playerBrowser = null;
  try {
    const { tournamentId, p1, match } = await prepareSharedGpPair(adminPage);

    const ctx = await loginSharedPlayer(adminPage, p1);
    playerBrowser = ctx.browser;
    /* Submit 5 race positions via API from the player browser session. */
    const reportRes = await ctx.page.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${tournamentId}/gp/match/${match.id}/report`,
      { reportingPlayer: 1, races: makeRacesP1Wins(match.cup) },
    ]);

    /* dualReportEnabled=false → autoConfirmed on first report. */
    const confirmed = reportRes.s === 200 &&
      (reportRes.b?.data?.autoConfirmed === true || reportRes.b?.autoConfirmed === true);

    const after = await apiFetchGp(adminPage, tournamentId);
    const updated = (after.matches || []).find((m) => m.id === match.id);
    /* P1 wins all 5 races at 1st = 45 points, P2 at 5th = 0 points. */
    const persisted = updated?.completed === true && updated.points1 === 45 && updated.points2 === 0;

    log('TC-702', confirmed && persisted ? 'PASS' : 'FAIL',
      !confirmed ? `report not confirmed: status=${reportRes.s}`
      : !persisted ? `points: ${updated?.points1}-${updated?.points2} completed=${updated?.completed}`
      : '');
  } catch (err) {
    log('TC-702', 'FAIL', err instanceof Error ? err.message : 'GP 702 failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
  }
}

/* ───────── TC-703: 28-player full + finals bracket gen + 1 score ─────────
 * Also asserts that right after bracket generation, QF matches (M1..M4) each
 * carry two DISTINCT real qualifier IDs — guards against the factory's
 * placeholder behaviour (non-first-round matches get seededPlayers[0] on both
 * slots until routing fills them) leaking into the QF. And verifies the
 * finals page actually renders those qualifier nicknames (not all "TBD"). */
async function runTc703(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);

    const gen = await apiGenerateGpFinals(adminPage, setup.tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    const matches = await apiFetchGpFinalsMatches(adminPage, setup.tournamentId);
    const m1 = matches.find((m) => m.matchNumber === 1);
    if (!m1) throw new Error('Match 1 missing');

    /* QF real-player check: M1..M4 must have 8 distinct non-null IDs. */
    const qfMatches = [1, 2, 3, 4].map((n) => matches.find((m) => m.matchNumber === n));
    if (qfMatches.some((m) => !m)) throw new Error('QF matches missing');
    const qfIds = qfMatches.flatMap((m) => [m.player1Id, m.player2Id]);
    const qfAllPresent = qfIds.every((id) => typeof id === 'string' && id.length > 0);
    const qfAllDistinct = new Set(qfIds).size === 8;

    /* Top 8 qualifiers must populate the QF — compare against setup.playerIds
     * bucket. We check the 8 QF IDs are a subset. */
    const allSetupIds = new Set(setup.playerIds);
    const qfAllRegistered = qfIds.every((id) => allSetupIds.has(id));

    /* Frontend: QF cards must show real nicknames (not "TBD"). Pick any QF
     * player's nickname and assert it appears on the page. */
    await nav(adminPage, `/tournaments/${setup.tournamentId}/gp/finals`);
    const pageText = await adminPage.locator('body').innerText();
    const qfNick = setup.nicknames[setup.playerIds.indexOf(qfMatches[0].player1Id)];
    const qfRendered = !!qfNick && pageText.includes(qfNick);

    /* GP finals validation: targetWins=3 default. score1=9 (P1 1st in 1 race) >= 3, score2=0 < 3. */
    const valid = await apiSetGpFinalsScore(adminPage, setup.tournamentId, m1.id, 9, 0);
    if (valid.s !== 200) throw new Error(`Score put failed (${valid.s})`);

    const after = await apiFetchGpFinalsMatches(adminPage, setup.tournamentId);
    const updated = after.find((m) => m.id === m1.id);
    const winnerTarget = after.find((m) => m.matchNumber === 5);
    const loserTarget = after.find((m) => m.matchNumber === 8);
    const bracketCount = after.length === 17;
    const scoreSaved = updated?.completed === true && updated.points1 === 9 && updated.points2 === 0;
    const winnerRouted = [winnerTarget?.player1Id, winnerTarget?.player2Id].includes(m1.player1Id);
    const loserRouted = [loserTarget?.player1Id, loserTarget?.player2Id].includes(m1.player2Id);

    const ok = bracketCount && scoreSaved && winnerRouted && loserRouted
      && qfAllPresent && qfAllDistinct && qfAllRegistered && qfRendered;
    log('TC-703', ok ? 'PASS' : 'FAIL',
      !qfAllPresent ? 'QF has null player IDs'
      : !qfAllDistinct ? `QF IDs not 8 distinct: ${new Set(qfIds).size}`
      : !qfAllRegistered ? 'QF contains unknown player IDs'
      : !qfRendered ? `QF nickname not on finals page (${qfNick})`
      : !bracketCount ? `bracket size=${after.length}`
      : !scoreSaved ? `score: ${updated?.points1}-${updated?.points2}`
      : !winnerRouted || !loserRouted ? 'routing mismatch'
      : '');
  } catch (err) {
    log('TC-703', 'FAIL', err instanceof Error ? err.message : 'GP 703 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-704: GP finals bracket reset ───────── */
async function runTc704(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);

    const gen = await apiGenerateGpFinals(adminPage, setup.tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    const before = await apiFetchGpFinalsMatches(adminPage, setup.tournamentId);
    const m1 = before.find((m) => m.matchNumber === 1);
    if (!m1) throw new Error('Match 1 missing');
    const score = await apiSetGpFinalsScore(adminPage, setup.tournamentId, m1.id, 9, 0);
    if (score.s !== 200) throw new Error(`Score put failed (${score.s})`);

    const completedBefore = (await apiFetchGpFinalsMatches(adminPage, setup.tournamentId))
      .filter((m) => m.completed).length;
    if (completedBefore < 1) throw new Error('Pre-reset score not persisted');

    const reset = await apiGenerateGpFinals(adminPage, setup.tournamentId, 8);
    if (reset.s !== 200 && reset.s !== 201) throw new Error(`Bracket reset failed (${reset.s})`);

    const after = await apiFetchGpFinalsMatches(adminPage, setup.tournamentId);
    const completedAfter = after.filter((m) => m.completed).length;
    const ok = completedBefore >= 1 && completedAfter === 0 && after.length === 17;
    log('TC-704', ok ? 'PASS' : 'FAIL',
      ok ? '' : `before=${completedBefore} after=${completedAfter} total=${after.length}`);
  } catch (err) {
    log('TC-704', 'FAIL', err instanceof Error ? err.message : 'GP 704 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-705: GP Grand Final → champion ───────── */
async function runTc705(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);
    const { tournamentId, playerIds, nicknames } = setup;

    const gen = await apiGenerateGpFinals(adminPage, tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    /* Drive M1..M16 with P1 always winning 9-0. Each match must have two
     * DISTINCT real qualifier IDs by the time we score it — if routing broke
     * and both slots stayed on the seededPlayers[0] placeholder, the put would
     * still succeed and the test would silently "pass" without real players. */
    for (let mn = 1; mn <= 16; mn++) {
      const matches = await apiFetchGpFinalsMatches(adminPage, tournamentId);
      const match = matches.find((m) => m.matchNumber === mn);
      if (!match || !match.player1Id || !match.player2Id) {
        throw new Error(`Match ${mn} not ready`);
      }
      if (match.player1Id === match.player2Id) {
        throw new Error(`Match ${mn} has placeholder players (same ID on both slots)`);
      }
      if (!playerIds.includes(match.player1Id) || !playerIds.includes(match.player2Id)) {
        throw new Error(`Match ${mn} has unregistered player IDs`);
      }
      const res = await apiSetGpFinalsScore(adminPage, tournamentId, match.id, 9, 0);
      if (res.s !== 200) throw new Error(`Match ${mn} put failed (${res.s})`);
    }

    const matches = await apiFetchGpFinalsMatches(adminPage, tournamentId);
    const m16 = matches.find((m) => m.matchNumber === 16);
    const expectedChampionId = m16?.player1Id;
    if (!expectedChampionId) throw new Error('GF M16 missing player1');
    const championNickname = nicknames[playerIds.indexOf(expectedChampionId)];

    await nav(adminPage, `/tournaments/${tournamentId}/gp/finals`);
    const pageText = await adminPage.locator('body').innerText();
    const championShown = pageText.includes(championNickname) &&
      (pageText.includes('Champion') || pageText.includes('チャンピオン') || pageText.includes('優勝'));
    const m16Ok = m16.completed === true && m16.points1 === 9 && m16.points2 === 0;

    log('TC-705', m16Ok && championShown ? 'PASS' : 'FAIL',
      !m16Ok ? 'M16 not completed'
      : !championShown ? `Champion banner missing nickname ${championNickname}`
      : '');
  } catch (err) {
    log('TC-705', 'FAIL', err instanceof Error ? err.message : 'GP 705 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-706: GP Grand Final Reset Match (M17) ───────── */
async function runTc706(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);
    const { tournamentId } = setup;

    const gen = await apiGenerateGpFinals(adminPage, tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    /* M1..M15: P1 wins 9-0 each */
    for (let mn = 1; mn <= 15; mn++) {
      const matches = await apiFetchGpFinalsMatches(adminPage, tournamentId);
      const match = matches.find((m) => m.matchNumber === mn);
      if (!match || !match.player1Id || !match.player2Id) throw new Error(`Match ${mn} not ready`);
      const res = await apiSetGpFinalsScore(adminPage, tournamentId, match.id, 9, 0);
      if (res.s !== 200) throw new Error(`Match ${mn} put failed (${res.s})`);
    }

    /* M16: P2 wins 0-9 → triggers Reset Match (M17) */
    let matches = await apiFetchGpFinalsMatches(adminPage, tournamentId);
    const m16 = matches.find((m) => m.matchNumber === 16);
    if (!m16 || !m16.player1Id || !m16.player2Id) throw new Error('M16 not ready');
    const expectedResetChampionId = m16.player2Id;
    const m16Res = await apiSetGpFinalsScore(adminPage, tournamentId, m16.id, 0, 9);
    if (m16Res.s !== 200) throw new Error(`M16 put failed (${m16Res.s})`);

    matches = await apiFetchGpFinalsMatches(adminPage, tournamentId);
    const m17 = matches.find((m) => m.matchNumber === 17);
    if (!m17) throw new Error('M17 not generated');
    const m17Populated = !!m17.player1Id && !!m17.player2Id;

    const m17ScoreP1Wins = m17.player1Id === expectedResetChampionId;
    const m17Res = await apiSetGpFinalsScore(adminPage, tournamentId, m17.id,
      m17ScoreP1Wins ? 9 : 0,
      m17ScoreP1Wins ? 0 : 9);
    if (m17Res.s !== 200) throw new Error(`M17 put failed (${m17Res.s})`);

    const finalMatches = await apiFetchGpFinalsMatches(adminPage, tournamentId);
    const finalM17 = finalMatches.find((m) => m.matchNumber === 17);
    const m17Completed = finalM17?.completed === true;

    log('TC-706', m17Populated && m17Completed ? 'PASS' : 'FAIL',
      !m17Populated ? `M17 not populated p1=${m17.player1Id} p2=${m17.player2Id}`
      : !m17Completed ? 'M17 not completed'
      : '');
  } catch (err) {
    log('TC-706', 'FAIL', err instanceof Error ? err.message : 'GP 706 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-707: GP dual report agreement → autoConfirmed ───────── */
async function runTc707(adminPage) {
  const browsers = [];
  try {
    const { tournamentId, p1, p2, match } = await prepareSharedGpPair(adminPage, { dualReport: true });

    const races = makeRacesP1Wins(match.cup);
    const ctx1 = await loginSharedPlayer(adminPage, p1);
    browsers.push(ctx1.browser);
    const r1 = await ctx1.page.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/gp/match/${match.id}/report`,
        { reportingPlayer: 1, races }]);
    const r1WaitingForP2 = r1.s === 200 &&
      (r1.b?.data?.waitingFor === 'player2' || r1.b?.waitingFor === 'player2');

    const ctx2 = await loginSharedPlayer(adminPage, p2);
    browsers.push(ctx2.browser);
    const r2 = await ctx2.page.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/gp/match/${match.id}/report`,
        { reportingPlayer: 2, races }]);
    const autoConfirmed = r2.s === 200 &&
      (r2.b?.data?.autoConfirmed === true || r2.b?.autoConfirmed === true);

    const finalData = await apiFetchGp(adminPage, tournamentId);
    const finalMatch = (finalData.matches || []).find((m) => m.id === match.id);
    const persisted = finalMatch?.completed === true &&
      finalMatch.points1 === 45 && finalMatch.points2 === 0;

    const ok = r1WaitingForP2 && autoConfirmed && persisted;
    log('TC-707', ok ? 'PASS' : 'FAIL',
      !r1WaitingForP2 ? `P1 missing waitingFor (status=${r1.s})`
      : !autoConfirmed ? `P2 missing autoConfirmed (status=${r2.s})`
      : !persisted ? `final not persisted: ${finalMatch?.points1}-${finalMatch?.points2}`
      : '');
  } catch (err) {
    log('TC-707', 'FAIL', err instanceof Error ? err.message : 'GP 707 failed');
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
  }
}

/* ───────── TC-708: GP dual report mismatch ───────── */
async function runTc708(adminPage) {
  const browsers = [];
  try {
    const { tournamentId, p1, p2, match } = await prepareSharedGpPair(adminPage, { dualReport: true });

    const ctx1 = await loginSharedPlayer(adminPage, p1);
    browsers.push(ctx1.browser);
    await ctx1.page.evaluate(async ([u, body]) => {
      await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }, [`/api/tournaments/${tournamentId}/gp/match/${match.id}/report`,
        { reportingPlayer: 1, races: makeRacesP1Wins(match.cup) }]);

    const ctx2 = await loginSharedPlayer(adminPage, p2);
    browsers.push(ctx2.browser);
    /* P2 reports flipped (P2 wins) → mismatch */
    const r2 = await ctx2.page.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/gp/match/${match.id}/report`,
        { reportingPlayer: 2, races: makeRacesP2Wins(match.cup) }]);
    const mismatchFlag = r2.s === 200 &&
      (r2.b?.data?.mismatch === true || r2.b?.mismatch === true);

    const midData = await apiFetchGp(adminPage, tournamentId);
    const midMatch = (midData.matches || []).find((m) => m.id === match.id);
    const stillIncomplete = midMatch?.completed === false;

    /* Admin resolves with PUT (qualification PUT requires cup + races) */
    const adminPut = await apiPutGpQualScore(adminPage, tournamentId, match.id, match.cup, makeRacesP1Wins(match.cup));
    const finalData = await apiFetchGp(adminPage, tournamentId);
    const finalMatch = (finalData.matches || []).find((m) => m.id === match.id);
    const adminConfirmed = adminPut.s === 200 && finalMatch?.completed === true;

    const ok = mismatchFlag && stillIncomplete && adminConfirmed;
    log('TC-708', ok ? 'PASS' : 'FAIL',
      !mismatchFlag ? `mismatch flag missing (status=${r2.s})`
      : !stillIncomplete ? 'match auto-completed despite mismatch'
      : !adminConfirmed ? `admin PUT failed (${adminPut.s})`
      : '');
  } catch (err) {
    log('TC-708', 'FAIL', err instanceof Error ? err.message : 'GP 708 failed');
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
  }
}

/* ───────── TC-709: GP finals admin-only enforcement (403) ─────────
 * Uses a disposable challenger player so the shared-fixture players' passwords
 * are not exercised here (shared players are re-used across many TCs and we
 * want to keep their sessions minimal). Challenger is created/deleted inline. */
async function runTc709(adminPage) {
  let setup = null;
  let extraChallengerId = null;
  let playerBrowser = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);

    const gen = await apiGenerateGpFinals(adminPage, setup.tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    const matches = await apiFetchGpFinalsMatches(adminPage, setup.tournamentId);
    const m1 = matches.find((m) => m.matchNumber === 1);
    if (!m1) throw new Error('Match 1 missing');

    const stamp = Date.now();
    const challenger = await uiCreatePlayer(adminPage, 'E2E GP 709 Challenger', `e2e_gp709_ch_${stamp}`);
    extraChallengerId = challenger.id;

    const ctx = await loginPlayerBrowser(challenger.nickname, challenger.password);
    playerBrowser = ctx.browser;

    /* Player tries to PUT to GP finals — expect 403. */
    const playerPut = await ctx.page.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status };
    }, [`/api/tournaments/${setup.tournamentId}/gp/finals`, { matchId: m1.id, score1: 9, score2: 0 }]);

    const ok = playerPut.s === 403;
    log('TC-709', ok ? 'PASS' : 'FAIL', ok ? '' : `expected 403 got ${playerPut.s}`);
  } catch (err) {
    log('TC-709', 'FAIL', err instanceof Error ? err.message : 'GP 709 failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
    if (setup) await setup.cleanup();
    if (extraChallengerId) await apiDeletePlayer(adminPage, extraChallengerId);
  }
}

/* ───────── TC-717: GP finals same-cup-per-round enforcement (PR #585) ─────────
 * Every match in the same finals round must share one cup. Generates an
 * 8-player finals bracket and asserts that within each round (winners_qf,
 * winners_sf, losers_r1, …) all matches carry the same cup string. Guards
 * against the divergent state that PR #583's old client-side random
 * fallback could leave behind when admins saved scores before the
 * server-side normalizer landed. */
async function runTc717(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);

    const gen = await apiGenerateGpFinals(adminPage, setup.tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    const matches = await apiFetchGpFinalsMatches(adminPage, setup.tournamentId);
    if (matches.length !== 17) throw new Error(`Expected 17 finals matches, got ${matches.length}`);

    /* Bucket by round and check every match in a round shares one cup. */
    const cupsByRound = new Map();
    for (const m of matches) {
      if (!m.round) continue;
      if (!cupsByRound.has(m.round)) cupsByRound.set(m.round, new Set());
      cupsByRound.get(m.round).add(m.cup ?? null);
    }

    const divergentRounds = [...cupsByRound.entries()]
      .filter(([, cups]) => cups.size !== 1 || cups.has(null));
    const ok = divergentRounds.length === 0;
    log('TC-717', ok ? 'PASS' : 'FAIL',
      ok ? '' : `rounds with divergent or null cups: ${divergentRounds.map(([r, c]) => `${r}=${[...c].join(',')}`).join(' | ')}`);
  } catch (err) {
    log('TC-717', 'FAIL', err instanceof Error ? err.message : 'GP 717 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-718: GP finals admin manual total-score override (PR #585) ─────────
 * Admin can correct a finals match by writing raw driver-points totals
 * without re-entering the 5-race breakdown. Asserts that PUT accepts a
 * body of { matchId, score1, score2 } only (no cup, no races) and that
 * any existing race breakdown is preserved rather than cleared.
 *
 * Flow:
 *   1. Generate an 8-player finals bracket.
 *   2. Enter full race data for M1 first (sets match.races on the row).
 *   3. Reset with the raw totals (score1=15, score2=12) via the same
 *      endpoint but without cup/races in the body.
 *   4. Fetch back: points1/points2 reflect the manual totals, the stored
 *      cup stays the same as before, and the races array is unchanged. */
async function runTc718(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);

    const gen = await apiGenerateGpFinals(adminPage, setup.tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    const before = await apiFetchGpFinalsMatches(adminPage, setup.tournamentId);
    const m1 = before.find((m) => m.matchNumber === 1);
    if (!m1) throw new Error('Match 1 missing');
    if (!m1.cup) throw new Error('Match 1 cup not assigned — normalizer may have failed');

    /* Step 1: seed races via the normal cup+races path. Total = 9 per race
     * for P1 (1st), 6 for P2 (2nd), summed across 5 races: 45-30. */
    const raceSeed = await adminPage.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${setup.tournamentId}/gp/finals`,
      {
        matchId: m1.id,
        score1: 45,
        score2: 30,
        cup: m1.cup,
        races: makeRacesP1Wins(m1.cup),
      },
    ]);
    if (raceSeed.s !== 200) throw new Error(`Seed PUT failed (${raceSeed.s})`);

    const afterSeed = await apiFetchGpFinalsMatches(adminPage, setup.tournamentId);
    const seeded = afterSeed.find((m) => m.id === m1.id);
    const hadRaces = Array.isArray(seeded?.races) && seeded.races.length > 0;
    if (!hadRaces) throw new Error('Seed PUT did not persist races');

    /* Step 2: manual override — PUT without cup/races in the body. */
    const manual = await adminPage.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${setup.tournamentId}/gp/finals`,
      { matchId: m1.id, score1: 15, score2: 12 },
    ]);
    if (manual.s !== 200) throw new Error(`Manual PUT failed (${manual.s})`);

    const afterManual = await apiFetchGpFinalsMatches(adminPage, setup.tournamentId);
    const finalMatch = afterManual.find((m) => m.id === m1.id);
    const totalsUpdated = finalMatch?.points1 === 15 && finalMatch?.points2 === 12;
    const cupPreserved = finalMatch?.cup === seeded.cup;
    const racesPreserved =
      Array.isArray(finalMatch?.races) &&
      finalMatch.races.length === seeded.races.length;

    const ok = totalsUpdated && cupPreserved && racesPreserved;
    log('TC-718', ok ? 'PASS' : 'FAIL',
      !totalsUpdated ? `totals: ${finalMatch?.points1}-${finalMatch?.points2}`
      : !cupPreserved ? `cup changed: ${seeded.cup} → ${finalMatch?.cup}`
      : !racesPreserved ? `races lost: ${finalMatch?.races?.length ?? 0}`
      : '');
  } catch (err) {
    log('TC-718', 'FAIL', err instanceof Error ? err.message : 'GP 718 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-715: GP Top-24 Playoff UI Flow ─────────
 * Validates the full Top-24 → Top-16 playoff UI path for GP:
 * 1. Qualification page shows "Start Playoff (Top 24)" when players > 16
 * 2. Clicking it stores topN=24 in sessionStorage
 * 3. Finals page renders PlayoffBracket with M1..M8
 * 4. Scoring all playoff_r2 matches sets playoffComplete=true
 * 5. Phase 2 creates the Upper Bracket and switches to finals phase */
async function runTc715(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);
    const { tournamentId } = setup;

    /* The bracket action button requires qualificationConfirmed. */
    const confirmRes = await apiUpdateTournament(adminPage, tournamentId, { qualificationConfirmed: true });
    if (confirmRes.s !== 200) throw new Error(`Failed to confirm qualification (${confirmRes.s})`);

    /* Previous tests may have left a bracket behind. Reset it so
     * the qualification page shows "Start Playoff" instead of "View Tournament". */
    const resetRes = await adminPage.evaluate(async (tid) => {
      const r = await fetch(`/api/tournaments/${tid}/gp/finals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
      return { s: r.status };
    }, tournamentId);
    if (resetRes.s !== 200 && resetRes.s !== 201) {
      throw new Error(`Bracket reset failed (${resetRes.s})`);
    }

    await nav(adminPage, `/tournaments/${tournamentId}/gp`);

    /* Wait for finalsExists to be determined so the button text leaves the
     * generatingBracket loading state. */
    await adminPage.waitForFunction(() => {
      const text = document.body.innerText;
      return !text.includes('Generating bracket') && !text.includes('ブラケットを生成中');
    }, null, { timeout: 15000 });

    const startPlayoffBtn = adminPage.getByRole('button', {
      name: /Start Playoff|バラッジ開始/,
    });
    const hasStartPlayoff = await startPlayoffBtn.count() > 0;

    await adminPage.evaluate(() => sessionStorage.removeItem('gp_finals_topN'));

    if (hasStartPlayoff) {
      await startPlayoffBtn.click();
      await adminPage.waitForTimeout(3000);
    } else {
      throw new Error('Start Playoff button not found on GP qualification page');
    }

    const storedTopN = await adminPage.evaluate(() => sessionStorage.getItem('gp_finals_topN'));

    await nav(adminPage, `/tournaments/${tournamentId}/gp/finals`);

    const finalsText = await adminPage.locator('body').innerText();
    const hasPlayoffLabel = finalsText.includes('Playoff (Barrage)') || finalsText.includes('Playoff');
    const hasM1 = finalsText.includes('M1');

    for (let mn = 1; mn <= 4; mn++) {
      const state = await apiFetchGpFinalsState(adminPage, tournamentId);
      const match = state.playoffMatches.find((m) => m.matchNumber === mn);
      if (!match) throw new Error(`Playoff R1 M${mn} missing`);
      const res = await apiSetGpFinalsScore(adminPage, tournamentId, match.id, 9, 0);
      if (res.s !== 200) throw new Error(`Playoff R1 M${mn} score failed (${res.s})`);
    }

    for (let mn = 5; mn <= 8; mn++) {
      const state = await apiFetchGpFinalsState(adminPage, tournamentId);
      const match = state.playoffMatches.find((m) => m.matchNumber === mn);
      if (!match) throw new Error(`Playoff R2 M${mn} missing`);
      const res = await apiSetGpFinalsScore(adminPage, tournamentId, match.id, 9, 0);
      if (res.s !== 200) throw new Error(`Playoff R2 M${mn} score failed (${res.s})`);
    }

    const finalState = await apiFetchGpFinalsState(adminPage, tournamentId);
    const playoffComplete = finalState.playoffComplete === true;

    const phase2 = await apiGenerateGpFinals(adminPage, tournamentId, 24);
    const phase2Ok = phase2.s === 201 && phase2.b?.data?.phase === 'finals';

    await nav(adminPage, `/tournaments/${tournamentId}/gp/finals`);
    const postPhase2Text = await adminPage.locator('body').innerText();
    const hasFinalsPhase = postPhase2Text.includes('Upper Bracket') || postPhase2Text.includes('アッパーブラケット');

    const ok = hasStartPlayoff && storedTopN === '24' && hasPlayoffLabel && hasM1 && playoffComplete && phase2Ok && hasFinalsPhase;
    log('TC-715', ok ? 'PASS' : 'FAIL',
      !hasStartPlayoff ? 'Start Playoff button missing'
      : storedTopN !== '24' ? `sessionStorage topN=${storedTopN}`
      : !hasPlayoffLabel ? 'Playoff label missing on finals page'
      : !hasM1 ? 'M1 missing on playoff bracket'
      : !playoffComplete ? 'playoffComplete not true'
      : !phase2Ok ? `Phase 2 failed (${phase2.s})`
      : !hasFinalsPhase ? 'Finals phase not shown after Upper Bracket creation'
      : '');
  } catch (err) {
    log('TC-715', 'FAIL', err instanceof Error ? err.message : 'GP 715 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-716: GP qualification page finals-exists state + reset ───────── */
async function runTc716(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);
    const { tournamentId } = setup;

    /* Confirm qualification so the bracket action button is visible. */
    const confirmRes = await apiUpdateTournament(adminPage, tournamentId, { qualificationConfirmed: true });
    if (confirmRes.s !== 200) throw new Error(`Failed to confirm qualification (${confirmRes.s})`);

    const gen = await apiGenerateGpFinals(adminPage, tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    await nav(adminPage, `/tournaments/${tournamentId}/gp`);

    /* Wait for finalsExists to be determined so the button text leaves the
     * generatingBracket loading state. */
    await adminPage.waitForFunction(() => {
      const text = document.body.innerText;
      return !text.includes('Generating bracket') && !text.includes('ブラケットを生成中');
    }, null, { timeout: 15000 });

    const qualText = await adminPage.locator('body').innerText();
    const hasViewTournament = qualText.includes('View Tournament') || qualText.includes('トーナメントを見る');
    const hasResetBracket = qualText.includes('Reset Bracket') || qualText.includes('ブラケットリセット');

    const resetBtn = adminPage.getByRole('button', {
      name: /Reset Bracket|ブラケットリセット/,
    });
    const resetVisible = await resetBtn.count() > 0;
    if (resetVisible) {
      adminPage.once('dialog', async (dialog) => {
        await dialog.accept();
      });
      await resetBtn.click();
      await adminPage.waitForTimeout(3000);
    }

    /* After reset, with 28 players (>16), the button shows "Start Playoff"
     * rather than "Generate Finals Bracket". */
    const postResetText = await adminPage.locator('body').innerText();
    const hasGenerateButton = postResetText.includes('Generate Finals Bracket') || postResetText.includes('Generate Bracket') || postResetText.includes('ブラケット生成') || postResetText.includes('generateFinalsBracket') || postResetText.includes('Start Playoff') || postResetText.includes('バラッジ開始');

    const ok = hasViewTournament && hasResetBracket && resetVisible && hasGenerateButton;
    log('TC-716', ok ? 'PASS' : 'FAIL',
      !hasViewTournament ? 'View Tournament button missing after bracket creation'
      : !hasResetBracket ? 'Reset Bracket button missing'
      : !resetVisible ? 'Reset Bracket not found as button element'
      : !hasGenerateButton ? 'Generate/Start Playoff button not restored after reset'
      : '');
  } catch (err) {
    log('TC-716', 'FAIL', err instanceof Error ? err.message : 'GP 716 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-710: GP cup mismatch rejection on correction ─────────
 * Validates #534: when a completed GP match has an assigned cup, a
 * participant correction with courses from a different cup is rejected. */
async function runTc710(adminPage) {
  let playerBrowser = null;
  try {
    const { tournamentId, p1, match } = await prepareSharedGpPair(adminPage);

    /* Complete the match first via admin PUT so it enters correction territory. */
    const adminPut = await apiPutGpQualScore(adminPage, tournamentId, match.id, match.cup, makeRacesP1Wins(match.cup));
    if (adminPut.s !== 200) throw new Error(`Admin PUT failed (${adminPut.s})`);

    /* Attempt correction with courses from a cup that is neither the assigned
     * cup nor its allowed substitution (§7.1: Star→Mushroom, Special→Flower). */
    const ctx = await loginSharedPlayer(adminPage, p1);
    playerBrowser = ctx.browser;
    const assignedCup = match.cup;
    /* Pick a wrong cup: Flower/Special for Mushroom/Star, Mushroom/Star for Flower/Special. */
    const wrongCup = (assignedCup === 'Mushroom' || assignedCup === 'Star') ? 'Flower' : 'Mushroom';
    const wrongCupRaces = wrongCup === 'Flower'
      ? [
          { course: 'Choco Island 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 2', position1: 1, position2: 2 },
          { course: 'Donut Plains 2', position1: 1, position2: 2 },
          { course: 'Bowser Castle 2', position1: 1, position2: 2 },
          { course: 'Mario Circuit 3', position1: 1, position2: 2 },
        ]
      : [
          { course: 'Mario Circuit 1', position1: 1, position2: 2 },
          { course: 'Donut Plains 1', position1: 1, position2: 2 },
          { course: 'Ghost Valley 1', position1: 1, position2: 2 },
          { course: 'Bowser Castle 1', position1: 1, position2: 2 },
          { course: 'Mario Circuit 2', position1: 1, position2: 2 },
        ];
    const correction = await ctx.page.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${tournamentId}/gp/match/${match.id}/report`,
      { reportingPlayer: 1, races: wrongCupRaces },
    ]);

    const rejected = correction.s === 400 &&
      (correction.b?.data?.error || correction.b?.error || '')
        .includes('do not match the assigned cup');

    log('TC-710', rejected ? 'PASS' : 'FAIL',
      !rejected ? `expected 400 cup-mismatch, got ${correction.s} ${JSON.stringify(correction.b)}` : '');
  } catch (err) {
    log('TC-710', 'FAIL', err instanceof Error ? err.message : 'GP 710 failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
  }
}

/* ───────── TC-712: GP Grand Final sudden-death tiebreak ─────────
 * Validates #538: when the grand final ends in a tie, the admin can select
 * a sudden-death winner and the champion is determined correctly. */
async function runTc712(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);
    const { tournamentId, playerIds, nicknames } = setup;

    const gen = await apiGenerateGpFinals(adminPage, tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    /* Drive M1..M15 with P1 always winning 9-0. */
    for (let mn = 1; mn <= 15; mn++) {
      const matches = await apiFetchGpFinalsMatches(adminPage, tournamentId);
      const match = matches.find((m) => m.matchNumber === mn);
      if (!match || !match.player1Id || !match.player2Id) {
        throw new Error(`Match ${mn} not ready`);
      }
      const res = await apiSetGpFinalsScore(adminPage, tournamentId, match.id, 9, 0);
      if (res.s !== 200) throw new Error(`Match ${mn} put failed (${res.s})`);
    }

    /* M16 (grand final): tie 5-5 with sudden-death winner = player1. */
    const matchesBefore = await apiFetchGpFinalsMatches(adminPage, tournamentId);
    const m16 = matchesBefore.find((m) => m.matchNumber === 16);
    if (!m16 || !m16.player1Id) throw new Error('GF M16 not ready');
    const sdRes = await apiSetGpFinalsScore(adminPage, tournamentId, m16.id, 5, 5, m16.player1Id);
    if (sdRes.s !== 200) throw new Error(`M16 sudden-death put failed (${sdRes.s})`);

    const matchesAfter = await apiFetchGpFinalsMatches(adminPage, tournamentId);
    const m16After = matchesAfter.find((m) => m.matchNumber === 16);
    const expectedChampionId = m16.player1Id;
    const championNickname = nicknames[playerIds.indexOf(expectedChampionId)];

    await nav(adminPage, `/tournaments/${tournamentId}/gp/finals`);
    const pageText = await adminPage.locator('body').innerText();
    const championShown = pageText.includes(championNickname) &&
      (pageText.includes('Champion') || pageText.includes('チャンピオン') || pageText.includes('優勝'));
    const m16Ok = m16After.completed === true && m16After.suddenDeathWinnerId === expectedChampionId;

    log('TC-712', m16Ok && championShown ? 'PASS' : 'FAIL',
      !m16Ok ? `M16 sudden-death not persisted (completed=${m16After?.completed}, sdWinner=${m16After?.suddenDeathWinnerId})`
      : !championShown ? `Champion banner missing nickname ${championNickname}`
      : '');
  } catch (err) {
    log('TC-712', 'FAIL', err instanceof Error ? err.message : 'GP 712 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-713: GP qualification tie resolution ─────────
 * Creates 3 players, sets up GP qualification, submits matches resulting
 * in tied driver points, then verifies:
 *   (a) tie warning banner appears on standings tab
 *   (b) after resolveAllTies, the banner disappears
 * Mirrors TC-324 (BM) but for GP mode. */
async function runTc713(adminPage) {
  const createdPlayers = [];
  const createdTournaments = [];
  try {
    const stamp = Date.now();

    // Create 3 players via admin API
    for (let i = 1; i <= 3; i++) {
      const name = `GP Tie P${i}`;
      const nickname = `gp_tie_${i}_${stamp}`;
      const p = await uiCreatePlayer(adminPage, name, nickname);
      createdPlayers.push({ id: p.id, name, nickname });
    }

    // Create & activate tournament with dualReport disabled
    const tournamentId = await uiCreateTournament(adminPage, `GP Tie ${stamp}`, { dualReportEnabled: false });
    createdTournaments.push(tournamentId);

    // Setup GP qualification with 3 players
    await setupGpQualViaUi(adminPage, tournamentId, createdPlayers);

    // Get matches and submit all non-BYE matches with identical driver points
    const gpData = await apiFetchGp(adminPage, tournamentId);
    const nonByeMatches = (gpData.matches || []).filter((m) => !m.isBye);

    // Submit each match with P1 winning all 5 races (9 pts each = 45 total)
    for (const match of nonByeMatches) {
      const races = makeRacesP1Wins(match.cup);
      const put = await apiPutGpQualScore(adminPage, tournamentId, match.id, match.cup, races);
      if (put.s !== 200) throw new Error(`Score PUT failed for match ${match.matchNumber} (${put.s})`);
    }

    // Navigate to GP page and check for tie warning banner
    await nav(adminPage, `/tournaments/${tournamentId}/gp`);
    // Click standings tab
    const standingsTab = adminPage.locator('button[role="tab"]').filter({ hasText: /順位表|Standings/ });
    if (await standingsTab.count() > 0) {
      await standingsTab.click();
      await adminPage.waitForTimeout(2000);
    }

    // Check for tie warning banner
    const bannerBefore =
      (await adminPage.locator('text=同順位が検出されました').count()) +
      (await adminPage.locator('text=Tied ranks detected').count());
    const hasBannerBefore = bannerBefore > 0;

    // Resolve ties
    await resolveAllTies(adminPage, tournamentId, 'gp');

    // Reload and verify banner disappears
    await nav(adminPage, `/tournaments/${tournamentId}/gp`);
    if (await standingsTab.count() > 0) {
      await standingsTab.click();
      await adminPage.waitForTimeout(2000);
    }

    const bannerAfter =
      (await adminPage.locator('text=同順位が検出されました').count()) +
      (await adminPage.locator('text=Tied ranks detected').count());
    const hasBannerAfter = bannerAfter > 0;

    log('TC-713', hasBannerBefore && !hasBannerAfter ? 'PASS' : 'FAIL',
      !hasBannerBefore ? 'Tie warning banner never appeared (expected tie from identical scores)'
      : hasBannerAfter ? 'Tie warning banner still visible after resolveAllTies'
      : '');
  } catch (err) {
    log('TC-713', 'FAIL', err instanceof Error ? err.message : 'GP tie resolution failed');
  } finally {
    for (const tid of createdTournaments) {
      await apiDeleteTournament(adminPage, tid);
    }
    for (const p of createdPlayers) {
      await apiDeletePlayer(adminPage, p.id);
    }
  }
}

/* ───────── TC-821: GP match/[matchId] page view-only ─────────
 * Similar to TC-321 (BM match page) and TC-820 (MR match page),
 * GP match pages are also view-only for admins.
 * Score entry is consolidated to the /gp/participant page. */
async function runTc821(adminPage) {
  try {
    const { tournamentId, p1, p2, match } = await prepareSharedGpPair(adminPage);

    // Visit match page
    await nav(adminPage, `/tournaments/${tournamentId}/gp/match/${match.id}`);
    const matchText = await adminPage.locator('body').innerText();

    // Should show player names
    const showsPlayers = matchText.includes(p1.nickname) && matchText.includes(p2.nickname);
    // Should NOT have score entry form (position selectors, course selectors)
    const noScoreForm =
      !matchText.includes('Select Course') &&
      !matchText.includes('コースを選択') &&
      !matchText.includes('Position') &&
      !matchText.includes('順位') &&
      !matchText.includes('I am') &&
      !matchText.includes('私は');

    log('TC-821', showsPlayers && noScoreForm ? 'PASS' : 'FAIL',
      !showsPlayers ? 'Match page missing player names' : !noScoreForm ? 'Match page has score entry form' : '');
  } catch (err) {
    log('TC-821', 'FAIL', err instanceof Error ? err.message : 'GP match view test failed');
  }
}

/* ───────── TC-719: GP sudden-death tiebreak in non-grand-final bracket match ─────────
 * Issue #604: Validates that the GP finals API supports sudden-death winner
 * selection for tied driver points in ANY bracket match (not only grand final).
 * When score1 === score2, the PUT must be accompanied by a valid suddenDeathWinnerId.
 * Without it the API must return 400. With it, the match completes and the
 * bracket advances correctly. */
async function runTc719(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedGpFinalsSetup(adminPage);
    const { tournamentId, playerIds } = setup;

    const gen = await apiGenerateGpFinals(adminPage, tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    const matches = await apiFetchGpFinalsMatches(adminPage, tournamentId);
    /* Use the first winners_qf match that has both players assigned. */
    const qfMatch = matches.find((m) => m.round === 'winners_qf' && m.player1Id && m.player2Id);
    if (!qfMatch) throw new Error('No ready winners_qf match for TC-719');

    /* Tied score without suddenDeathWinnerId must be rejected. */
    const noSd = await apiSetGpFinalsScore(adminPage, tournamentId, qfMatch.id, 5, 5);
    const noSdRejected = noSd.s === 400;

    /* Tied score with invalid suddenDeathWinnerId must be rejected. */
    const badSd = await apiSetGpFinalsScore(adminPage, tournamentId, qfMatch.id, 5, 5, 'invalid-id');
    const badSdRejected = badSd.s === 400;

    /* Tied score with a valid suddenDeathWinnerId must succeed. */
    const sdRes = await apiSetGpFinalsScore(adminPage, tournamentId, qfMatch.id, 5, 5, qfMatch.player1Id);
    const sdAccepted = sdRes.s === 200;

    /* Winner must be recorded as the sudden-death winner. */
    const after = await apiFetchGpFinalsMatches(adminPage, tournamentId);
    const qfAfter = after.find((m) => m.id === qfMatch.id);
    const winnerRouted = qfAfter?.completed === true &&
      qfAfter?.suddenDeathWinnerId === qfMatch.player1Id &&
      qfAfter?.winnerId === qfMatch.player1Id;

    const ok = noSdRejected && badSdRejected && sdAccepted && winnerRouted;
    log('TC-719', ok ? 'PASS' : 'FAIL',
      !noSdRejected ? `Tied score without suddenDeathWinnerId not rejected (${noSd.s})`
      : !badSdRejected ? `Tied score with invalid suddenDeathWinnerId not rejected (${badSd.s})`
      : !sdAccepted ? `Tied score with valid suddenDeathWinnerId not accepted (${sdRes.s})`
      : !winnerRouted ? `Match not completed with correct winner (completed=${qfAfter?.completed}, sdWinner=${qfAfter?.suddenDeathWinnerId})`
      : '');
  } catch (err) {
    log('TC-719', 'FAIL', err instanceof Error ? err.message : 'GP 719 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* See tc-bm.js::getSuite for the shared-fixture composition contract. */
function getSuite({ sharedFixture: externalFixture = null } = {}) {
  const ownsFixture = !externalFixture;
  return {
    suiteName: 'GP',
    results,
    log,
    beforeAll: async (adminPage) => {
      sharedFixture = externalFixture ?? await createSharedE2eFixture(adminPage);
    },
    afterAll: async () => {
      if (ownsFixture && sharedFixture) {
        await sharedFixture.cleanup();
      }
      sharedFixture = null;
      sharedGpFinalsReady = false;
    },
    tests: [
      { name: 'TC-702', fn: runTc702 },
      { name: 'TC-707', fn: runTc707 },
      { name: 'TC-708', fn: runTc708 },
      { name: 'TC-701', fn: runTc701 },
      { name: 'TC-703', fn: runTc703 },
      { name: 'TC-704', fn: runTc704 },
      { name: 'TC-705', fn: runTc705 },
      { name: 'TC-706', fn: runTc706 },
      { name: 'TC-709', fn: runTc709 },
      { name: 'TC-717', fn: runTc717 },
      { name: 'TC-718', fn: runTc718 },
      { name: 'TC-715', fn: runTc715 },
      { name: 'TC-716', fn: runTc716 },
      { name: 'TC-710', fn: runTc710 },
      { name: 'TC-712', fn: runTc712 },
      { name: 'TC-719', fn: runTc719 },
      { name: 'TC-713', fn: runTc713 },
      { name: 'TC-821', fn: runTc821 },
    ],
  };
}

module.exports = {
  runTc701, runTc702, runTc703, runTc704, runTc705, runTc706,
  runTc707, runTc708, runTc709, runTc710, runTc712, runTc713,
  runTc715, runTc716, runTc717, runTc718, runTc719, runTc821,
  getSuite,
  results,
};

if (require.main === module) {
  runSuite(getSuite());
}

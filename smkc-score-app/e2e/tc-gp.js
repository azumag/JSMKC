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
  uiCreatePlayer, apiDeletePlayer,
  apiFetchGp, apiPutGpQualScore,
  apiSetGpFinalsScore, apiGenerateGpFinals, apiFetchGpFinalsMatches,
  makeRacesP1Wins, makeRacesP2Wins,
  loginPlayerBrowser,
  setupGpQualViaUi,
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
      { reportingPlayer: 1, races: makeRacesP1Wins() },
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

    const races = makeRacesP1Wins();
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
        { reportingPlayer: 1, races: makeRacesP1Wins() }]);

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
        { reportingPlayer: 2, races: makeRacesP2Wins() }]);
    const mismatchFlag = r2.s === 200 &&
      (r2.b?.data?.mismatch === true || r2.b?.mismatch === true);

    const midData = await apiFetchGp(adminPage, tournamentId);
    const midMatch = (midData.matches || []).find((m) => m.id === match.id);
    const stillIncomplete = midMatch?.completed === false;

    /* Admin resolves with PUT (qualification PUT requires cup + races) */
    const adminPut = await apiPutGpQualScore(adminPage, tournamentId, match.id, match.cup, makeRacesP1Wins());
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

/* ───────── TC-710: GP cup mismatch rejection on correction ─────────
 * Validates #534: when a completed GP match has an assigned cup, a
 * participant correction with courses from a different cup is rejected. */
async function runTc710(adminPage) {
  let playerBrowser = null;
  try {
    const { tournamentId, p1, match } = await prepareSharedGpPair(adminPage);

    /* Complete the match first via admin PUT so it enters correction territory. */
    const adminPut = await apiPutGpQualScore(adminPage, tournamentId, match.id, match.cup, makeRacesP1Wins());
    if (adminPut.s !== 200) throw new Error(`Admin PUT failed (${adminPut.s})`);

    /* Attempt correction with courses from a different cup than assigned. */
    const ctx = await loginSharedPlayer(adminPage, p1);
    playerBrowser = ctx.browser;
    const assignedCup = match.cup;
    const wrongCup = assignedCup === 'Mushroom' ? 'Flower' : 'Mushroom';
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
      { name: 'TC-710', fn: runTc710 },
    ],
  };
}

module.exports = {
  runTc701, runTc702, runTc703, runTc704, runTc705, runTc706,
  runTc707, runTc708, runTc709, runTc710,
  getSuite,
  results,
};

if (require.main === module) {
  runSuite(getSuite());
}

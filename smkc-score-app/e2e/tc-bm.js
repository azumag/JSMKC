/**
 * E2E BM (Battle Mode) tests.
 *
 * Coverage:
 *   TC-501  BM participant single-match submission (UI, 2 players)
 *   TC-502  BM participant draw 2-2 (UI, 2 players)
 *   TC-507  BM dual report — agreement → autoConfirmed (2 players)
 *   TC-508  BM dual report — mismatch (2 players)
 *   TC-509  BM dual report — previousReports panel (2 players)
 *   TC-322  BM participant correction (UI, 2 players)
 *   TC-503  28-player full qualification + finals bracket gen + first-to-5 routing
 *   TC-504  28-player full + finals bracket reset
 *   TC-505  28-player full + Grand Final → champion
 *   TC-506  28-player full + Grand Final Reset Match (M17)
 *   TC-510  BM Top-24 pre-bracket playoff → Top-16 finals flow
 *
 * Setup:
 *   - Uses Playwright persistent profile at /tmp/playwright-smkc-profile.
 *   - The profile must already hold a Discord OAuth admin session.
 *   - Player-credential tests open separate non-persistent browser contexts so
 *     the admin session is never disturbed.
 *
 * Cleanup (every test):
 *   - 28-player setup helpers return a `cleanup` closure; callers always call
 *     it in `finally`. The helpers also self-cleanup on partial failure so
 *     production never leaks tournaments/players.
 *
 * Run: node e2e/tc-bm.js  (from smkc-score-app/)  or:  npm run e2e:bm
 */
const {
  makeResults, makeLog, nav, escapeRegex,
  apiFetchBm, apiPutBmQualScore,
  apiSetBmFinalsScore, apiGenerateBmFinals, apiFetchBmFinalsMatches, apiFetchBmFinalsState,
  loginPlayerBrowser,
} = require('./lib/common');
const { createSharedE2eFixture, setupModePlayersViaUi } = require('./lib/fixtures');
const { runSuite } = require('./lib/runner');

const results = makeResults();
const log = makeLog(results);
let sharedFixture = null;

function sharedBmPlayers(count = 28) {
  if (!sharedFixture) throw new Error('Shared BM fixture is not initialized');
  return sharedFixture.players.slice(0, count);
}

async function prepareSharedBmPair(adminPage, { dualReport = false } = {}) {
  if (!sharedFixture) throw new Error('Shared BM fixture is not initialized');

  const players = dualReport
    ? sharedFixture.players.slice(2, 4)
    : sharedFixture.players.slice(0, 2);
  const tournament = dualReport
    ? sharedFixture.dualTournament
    : sharedFixture.normalTournament;

  await setupModePlayersViaUi(adminPage, 'bm', tournament.id, players);

  const data = await apiFetchBm(adminPage, tournament.id);
  const match = (data.matches || []).find((m) => !m.isBye);
  if (!match) throw new Error('No non-BYE BM match found');

  return {
    tournamentId: tournament.id,
    p1: players[0],
    p2: players[1],
    match,
  };
}

async function prepareSharedBmFinalsSetup(adminPage) {
  if (!sharedFixture) throw new Error('Shared BM fixture is not initialized');

  const players = sharedBmPlayers(28);
  const tournamentId = sharedFixture.normalTournament.id;
  await setupModePlayersViaUi(adminPage, 'bm', tournamentId, players);

  const data = await apiFetchBm(adminPage, tournamentId);
  const matches = (data.matches || []).filter((m) => !m.isBye && !m.completed);
  for (const match of matches) {
    const res = await apiPutBmQualScore(adminPage, tournamentId, match.id, 3, 1);
    if (res.s !== 200) {
      throw new Error(`BM qual put failed (${res.s}) match=${match.id}: ${JSON.stringify(res.b).slice(0, 200)}`);
    }
  }

  return {
    tournamentId,
    playerIds: players.map((player) => player.id),
    nicknames: players.map((player) => player.nickname),
    cleanup: async () => {},
  };
}

/* ───────── TC-501: BM participant single-match submission (UI) ───────── */
async function runTc501(adminPage) {
  let playerBrowser = null;
  try {
    const { tournamentId, p1, match } = await prepareSharedBmPair(adminPage);

    const ctx = await loginPlayerBrowser(p1.nickname, p1.password);
    playerBrowser = ctx.browser;
    await nav(ctx.page, `/tournaments/${tournamentId}/bm/participant`);

    const p1Label = match.player1.nickname;
    const p2Label = match.player2.nickname;
    /* Increment via UI: P1 +3 then P2 +1 → 3-1 */
    for (let i = 0; i < 3; i++) {
      await ctx.page.getByRole('button', { name: new RegExp(`${escapeRegex(p1Label)} \\+1`) }).click();
    }
    await ctx.page.getByRole('button', { name: new RegExp(`${escapeRegex(p2Label)} \\+1`) }).click();
    ctx.page.once('dialog', (d) => d.accept());
    await ctx.page.getByRole('button', { name: /スコア送信|Submit Scores/ }).click();
    await ctx.page.waitForTimeout(3000);

    const after = await apiFetchBm(adminPage, tournamentId);
    const updated = (after.matches || []).find((m) => m.id === match.id);
    const ok = updated?.completed === true && updated.score1 === 3 && updated.score2 === 1;
    log('TC-501', ok ? 'PASS' : 'FAIL',
      ok ? '' : `completed=${updated?.completed} score=${updated?.score1}-${updated?.score2}`);
  } catch (err) {
    log('TC-501', 'FAIL', err instanceof Error ? err.message : 'BM 501 failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
  }
}

/* ───────── TC-502: BM participant draw 2-2 (UI) ─────────
 * Per §4.1, 2-2 is a valid score (each player scores 1 draw point). */
async function runTc502(adminPage) {
  let playerBrowser = null;
  try {
    const { tournamentId, p1, match } = await prepareSharedBmPair(adminPage);

    const ctx = await loginPlayerBrowser(p1.nickname, p1.password);
    playerBrowser = ctx.browser;
    await nav(ctx.page, `/tournaments/${tournamentId}/bm/participant`);

    const p1Label = match.player1.nickname;
    const p2Label = match.player2.nickname;
    /* 2-2: alternate +1 P1, +1 P2 twice each */
    for (let i = 0; i < 2; i++) {
      await ctx.page.getByRole('button', { name: new RegExp(`${escapeRegex(p1Label)} \\+1`) }).click();
      await ctx.page.getByRole('button', { name: new RegExp(`${escapeRegex(p2Label)} \\+1`) }).click();
    }
    const submitBtn = ctx.page.getByRole('button', { name: /スコア送信|Submit Scores/ });
    const enabledBefore = await submitBtn.isEnabled();
    ctx.page.once('dialog', (d) => d.accept());
    await submitBtn.click();
    await ctx.page.waitForTimeout(3000);

    const after = await apiFetchBm(adminPage, tournamentId);
    const updated = (after.matches || []).find((m) => m.id === match.id);
    const ok = enabledBefore && updated?.completed === true && updated.score1 === 2 && updated.score2 === 2;
    log('TC-502', ok ? 'PASS' : 'FAIL',
      ok ? '' :
      !enabledBefore ? 'Submit button disabled — 2-2 should be valid per §4.1'
      : `completed=${updated?.completed} score=${updated?.score1}-${updated?.score2}`);
  } catch (err) {
    log('TC-502', 'FAIL', err instanceof Error ? err.message : 'BM 502 failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
  }
}

/* ───────── TC-322: BM participant correction (UI) ─────────
 * Submit 3-1, then use the "Correct Score" UI to flip to 2-2 and confirm
 * the change persists via admin-side API fetch. */
async function runTc322(adminPage) {
  let playerBrowser = null;

  try {
    const { tournamentId, p1, match } = await prepareSharedBmPair(adminPage);

    const p1Label = match.player1.nickname;
    const p2Label = match.player2.nickname;

    const ctx = await loginPlayerBrowser(p1.nickname, p1.password);
    playerBrowser = ctx.browser;
    const playerPage = ctx.page;
    await nav(playerPage, `/tournaments/${tournamentId}/bm/participant`);

    for (let i = 0; i < 3; i++) {
      await playerPage.getByRole('button', { name: new RegExp(`${escapeRegex(p1Label)} \\+1`) }).click();
    }
    await playerPage.getByRole('button', { name: new RegExp(`${escapeRegex(p2Label)} \\+1`) }).click();

    playerPage.once('dialog', (d) => d.accept());
    await playerPage.getByRole('button', { name: /スコア送信|Submit Scores/ }).click();
    /* Wait for correction affordance (= match completed and re-rendered). */
    await playerPage.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('スコアを修正') || text.includes('Correct Score');
    }, null, { timeout: 15000 });

    /* Open correction UI and flip to 2-2. */
    await playerPage.getByRole('button', { name: /スコアを修正|Correct Score/ }).click();
    await playerPage.getByRole('button', { name: new RegExp(`${escapeRegex(p1Label)} -1`) }).click();
    await playerPage.getByRole('button', { name: new RegExp(`${escapeRegex(p2Label)} \\+1`) }).click();

    playerPage.once('dialog', (d) => d.accept());
    await playerPage.getByRole('button', { name: /修正を送信|Submit Correction/ }).click();
    await playerPage.waitForTimeout(3000);

    const correctedBm = await apiFetchBm(adminPage, tournamentId);
    const correctedMatch = (correctedBm.matches || []).find((m) => m.id === match.id);
    const ok =
      correctedMatch?.completed === true &&
      correctedMatch.score1 === 2 &&
      correctedMatch.score2 === 2;

    log('TC-322', ok ? 'PASS' : 'FAIL',
      ok ? '' :
      !correctedMatch ? 'Corrected match not found'
      : `completed=${correctedMatch.completed} score=${correctedMatch.score1}-${correctedMatch.score2}`);
  } catch (err) {
    log('TC-322', 'FAIL', err instanceof Error ? err.message : 'BM correction flow failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
  }
}

/* ───────── TC-503: 28-player full + finals bracket gen + first-to-5 routing ─────────
 * Validates: 84 quals succeed, top-8 bracket (17 matches), first-to-5 rejection
 * of 3-0, 5-0 acceptance with M1 winner→M5 / loser→M8 routing. */
async function runTc503(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedBmFinalsSetup(adminPage);

    const gen = await apiGenerateBmFinals(adminPage, setup.tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    const matches = await apiFetchBmFinalsMatches(adminPage, setup.tournamentId);
    const m1 = matches.find((m) => m.matchNumber === 1);
    if (!m1) throw new Error('Bracket missing match 1');

    /* BM finals = best-of-9, first-to-5. 3-0 must be rejected. */
    const reject = await apiSetBmFinalsScore(adminPage, setup.tournamentId, m1.id, 3, 0);
    const firstToFiveRejected = reject.s === 400;

    /* 5-0 valid → routing into M5 (winner) and M8 (loser). */
    const valid = await apiSetBmFinalsScore(adminPage, setup.tournamentId, m1.id, 5, 0);
    if (valid.s !== 200) throw new Error(`Valid 5-0 put failed (${valid.s})`);

    const after = await apiFetchBmFinalsMatches(adminPage, setup.tournamentId);
    const updated = after.find((m) => m.id === m1.id);
    const winnerTarget = after.find((m) => m.matchNumber === 5);
    const loserTarget = after.find((m) => m.matchNumber === 8);
    const bracketCount = after.length === 17;
    const scoreSaved = updated?.completed === true && updated.score1 === 5 && updated.score2 === 0;
    const winnerRouted = [winnerTarget?.player1Id, winnerTarget?.player2Id].includes(m1.player1Id);
    const loserRouted = [loserTarget?.player1Id, loserTarget?.player2Id].includes(m1.player2Id);

    const ok = bracketCount && firstToFiveRejected && scoreSaved && winnerRouted && loserRouted;
    log('TC-503', ok ? 'PASS' : 'FAIL',
      !bracketCount ? `bracket size=${after.length} (expected 17)`
      : !firstToFiveRejected ? `3-0 not rejected (status=${reject.s})`
      : !scoreSaved ? `score not saved: ${updated?.score1}-${updated?.score2} completed=${updated?.completed}`
      : !winnerRouted || !loserRouted ? `routing mismatch w=${winnerRouted} l=${loserRouted}`
      : '');
  } catch (err) {
    log('TC-503', 'FAIL', err instanceof Error ? err.message : 'BM 503 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-504: BM finals bracket reset (28-player setup) ─────────
 * Re-POST to /finals (same endpoint UI's Reset button calls) regenerates
 * the bracket with all matches pending. */
async function runTc504(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedBmFinalsSetup(adminPage);

    const gen = await apiGenerateBmFinals(adminPage, setup.tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    const before = await apiFetchBmFinalsMatches(adminPage, setup.tournamentId);
    const m1 = before.find((m) => m.matchNumber === 1);
    if (!m1) throw new Error('Match 1 missing');
    const score = await apiSetBmFinalsScore(adminPage, setup.tournamentId, m1.id, 5, 0);
    if (score.s !== 200) throw new Error(`Score put failed (${score.s})`);

    const completedBefore = (await apiFetchBmFinalsMatches(adminPage, setup.tournamentId))
      .filter((m) => m.completed).length;
    if (completedBefore < 1) throw new Error('Pre-reset score not persisted');

    const reset = await apiGenerateBmFinals(adminPage, setup.tournamentId, 8);
    if (reset.s !== 200 && reset.s !== 201) throw new Error(`Bracket reset failed (${reset.s})`);

    const after = await apiFetchBmFinalsMatches(adminPage, setup.tournamentId);
    const completedAfter = after.filter((m) => m.completed).length;
    const ok = completedBefore >= 1 && completedAfter === 0 && after.length === 17;
    log('TC-504', ok ? 'PASS' : 'FAIL',
      ok ? '' : `before=${completedBefore} after=${completedAfter} total=${after.length}`);
  } catch (err) {
    log('TC-504', 'FAIL', err instanceof Error ? err.message : 'BM 504 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-510: BM Top-24 pre-bracket playoff → Top-16 finals ─────────
 * Validates issue #454: topN=24 first creates an 8-match playoff, blocks
 * Phase 2 while R2 remains incomplete, then creates a 31-match 16-player
 * finals bracket after all four R2 winners are known. */
async function runTc510(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedBmFinalsSetup(adminPage);
    const { tournamentId } = setup;

    const phase1 = await apiGenerateBmFinals(adminPage, tournamentId, 24);
    const phase1Data = phase1.b?.data || {};
    if (phase1.s !== 201 || phase1Data.phase !== 'playoff') {
      throw new Error(`Playoff phase creation failed (${phase1.s})`);
    }

    let state = await apiFetchBmFinalsState(adminPage, tournamentId);
    const r1 = state.playoffMatches.filter((m) => m.round === 'playoff_r1');
    const r2 = state.playoffMatches.filter((m) => m.round === 'playoff_r2');
    const playoffCreated =
      state.matches.length === 0 &&
      state.playoffMatches.length === 8 &&
      r1.length === 4 &&
      r2.length === 4;

    const blocked = await apiGenerateBmFinals(adminPage, tournamentId, 24);
    const phase2Blocked = blocked.s === 409 && blocked.b?.code === 'PLAYOFF_INCOMPLETE';

    let r1Routed = true;
    for (let mn = 1; mn <= 4; mn++) {
      state = await apiFetchBmFinalsState(adminPage, tournamentId);
      const match = state.playoffMatches.find((m) => m.matchNumber === mn);
      if (!match) throw new Error(`Playoff R1 match ${mn} missing`);
      const winnerId = match.player1Id;
      const score = await apiSetBmFinalsScore(adminPage, tournamentId, match.id, 5, 0);
      if (score.s !== 200) throw new Error(`Playoff R1 M${mn} score failed (${score.s})`);
      state = await apiFetchBmFinalsState(adminPage, tournamentId);
      const target = state.playoffMatches.find((m) => m.matchNumber === mn + 4);
      if (target?.player2Id !== winnerId) r1Routed = false;
    }

    const r2WinnersByUpperSeed = new Map();
    const upperSeedByR2Match = new Map([
      [5, 16],
      [6, 13],
      [7, 14],
      [8, 15],
    ]);
    let playoffCompleteSignal = false;
    for (let mn = 5; mn <= 8; mn++) {
      state = await apiFetchBmFinalsState(adminPage, tournamentId);
      const match = state.playoffMatches.find((m) => m.matchNumber === mn);
      if (!match) throw new Error(`Playoff R2 match ${mn} missing`);
      r2WinnersByUpperSeed.set(upperSeedByR2Match.get(mn), match.player1Id);
      const score = await apiSetBmFinalsScore(adminPage, tournamentId, match.id, 5, 0);
      if (score.s !== 200) throw new Error(`Playoff R2 M${mn} score failed (${score.s})`);
      playoffCompleteSignal = score.b?.data?.playoffComplete === true;
    }

    const phase2 = await apiGenerateBmFinals(adminPage, tournamentId, 24);
    const phase2Data = phase2.b?.data || {};
    state = await apiFetchBmFinalsState(adminPage, tournamentId);
    const seededPlayers = phase2Data.seededPlayers || [];
    const playoffWinnersSeeded = [13, 14, 15, 16].every((seed) => {
      const seeded = seededPlayers.find((p) => p.seed === seed);
      return seeded?.playerId === r2WinnersByUpperSeed.get(seed);
    });
    const finalsCreated =
      phase2.s === 201 &&
      phase2Data.phase === 'finals' &&
      state.matches.length === 31 &&
      state.bracketSize === 16 &&
      state.playoffMatches.length === 8 &&
      playoffWinnersSeeded;

    const ok = playoffCreated && phase2Blocked && r1Routed && playoffCompleteSignal && finalsCreated;
    log('TC-510', ok ? 'PASS' : 'FAIL',
      !playoffCreated ? `playoff=${state.playoffMatches.length} finals=${state.matches.length} r1=${r1.length} r2=${r2.length}`
      : !phase2Blocked ? `Phase 2 was not blocked before completion (${blocked.s}, ${blocked.b?.code || blocked.b?.error})`
      : !r1Routed ? 'R1 winner did not route into R2 player2'
      : !playoffCompleteSignal ? 'Last R2 PUT did not signal playoffComplete=true'
      : !finalsCreated ? `finals=${state.matches.length} bracketSize=${state.bracketSize} winnersSeeded=${playoffWinnersSeeded}`
      : '');
  } catch (err) {
    log('TC-510', 'FAIL', err instanceof Error ? err.message : 'BM 510 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-505: BM Grand Final → champion (28-player full) ─────────
 * Drives M1..M16 with player1 sweeping 5-0 each so seeds propagate
 * deterministically. Winners-side champion takes the GF; the champion
 * banner on /bm/finals must show the expected nickname. */
async function runTc505(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedBmFinalsSetup(adminPage);
    const { tournamentId, playerIds, nicknames } = setup;

    const gen = await apiGenerateBmFinals(adminPage, tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    for (let mn = 1; mn <= 16; mn++) {
      const matches = await apiFetchBmFinalsMatches(adminPage, tournamentId);
      const match = matches.find((m) => m.matchNumber === mn);
      if (!match || !match.player1Id || !match.player2Id) {
        throw new Error(`Match ${mn} not ready (p1=${match?.player1Id} p2=${match?.player2Id})`);
      }
      const res = await apiSetBmFinalsScore(adminPage, tournamentId, match.id, 5, 0);
      if (res.s !== 200) throw new Error(`Match ${mn} put failed (${res.s})`);
    }

    const matches = await apiFetchBmFinalsMatches(adminPage, tournamentId);
    const m16 = matches.find((m) => m.matchNumber === 16);
    const expectedChampionId = m16?.player1Id;
    if (!expectedChampionId) throw new Error('GF (M16) missing player1');
    const championNickname = nicknames[playerIds.indexOf(expectedChampionId)];

    await nav(adminPage, `/tournaments/${tournamentId}/bm/finals`);
    const pageText = await adminPage.locator('body').innerText();
    const championShown = pageText.includes(championNickname) &&
      (pageText.includes('Champion') || pageText.includes('チャンピオン') || pageText.includes('優勝'));
    const m16Ok = m16.completed === true && m16.score1 === 5 && m16.score2 === 0;

    log('TC-505', m16Ok && championShown ? 'PASS' : 'FAIL',
      !m16Ok ? `M16 not completed: score=${m16?.score1}-${m16?.score2}`
      : !championShown ? `Champion banner missing nickname ${championNickname}`
      : '');
  } catch (err) {
    log('TC-505', 'FAIL', err instanceof Error ? err.message : 'BM 505 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-506: BM Grand Final Reset Match (M17) ─────────
 * If the L-side champion wins the GF, M17 is generated. Force this by
 * scoring M16 0-5. */
async function runTc506(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedBmFinalsSetup(adminPage);
    const { tournamentId } = setup;

    const gen = await apiGenerateBmFinals(adminPage, tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    /* M1..M15: player1 wins 5-0 */
    for (let mn = 1; mn <= 15; mn++) {
      const matches = await apiFetchBmFinalsMatches(adminPage, tournamentId);
      const match = matches.find((m) => m.matchNumber === mn);
      if (!match || !match.player1Id || !match.player2Id) throw new Error(`Match ${mn} not ready`);
      const res = await apiSetBmFinalsScore(adminPage, tournamentId, match.id, 5, 0);
      if (res.s !== 200) throw new Error(`Match ${mn} put failed (${res.s})`);
    }

    /* M16: P2 (L-side champion) wins 0-5 → triggers M17 */
    let matches = await apiFetchBmFinalsMatches(adminPage, tournamentId);
    const m16 = matches.find((m) => m.matchNumber === 16);
    if (!m16 || !m16.player1Id || !m16.player2Id) throw new Error('M16 not ready');
    const expectedResetChampionId = m16.player2Id;
    const m16Res = await apiSetBmFinalsScore(adminPage, tournamentId, m16.id, 0, 5);
    if (m16Res.s !== 200) throw new Error(`M16 put failed (${m16Res.s})`);

    matches = await apiFetchBmFinalsMatches(adminPage, tournamentId);
    const m17 = matches.find((m) => m.matchNumber === 17);
    if (!m17) throw new Error('M17 not generated');
    const m17Populated = !!m17.player1Id && !!m17.player2Id;

    /* Play M17. The L-side champion's slot may be P1 or P2 depending on routing. */
    const m17ScoreP1Wins = m17.player1Id === expectedResetChampionId;
    const m17Res = await apiSetBmFinalsScore(adminPage, tournamentId, m17.id,
      m17ScoreP1Wins ? 5 : 0,
      m17ScoreP1Wins ? 0 : 5);
    if (m17Res.s !== 200) throw new Error(`M17 put failed (${m17Res.s})`);

    const finalMatches = await apiFetchBmFinalsMatches(adminPage, tournamentId);
    const finalM17 = finalMatches.find((m) => m.matchNumber === 17);
    const m17Completed = finalM17?.completed === true;

    log('TC-506', m17Populated && m17Completed ? 'PASS' : 'FAIL',
      !m17Populated ? `M17 not populated p1=${m17.player1Id} p2=${m17.player2Id}`
      : !m17Completed ? 'M17 not completed'
      : '');
  } catch (err) {
    log('TC-506', 'FAIL', err instanceof Error ? err.message : 'BM 506 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-507: BM dual report — agreement → autoConfirmed ───────── */
async function runTc507(adminPage) {
  const browsers = [];
  try {
    const { tournamentId, p1, p2, match } = await prepareSharedBmPair(adminPage, { dualReport: true });

    /* P1 reports 3-1 → response should include waitingFor=player2 */
    const ctx1 = await loginPlayerBrowser(p1.nickname, p1.password);
    browsers.push(ctx1.browser);
    const r1 = await ctx1.page.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${tournamentId}/bm/match/${match.id}/report`,
      { reportingPlayer: 1, score1: 3, score2: 1 },
    ]);
    const r1WaitingForP2 = r1.s === 200 &&
      (r1.b?.data?.waitingFor === 'player2' || r1.b?.waitingFor === 'player2');

    const mid = await apiFetchBm(adminPage, tournamentId);
    const midMatch = (mid.matches || []).find((m) => m.id === match.id);
    const midOk = midMatch?.completed === false &&
      midMatch.player1ReportedScore1 === 3 &&
      midMatch.player1ReportedScore2 === 1;

    /* P2 reports identical 3-1 → autoConfirmed */
    const ctx2 = await loginPlayerBrowser(p2.nickname, p2.password);
    browsers.push(ctx2.browser);
    const r2 = await ctx2.page.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${tournamentId}/bm/match/${match.id}/report`,
      { reportingPlayer: 2, score1: 3, score2: 1 },
    ]);
    const autoConfirmed = r2.s === 200 &&
      (r2.b?.data?.autoConfirmed === true || r2.b?.autoConfirmed === true);

    const finalData = await apiFetchBm(adminPage, tournamentId);
    const finalMatch = (finalData.matches || []).find((m) => m.id === match.id);
    const persisted = finalMatch?.completed === true &&
      finalMatch.score1 === 3 && finalMatch.score2 === 1;

    const ok = r1WaitingForP2 && midOk && autoConfirmed && persisted;
    log('TC-507', ok ? 'PASS' : 'FAIL',
      !r1WaitingForP2 ? `P1 missing waitingFor (status=${r1.s})`
      : !midOk ? `mid state wrong: completed=${midMatch?.completed} reportedP1=${midMatch?.player1ReportedScore1}-${midMatch?.player1ReportedScore2}`
      : !autoConfirmed ? `P2 missing autoConfirmed (status=${r2.s})`
      : !persisted ? `final not persisted: ${finalMatch?.score1}-${finalMatch?.score2}`
      : '');
  } catch (err) {
    log('TC-507', 'FAIL', err instanceof Error ? err.message : 'BM 507 failed');
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
  }
}

/* ───────── TC-508: BM dual report — mismatch ─────────
 * P1 reports 3-1, P2 reports 1-3 → mismatch flag, match stays incomplete.
 * Admin then resolves via PUT /api/tournaments/:id/bm. */
async function runTc508(adminPage) {
  const browsers = [];
  try {
    const { tournamentId, p1, p2, match } = await prepareSharedBmPair(adminPage, { dualReport: true });

    const ctx1 = await loginPlayerBrowser(p1.nickname, p1.password);
    browsers.push(ctx1.browser);
    await ctx1.page.evaluate(async ([u, body]) => {
      await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }, [
      `/api/tournaments/${tournamentId}/bm/match/${match.id}/report`,
      { reportingPlayer: 1, score1: 3, score2: 1 },
    ]);

    const ctx2 = await loginPlayerBrowser(p2.nickname, p2.password);
    browsers.push(ctx2.browser);
    /* P2 disagrees: 1-3 instead of 3-1 → mismatch */
    const r2 = await ctx2.page.evaluate(async ([u, body]) => {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [
      `/api/tournaments/${tournamentId}/bm/match/${match.id}/report`,
      { reportingPlayer: 2, score1: 1, score2: 3 },
    ]);
    const mismatchFlag = r2.s === 200 &&
      (r2.b?.data?.mismatch === true || r2.b?.mismatch === true);

    const mid = await apiFetchBm(adminPage, tournamentId);
    const midMatch = (mid.matches || []).find((m) => m.id === match.id);
    const stillIncomplete = midMatch?.completed === false;

    /* Admin overrides via qualification PUT */
    const adminPut = await apiPutBmQualScore(adminPage, tournamentId, match.id, 3, 1);
    const finalData = await apiFetchBm(adminPage, tournamentId);
    const finalMatch = (finalData.matches || []).find((m) => m.id === match.id);
    const adminConfirmed = adminPut.s === 200 && finalMatch?.completed === true;

    const ok = mismatchFlag && stillIncomplete && adminConfirmed;
    log('TC-508', ok ? 'PASS' : 'FAIL',
      !mismatchFlag ? `mismatch flag missing (status=${r2.s})`
      : !stillIncomplete ? 'match auto-completed despite mismatch'
      : !adminConfirmed ? `admin PUT failed (${adminPut.s}) or not completed`
      : '');
  } catch (err) {
    log('TC-508', 'FAIL', err instanceof Error ? err.message : 'BM 508 failed');
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
  }
}

/* ───────── TC-509: BM dual report — previousReports panel ─────────
 * After P1 reports, P2 visiting /bm/participant should see P1's submission
 * in a "Previous Reports" / "過去の報告" / "既に報告" section. */
async function runTc509(adminPage) {
  const browsers = [];
  try {
    const { tournamentId, p1, p2, match } = await prepareSharedBmPair(adminPage, { dualReport: true });

    /* P1 reports first */
    const ctx1 = await loginPlayerBrowser(p1.nickname, p1.password);
    browsers.push(ctx1.browser);
    await ctx1.page.evaluate(async ([u, body]) => {
      await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }, [
      `/api/tournaments/${tournamentId}/bm/match/${match.id}/report`,
      { reportingPlayer: 1, score1: 3, score2: 1 },
    ]);

    /* P2 opens participant page and should see P1's report. */
    const ctx2 = await loginPlayerBrowser(p2.nickname, p2.password);
    browsers.push(ctx2.browser);
    await nav(ctx2.page, `/tournaments/${tournamentId}/bm/participant`);
    const pageText = await ctx2.page.locator('body').innerText();

    /* Either an English or Japanese label may appear; accept the common variants. */
    const labelShown = pageText.includes('Previous Reports') ||
      pageText.includes('前回の報告') ||
      pageText.includes('過去の報告') ||
      pageText.includes('既に報告');
    const scoreShown = /3\s*[-−]\s*1/.test(pageText);

    log('TC-509', labelShown && scoreShown ? 'PASS' : 'FAIL',
      !labelShown ? 'Previous Reports section not found in page text'
      : !scoreShown ? `P1 report (3-1) not visible — page snippet: ${pageText.slice(0, 200)}`
      : '');
  } catch (err) {
    log('TC-509', 'FAIL', err instanceof Error ? err.message : 'BM 509 failed');
  } finally {
    for (const b of browsers) await b.close().catch(() => {});
  }
}

module.exports = {
  runTc501, runTc502, runTc322, runTc503, runTc504, runTc505, runTc506,
  runTc507, runTc508, runTc509,
};

if (require.main === module) {
  runSuite({
    suiteName: 'BM',
    results,
    log,
    beforeAll: async (adminPage) => {
      sharedFixture = await createSharedE2eFixture(adminPage);
    },
    afterAll: async () => {
      if (sharedFixture) {
        await sharedFixture.cleanup();
        sharedFixture = null;
      }
    },
    tests: [
      { name: 'TC-501', fn: runTc501 },
      { name: 'TC-502', fn: runTc502 },
      { name: 'TC-507', fn: runTc507 },
      { name: 'TC-508', fn: runTc508 },
      { name: 'TC-509', fn: runTc509 },
      { name: 'TC-322', fn: runTc322 },
      { name: 'TC-503', fn: runTc503 },
      { name: 'TC-504', fn: runTc504 },
      { name: 'TC-510', fn: runTc510 },
      { name: 'TC-505', fn: runTc505 },
      { name: 'TC-506', fn: runTc506 },
    ],
  });
}

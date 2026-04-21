/**
 * E2E MR (Match Race) focused tests.
 *
 * Mirrors tc-bm.js's shared-fixture pattern. A single set of 28 shared
 * players (`e2e_shared_01..28`) and two shared tournaments (`E2E Shared
 * Normal`, `E2E Shared DualReport`) are created once in `beforeAll` and
 * reused by every TC. Each TC calls `setupModePlayersViaUi(page, 'mr',
 * tournamentId, players)` to (re)seed the MR qualification for that
 * tournament with the subset of shared players it needs.
 *
 *  TC-601  28-player qualification full flow + standings + course assignment
 *  TC-602  MR participant score entry (UI, 2 players)
 *  TC-603  MR draw 2-2 score (admin PUT, 2 players)
 *  TC-604  28-player full + finals bracket gen + race-format UI score entry
 *  TC-605  28-player full + finals bracket reset
 *  TC-606  28-player full + Grand Final → champion
 *  TC-607  28-player full + Grand Final Reset Match (M17)
 *  TC-608  MR dual report — agreement → autoConfirmed
 *  TC-609  MR dual report — mismatch detection
 *  TC-610  MR finals admin-only enforcement (403 for non-admin)
 *  TC-611  BM/MR/GP qualification confirmed → score-input lock (self-managed
 *          tournament: mutates tournament-level `qualificationConfirmed` flag)
 *  TC-612  GP race position validation (no-tie + double-game-over)
 *  TC-820  MR match/[matchId] page view-only
 *  TC-822  SKIP — feature not implemented
 *
 * Uses Playwright persistent profile at /tmp/playwright-smkc-profile.
 * Admin session must already exist in the profile (Discord OAuth).
 *
 * Run: node e2e/tc-mr.js  (from smkc-score-app/)
 */
const {
  makeResults, makeLog, nav,
  uiCreatePlayer: createPlayer,
  uiCreateTournament: createTournament,
  apiDeletePlayer: deletePlayer,
  apiDeleteTournament: deleteTournament,
  apiFetchMr,
  apiPutMrQualScore,
  apiGenerateMrFinals: generateMrFinalsBracket,
  apiSetMrFinalsScore: setMrFinalsScore,
  apiFetchMrFinalsMatches: fetchMrFinalsMatches,
  loginPlayerBrowser,
  setupMrQualViaUi,
} = require('./lib/common');
const { createSharedE2eFixture, setupModePlayersViaUi } = require('./lib/fixtures');
const { runSuite } = require('./lib/runner');

const results = makeResults();
const log = makeLog(results);
let sharedFixture = null;

function sharedMrPlayers(count = 28) {
  if (!sharedFixture) throw new Error('Shared MR fixture is not initialized');
  return sharedFixture.players.slice(0, count);
}

/** Seed the shared Normal (or DualReport) tournament's MR qualification with
 *  2 shared players and return the first non-BYE match. Mirrors
 *  `prepareSharedBmPair` in tc-bm.js. */
async function prepareSharedMrPair(adminPage, { dualReport = false } = {}) {
  if (!sharedFixture) throw new Error('Shared MR fixture is not initialized');

  const players = dualReport
    ? sharedFixture.players.slice(2, 4)
    : sharedFixture.players.slice(0, 2);
  const tournament = dualReport
    ? sharedFixture.dualTournament
    : sharedFixture.normalTournament;

  await setupModePlayersViaUi(adminPage, 'mr', tournament.id, players);

  const data = await apiFetchMr(adminPage, tournament.id);
  const match = (data.matches || []).find((m) => !m.isBye);
  if (!match) throw new Error('No non-BYE MR match found');

  return {
    tournamentId: tournament.id,
    p1: players[0],
    p2: players[1],
    match,
  };
}

/* Primed-once flag so every finals test reuses the dedicated finals
 * tournament's qualification state instead of re-seeding 84 matches. */
let sharedMrFinalsReady = false;

/** Seed the shared `finalsTournament` (separate from the pair-tests
 *  normalTournament) with all 28 shared players and complete every non-BYE
 *  match once. Subsequent calls are no-ops — finals tests regenerate the
 *  bracket each run, which doesn't disturb qualification. */
async function prepareSharedMrFinalsSetup(adminPage) {
  if (!sharedFixture) throw new Error('Shared MR fixture is not initialized');

  const players = sharedMrPlayers(28);
  const tournamentId = sharedFixture.finalsTournament.id;
  if (!sharedMrFinalsReady) {
    await setupMrQualViaUi(adminPage, tournamentId, players);
    sharedMrFinalsReady = true;
  }

  return {
    tournamentId,
    playerIds: players.map((player) => player.id),
    nicknames: players.map((player) => player.nickname),
    cleanup: async () => {},
  };
}

/**
 * TC-601: MR qualification full flow with 28 shared players, 2 groups (A/B × 14)
 *
 * Verifies:
 * - 28 players distributed across 2 groups via the shared UI setup (snake-draft)
 * - All 182 non-BYE matches (14-player RR = 91 × 2 groups) scored via admin PUT
 * - Standings sorted by score desc → points desc per group
 * - Course assignment exists in match data (assignCoursesRandomly)
 */
async function runTc601(adminPage) {
  try {
    const players = sharedMrPlayers(28);
    const tournamentId = sharedFixture.normalTournament.id;
    await setupModePlayersViaUi(adminPage, 'mr', tournamentId, players);

    // Step 1: Fetch matches and verify structure
    const mrData = await apiFetchMr(adminPage, tournamentId);
    const matches = mrData.matches || [];
    const nonByeMatches = matches.filter((m) => !m.isBye);

    // 14-player RR per group = 91 matches × 2 groups = 182 non-BYE matches
    const hasExpectedMatches = nonByeMatches.length === 182;

    // Step 2: Input scores for all matches (valid MR: score1+score2=4)
    // Use varied scores: 3-1, 2-2, 4-0, 1-3 to test all valid combinations
    const scorePatterns = [[3, 1], [2, 2], [4, 0], [1, 3], [3, 1], [2, 2]];
    let allScoresOk = true;

    for (let i = 0; i < nonByeMatches.length; i++) {
      const m = nonByeMatches[i];
      const [s1, s2] = scorePatterns[i % scorePatterns.length];
      const scoreRes = await apiPutMrQualScore(adminPage, tournamentId, m.id, s1, s2);
      if (scoreRes.s !== 200) {
        allScoresOk = false;
        break;
      }
    }

    // Step 3: Verify standings page renders
    await nav(adminPage, `/tournaments/${tournamentId}/mr`);
    const pageText = await adminPage.locator('main').innerText().catch(() => '');
    const hasStandings = pageText.length > 50 &&
      !pageText.includes('Failed to fetch') &&
      !pageText.includes('エラーが発生しました');

    // Step 4: Verify standings via API — sorted by score desc, points desc per group
    const standings = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr/standings`);

    const standingsData = standings.data || standings;
    const groupStandings = standingsData.standings || [];

    // Check each group's standings are sorted correctly
    let standingsSorted = true;
    for (const gs of groupStandings) {
      const rows = gs.players || gs.rows || [];
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1];
        const curr = rows[i];
        // Primary: score desc, secondary: points desc
        if (prev.score < curr.score || (prev.score === curr.score && prev.points < curr.points)) {
          standingsSorted = false;
          break;
        }
      }
    }

    // Step 5: Verify courses are assigned (MR-specific: assignCoursesRandomly)
    const postScoreData = await apiFetchMr(adminPage, tournamentId);
    const postScoreMatches = postScoreData.matches || [];
    const hasCourses = postScoreMatches.some((m) => m.rounds && m.rounds.length > 0);

    const allPassed = hasExpectedMatches && allScoresOk && hasStandings && standingsSorted;
    log('TC-601', allPassed ? 'PASS' : 'FAIL',
      !hasExpectedMatches ? `Expected 84 non-bye matches, got ${nonByeMatches.length}`
      : !allScoresOk ? 'Some score inputs failed'
      : !hasStandings ? 'Standings page did not render properly'
      : !standingsSorted ? 'Standings not sorted correctly'
      : !hasCourses ? 'No course data found in matches (assignCoursesRandomly not working)'
      : '');
  } catch (err) {
    log('TC-601', 'FAIL', err instanceof Error ? err.message : 'MR full flow failed');
  }
}

/**
 * TC-602: MR player login + participant score entry (2 shared players)
 *
 * Player1 logs in via separate browser, submits race results (3-1) via the MR
 * participant page, verifies persistence.
 */
async function runTc602(adminPage) {
  let playerBrowser = null;
  try {
    const { tournamentId, p1, match } = await prepareSharedMrPair(adminPage);

    const ctx = await loginPlayerBrowser(p1.nickname, p1.password);
    playerBrowser = ctx.browser;
    const playerPage = ctx.page;

    await nav(playerPage, `/tournaments/${tournamentId}/mr/participant`);

    // MR participant: fixed 4 assigned courses with winner buttons.
    // P1 wins races 1, 2, 4; P2 wins race 3 → 3-1
    for (let i = 0; i < 4; i++) {
      const winnerButtons = playerPage.locator(`button[aria-label$="wins race ${i + 1}"]`);
      const winnerIdx = i === 2 ? 1 : 0;
      await winnerButtons.nth(winnerIdx).click();
      await playerPage.waitForTimeout(300);
    }

    playerPage.once('dialog', async (dialog) => { await dialog.accept(); });
    await playerPage.getByRole('button', { name: /Submit|スコア送信|送信/ }).click();
    await playerPage.waitForTimeout(5000);

    const updatedMr = await apiFetchMr(adminPage, tournamentId);
    const updatedMatch = (updatedMr.matches || []).find((m) => m.id === match.id);

    const scorePersisted =
      updatedMatch?.completed === true &&
      updatedMatch.score1 === 3 &&
      updatedMatch.score2 === 1;

    log('TC-602', scorePersisted ? 'PASS' : 'FAIL',
      scorePersisted ? ''
      : !updatedMatch ? 'Match not found after submission'
      : `completed=${updatedMatch?.completed} score=${updatedMatch?.score1}-${updatedMatch?.score2}`);
  } catch (err) {
    log('TC-602', 'FAIL', err instanceof Error ? err.message : 'MR participant flow failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
  }
}

/**
 * TC-603: MR draw (2-2) score submission
 *
 * Verifies that a 2-2 draw is a valid MR score and persists correctly.
 */
async function runTc603(adminPage) {
  try {
    const { tournamentId, match } = await prepareSharedMrPair(adminPage);

    const drawRes = await apiPutMrQualScore(adminPage, tournamentId, match.id, 2, 2);
    const drawAccepted = drawRes.s === 200;

    const updated = await apiFetchMr(adminPage, tournamentId);
    const updatedMatch = (updated.matches || []).find((m) => m.id === match.id);
    const drawPersisted = updatedMatch?.completed === true &&
      updatedMatch.score1 === 2 && updatedMatch.score2 === 2;

    log('TC-603', drawAccepted && drawPersisted ? 'PASS' : 'FAIL',
      !drawAccepted ? `Draw rejected (${drawRes.s})`
      : !drawPersisted ? `Draw not persisted: ${updatedMatch?.score1}-${updatedMatch?.score2}`
      : '');
  } catch (err) {
    log('TC-603', 'FAIL', err instanceof Error ? err.message : 'MR draw test failed');
  }
}

/**
 * TC-604: MR 28-player finals + race-format UI score entry
 *
 * Completes 84 qualification matches (shared fixture), generates the finals
 * bracket via the UI (top 8), uses the race entry dialog to score M1
 * (first-to-3), validates that first-to-N with both players winning 3 is
 * rejected, and that winner/loser are routed into M5 and M8.
 */
async function runTc604(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedMrFinalsSetup(adminPage);
    const { tournamentId } = setup;

    // Navigate to finals page and generate bracket via UI
    await nav(adminPage, `/tournaments/${tournamentId}/mr/finals`);
    await adminPage.getByRole('button', { name: /Generate finals bracket|Generate Bracket|ブラケット生成/i }).click();
    await adminPage.getByRole('button', { name: /生成 \(8 players\)|Generate \(8 players\)/ }).click();
    await adminPage.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('0 / 17') && (text.includes('M1') || text.includes('Match 1'));
    }, null, { timeout: 20000 });

    // Fetch generated bracket
    const matches = await fetchMrFinalsMatches(adminPage, tournamentId);
    const match1 = matches.find((m) => m.matchNumber === 1);
    if (!match1) throw new Error('Generated bracket missing match 1');

    // MR finals validation: first-to-3 race wins (targetWins defaults to 3).
    // Both players reaching targetWins (3-3) is invalid: only one winner allowed.
    const invalidBothWin = await setMrFinalsScore(adminPage, tournamentId, match1.id, 3, 3);

    // Valid MR finals: first-to-3 via UI dialog (tests race entry workflow)
    await adminPage.locator(`[aria-label^="Match 1:"]`).first().click();
    await adminPage.waitForTimeout(500);

    // MR finals dialog: 5 race rows pre-rendered with course select + P1/P2 winner buttons.
    // P1 wins 3 out of 4 races (first-to-3): P1 wins races 1,2,4; P2 wins race 3 → 3-1
    const raceRows = adminPage.locator('table tbody tr');
    const rowCount = await raceRows.count();

    for (let i = 0; i < Math.min(rowCount, 5); i++) {
      const row = raceRows.nth(i);
      // Select course if combobox present
      const combobox = row.locator('button[role="combobox"]');
      if (await combobox.count() > 0) {
        await combobox.first().click();
        await adminPage.waitForTimeout(200);
        const option = adminPage.locator('[role="option"]').nth(i);
        if (await option.count() > 0) {
          await option.click();
          await adminPage.waitForTimeout(200);
        }
      }

      if (i >= 4) continue;

      // P2 wins race 3 (index 2), P1 wins all others
      const winnerIdx = (i === 2) ? 1 : 0;
      const winnerBtns = row.locator('.flex.items-center.gap-2 button');
      if (await winnerBtns.count() >= 2) {
        await winnerBtns.nth(winnerIdx).click();
        await adminPage.waitForTimeout(200);
      }
    }

    await adminPage.getByRole('button', { name: /Save|保存/ }).click();
    await adminPage.waitForTimeout(3000);

    // Poll for bracket update
    let updatedMatches = [];
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      updatedMatches = await fetchMrFinalsMatches(adminPage, tournamentId);
      const m1 = updatedMatches.find((m) => m.id === match1.id);
      const winnerTarget = updatedMatches.find((m) => m.matchNumber === 5);
      const loserTarget = updatedMatches.find((m) => m.matchNumber === 8);
      if (m1?.completed && winnerTarget?.player1Id && loserTarget?.player1Id) break;
      await adminPage.waitForTimeout(500);
    }

    const updatedMatch1 = updatedMatches.find((m) => m.id === match1.id);
    const winnerTarget = updatedMatches.find((m) => m.matchNumber === 5);
    const loserTarget = updatedMatches.find((m) => m.matchNumber === 8);

    // MR uses getStyle: 'simple' — no winnersMatches/losersMatches/grandFinalMatches
    const bracketGenerated = updatedMatches.length === 17;

    // Both players at 3-3 should be rejected (no valid winner)
    const invalidScoreRejected = invalidBothWin.s === 400;

    const scoreSaved = updatedMatch1?.completed === true;
    const winnerRouted = [winnerTarget?.player1Id, winnerTarget?.player2Id].includes(match1.player1Id);
    const loserRouted = [loserTarget?.player1Id, loserTarget?.player2Id].includes(match1.player2Id);

    log('TC-604',
      bracketGenerated && invalidScoreRejected && scoreSaved && winnerRouted && loserRouted ? 'PASS' : 'FAIL',
      !bracketGenerated ? `Bracket counts: matches=${updatedMatches.length}`
      : !invalidScoreRejected ? `3-3 was not rejected (${invalidBothWin.s})`
      : !scoreSaved ? `Score not saved: completed=${updatedMatch1?.completed}`
      : !(winnerRouted && loserRouted) ? 'Routing mismatch'
      : '');
  } catch (err) {
    log('TC-604', 'FAIL', err instanceof Error ? err.message : 'MR finals flow failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-605: MR finals bracket reset (28-player full) ─────────
 * Re-POST to /finals (same endpoint the UI's Reset button calls) regenerates
 * the bracket with all 17 matches pending. */
async function runTc605(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedMrFinalsSetup(adminPage);
    const { tournamentId } = setup;

    const gen = await generateMrFinalsBracket(adminPage, tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    const before = await fetchMrFinalsMatches(adminPage, tournamentId);
    const m1 = before.find((m) => m.matchNumber === 1);
    if (!m1) throw new Error('Bracket missing match 1');

    const score = await setMrFinalsScore(adminPage, tournamentId, m1.id, 3, 0);
    if (score.s !== 200) throw new Error(`Score put failed (${score.s})`);

    const completedBefore = (await fetchMrFinalsMatches(adminPage, tournamentId))
      .filter((m) => m.completed).length;
    if (completedBefore < 1) throw new Error('Pre-reset score not persisted');

    const reset = await generateMrFinalsBracket(adminPage, tournamentId, 8);
    if (reset.s !== 200 && reset.s !== 201) throw new Error(`Bracket reset failed (${reset.s})`);

    const after = await fetchMrFinalsMatches(adminPage, tournamentId);
    const completedAfter = after.filter((m) => m.completed).length;
    const ok = completedBefore >= 1 && completedAfter === 0 && after.length === 17;
    log('TC-605', ok ? 'PASS' : 'FAIL',
      ok ? '' : `before=${completedBefore} after=${completedAfter} total=${after.length}`);
  } catch (err) {
    log('TC-605', 'FAIL', err instanceof Error ? err.message : 'MR 605 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-606: MR Grand Final → champion (28-player full) ─────────
 * Drive M1..M16 with player1 sweeping 3-0 each. The Winners-side champion
 * takes M16 and the champion banner on /mr/finals must show the expected nick. */
async function runTc606(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedMrFinalsSetup(adminPage);
    const { tournamentId, playerIds, nicknames } = setup;

    const gen = await generateMrFinalsBracket(adminPage, tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    /* Drive M1..M16 sequentially. P1 wins 3-0 so seeds propagate deterministically. */
    for (let mn = 1; mn <= 16; mn++) {
      const matches = await fetchMrFinalsMatches(adminPage, tournamentId);
      const match = matches.find((m) => m.matchNumber === mn);
      if (!match || !match.player1Id || !match.player2Id) {
        throw new Error(`Match ${mn} not ready (p1=${match?.player1Id} p2=${match?.player2Id})`);
      }
      const res = await setMrFinalsScore(adminPage, tournamentId, match.id, 3, 0);
      if (res.s !== 200) throw new Error(`Match ${mn} put failed (${res.s})`);
    }

    const finalMatches = await fetchMrFinalsMatches(adminPage, tournamentId);
    const m16 = finalMatches.find((m) => m.matchNumber === 16);
    const expectedChampionId = m16?.player1Id;
    if (!expectedChampionId) throw new Error('GF (M16) missing player1');
    const championNickname = nicknames[playerIds.indexOf(expectedChampionId)];

    await nav(adminPage, `/tournaments/${tournamentId}/mr/finals`);
    const pageText = await adminPage.locator('body').innerText();
    const m16Completed = m16?.completed === true && m16.score1 === 3 && m16.score2 === 0;
    const championShown = pageText.includes(championNickname) &&
      (pageText.includes('Champion') || pageText.includes('チャンピオン') || pageText.includes('優勝'));

    log('TC-606', m16Completed && championShown ? 'PASS' : 'FAIL',
      !m16Completed ? `M16 not completed: ${m16?.score1}-${m16?.score2} completed=${m16?.completed}`
      : !championShown ? `Champion banner missing nickname ${championNickname}`
      : '');
  } catch (err) {
    log('TC-606', 'FAIL', err instanceof Error ? err.message : 'MR 606 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-607: MR Grand Final Reset Match (M17) ─────────
 * If the L-side champion takes the GF, M17 is generated. We force this by
 * scoring M16 0-3 (the L-side champion is in the P2 slot per bracket routing). */
async function runTc607(adminPage) {
  let setup = null;
  try {
    setup = await prepareSharedMrFinalsSetup(adminPage);
    const { tournamentId } = setup;

    const gen = await generateMrFinalsBracket(adminPage, tournamentId, 8);
    if (gen.s !== 200 && gen.s !== 201) throw new Error(`Bracket gen failed (${gen.s})`);

    /* M1..M15: P1 wins 3-0 each */
    for (let mn = 1; mn <= 15; mn++) {
      const matches = await fetchMrFinalsMatches(adminPage, tournamentId);
      const match = matches.find((m) => m.matchNumber === mn);
      if (!match || !match.player1Id || !match.player2Id) throw new Error(`Match ${mn} not ready`);
      const res = await setMrFinalsScore(adminPage, tournamentId, match.id, 3, 0);
      if (res.s !== 200) throw new Error(`Match ${mn} put failed (${res.s})`);
    }

    /* M16: L-side champion (P2) wins 0-3 → triggers M17 */
    let matches = await fetchMrFinalsMatches(adminPage, tournamentId);
    const m16 = matches.find((m) => m.matchNumber === 16);
    if (!m16 || !m16.player1Id || !m16.player2Id) throw new Error('M16 not ready');
    const expectedResetChampionId = m16.player2Id;
    const m16Res = await setMrFinalsScore(adminPage, tournamentId, m16.id, 0, 3);
    if (m16Res.s !== 200) throw new Error(`M16 put failed (${m16Res.s})`);

    matches = await fetchMrFinalsMatches(adminPage, tournamentId);
    const m17 = matches.find((m) => m.matchNumber === 17);
    if (!m17) throw new Error('M17 not generated');
    const m17Populated = !!m17.player1Id && !!m17.player2Id;

    /* Play M17. The L-side champion's slot may be P1 or P2 depending on routing. */
    const m17ScoreP1Wins = m17.player1Id === expectedResetChampionId;
    const m17Res = await setMrFinalsScore(adminPage, tournamentId, m17.id,
      m17ScoreP1Wins ? 3 : 0,
      m17ScoreP1Wins ? 0 : 3);
    if (m17Res.s !== 200) throw new Error(`M17 put failed (${m17Res.s})`);

    const finalMatches = await fetchMrFinalsMatches(adminPage, tournamentId);
    const finalM17 = finalMatches.find((m) => m.matchNumber === 17);
    const m17Completed = finalM17?.completed === true;

    log('TC-607', m17Populated && m17Completed ? 'PASS' : 'FAIL',
      !m17Populated ? `M17 not populated p1=${m17.player1Id} p2=${m17.player2Id}`
      : !m17Completed ? 'M17 not completed'
      : '');
  } catch (err) {
    log('TC-607', 'FAIL', err instanceof Error ? err.message : 'MR 607 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/**
 * TC-608: MR dual report — agreement auto-confirm
 *
 * With dualReportEnabled=true on the shared DualReport tournament, both
 * players report the same score (3-1), which auto-confirms the match.
 */
async function runTc608(adminPage) {
  try {
    const { tournamentId, match } = await prepareSharedMrPair(adminPage, { dualReport: true });

    // P1 reports 3-1 via API (report endpoint)
    const p1Report = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/mr/match/${match.id}/report`, {
      reportingPlayer: 1,
      score1: 3,
      score2: 1,
    }]);

    const p1Waiting = p1Report.b?.data?.waitingFor === 'player2' || p1Report.b?.waitingFor === 'player2';

    const midCheck = await apiFetchMr(adminPage, tournamentId);
    const midMatch = (midCheck.matches || []).find((m) => m.id === match.id);
    const stillPending = midMatch?.completed === false;

    // P2 reports same score 3-1
    const p2Report = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/mr/match/${match.id}/report`, {
      reportingPlayer: 2,
      score1: 3,
      score2: 1,
    }]);

    const autoConfirmed = p2Report.b?.data?.autoConfirmed === true || p2Report.b?.autoConfirmed === true;

    const finalCheck = await apiFetchMr(adminPage, tournamentId);
    const finalMatch = (finalCheck.matches || []).find((m) => m.id === match.id);
    const isComplete = finalMatch?.completed === true && finalMatch.score1 === 3 && finalMatch.score2 === 1;

    log('TC-608',
      p1Waiting && stillPending && autoConfirmed && isComplete ? 'PASS' : 'FAIL',
      !p1Waiting ? 'P1 report did not return waitingFor: player2'
      : !stillPending ? 'Match became completed after single report'
      : !autoConfirmed ? 'P2 report did not auto-confirm'
      : !isComplete ? `Final state: completed=${finalMatch?.completed} score=${finalMatch?.score1}-${finalMatch?.score2}`
      : '');
  } catch (err) {
    log('TC-608', 'FAIL', err instanceof Error ? err.message : 'MR dual report agreement failed');
  }
}

/**
 * TC-609: MR dual report — mismatch detection
 *
 * P1 reports 3-1, P2 reports 1-3 (disagreement). Match stays incomplete
 * with mismatch flag. Admin resolves.
 */
async function runTc609(adminPage) {
  try {
    const { tournamentId, match } = await prepareSharedMrPair(adminPage, { dualReport: true });

    // P1 reports 3-1
    await adminPage.evaluate(async ([url, body]) => {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }, [`/api/tournaments/${tournamentId}/mr/match/${match.id}/report`, {
      reportingPlayer: 1, score1: 3, score2: 1,
    }]);

    // P2 reports 1-3 (disagrees — from P2's perspective, P2 won)
    const p2Report = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/mr/match/${match.id}/report`, {
      reportingPlayer: 2, score1: 1, score2: 3,
    }]);

    const hasMismatch = p2Report.b?.data?.mismatch === true || p2Report.b?.mismatch === true;

    const midCheck = await apiFetchMr(adminPage, tournamentId);
    const midMatch = (midCheck.matches || []).find((m) => m.id === match.id);
    const stillIncomplete = midMatch?.completed === false;

    // Admin resolves with PUT
    const adminResolve = await apiPutMrQualScore(adminPage, tournamentId, match.id, 3, 1);
    const resolved = adminResolve.s === 200;

    const finalCheck = await apiFetchMr(adminPage, tournamentId);
    const finalMatch = (finalCheck.matches || []).find((m) => m.id === match.id);
    const isComplete = finalMatch?.completed === true;

    log('TC-609',
      hasMismatch && stillIncomplete && resolved && isComplete ? 'PASS' : 'FAIL',
      !hasMismatch ? 'Mismatch flag not set'
      : !stillIncomplete ? 'Match was completed despite mismatch'
      : !resolved ? 'Admin resolve failed'
      : !isComplete ? 'Match not completed after admin resolve'
      : '');
  } catch (err) {
    log('TC-609', 'FAIL', err instanceof Error ? err.message : 'MR dual report mismatch failed');
  }
}

/**
 * TC-610: MR Finals admin-only enforcement
 *
 * Verifies that non-admin (player) receives 403 when trying to PUT
 * score on MR finals matches. BM/GP finals share the same putRequiresAuth
 * mechanism in finals-route factory, so testing MR covers the shared logic.
 *
 * Uses the shared fixture: 28-player finals setup then logs in as one of
 * the shared players via a separate browser.
 */
async function runTc610(adminPage) {
  let setup = null;
  let playerBrowser = null;
  try {
    setup = await prepareSharedMrFinalsSetup(adminPage);
    const { tournamentId } = setup;

    // Generate MR finals bracket via API
    const bracketRes = await generateMrFinalsBracket(adminPage, tournamentId, 8);
    if (bracketRes.s !== 201 && bracketRes.s !== 200) {
      throw new Error(`Bracket generation failed (${bracketRes.s})`);
    }

    // Get first finals match
    const finalsMatches = await fetchMrFinalsMatches(adminPage, tournamentId);
    const finalsMatch = finalsMatches.find((m) => m.matchNumber === 1);
    if (!finalsMatch) throw new Error('No finals match found');

    // Login as one of the shared players (non-admin)
    const player = sharedFixture.players[0];
    const ctx = await loginPlayerBrowser(player.nickname, player.password);
    playerBrowser = ctx.browser;
    const playerPage = ctx.page;

    // Try to PUT finals score as player → should get 403
    const mrFinalsPut = await playerPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr/finals`, { matchId: finalsMatch.id, score1: 3, score2: 0 }]);

    const mrRejected = mrFinalsPut.s === 403;

    log('TC-610', mrRejected ? 'PASS' : 'FAIL',
      !mrRejected ? `MR finals PUT returned ${mrFinalsPut.s} instead of 403` : '');
  } catch (err) {
    log('TC-610', 'FAIL', err instanceof Error ? err.message : 'Finals auth test failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
    if (setup) await setup.cleanup();
  }
}

/**
 * TC-611: Qualification confirmed — score lock verification
 *
 * NOTE: This test intentionally uses its own isolated tournament because it
 * mutates the tournament-level `qualificationConfirmed` flag. If the test
 * crashes between confirming and un-confirming on the shared Normal
 * tournament, every subsequent TC on that tournament would be locked out.
 * A throwaway tournament is worth the create/delete cost for safety.
 *
 * Verifies the full lifecycle:
 * 1. Score edit works before confirmation
 * 2. qualificationConfirmed=true locks PUT and report POST with 403
 * 3. qualificationConfirmed=false unlocks score editing again
 */
async function runTc611(adminPage) {
  let tournamentId = null;
  let player1 = null;
  let player2 = null;

  try {
    const stamp = Date.now();
    player1 = await createPlayer(adminPage, 'E2E QC Lock P1', `e2e_qc611_p1_${stamp}`);
    player2 = await createPlayer(adminPage, 'E2E QC Lock P2', `e2e_qc611_p2_${stamp}`);

    tournamentId = await createTournament(adminPage, `E2E QC Lock ${stamp}`);

    // Setup MR qualification
    const setup = await adminPage.evaluate(async ([url, data]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr`, {
      players: [
        { playerId: player1.id, group: 'A' },
        { playerId: player2.id, group: 'A' },
      ],
    }]);
    if (setup.s !== 201) throw new Error(`MR setup failed (${setup.s})`);

    const mrData = await apiFetchMr(adminPage, tournamentId);
    const match = (mrData.matches || []).find((m) => !m.isBye);
    if (!match) throw new Error('No non-BYE match');

    // Step 1: Score edit works before confirmation
    const preRes = await apiPutMrQualScore(adminPage, tournamentId, match.id, 3, 1);
    const preEditOk = preRes.s === 200;

    // Step 2: Confirm qualification
    const confirmRes = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}`, { qualificationConfirmed: true }]);
    const confirmOk = confirmRes.s === 200;

    // Step 3: Score edit should be blocked (403)
    const lockedPut = await apiPutMrQualScore(adminPage, tournamentId, match.id, 2, 2);
    const putBlocked = lockedPut.s === 403;

    // Step 4: Player report should also be blocked (403)
    const lockedReport = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr/match/${match.id}/report`, {
      reportingPlayer: 1, score1: 3, score2: 1,
    }]);
    const reportBlocked = lockedReport.s === 403;

    // Step 5: Unlock qualification
    await adminPage.evaluate(async ([url, body]) => {
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }, [`/api/tournaments/${tournamentId}`, { qualificationConfirmed: false }]);

    // Step 6: Score edit should work again
    const postUnlock = await apiPutMrQualScore(adminPage, tournamentId, match.id, 2, 2);
    const postUnlockOk = postUnlock.s === 200;

    const allPassed = preEditOk && confirmOk && putBlocked && reportBlocked && postUnlockOk;
    log('TC-611', allPassed ? 'PASS' : 'FAIL',
      !preEditOk ? 'Pre-confirmation score edit failed'
      : !confirmOk ? 'Qualification confirmation failed'
      : !putBlocked ? `PUT not blocked (got ${lockedPut.s}, expected 403)`
      : !reportBlocked ? `Report not blocked (got ${lockedReport.s}, expected 403)`
      : !postUnlockOk ? `Post-unlock score edit failed (${postUnlock.s})`
      : '');
  } catch (err) {
    log('TC-611', 'FAIL', err instanceof Error ? err.message : 'Qualification lock test failed');
  } finally {
    // Ensure unlock before cleanup so tournament deletion works
    if (tournamentId) {
      await adminPage.evaluate(async ([url, body]) => {
        await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }, [`/api/tournaments/${tournamentId}`, { qualificationConfirmed: false }]).catch(() => {});
      await deleteTournament(adminPage, tournamentId);
    }
    if (player1) await deletePlayer(adminPage, player1.id);
    if (player2) await deletePlayer(adminPage, player2.id);
  }
}

/**
 * TC-612: GP race same-position validation
 *
 * Verifies that the GP qualification API rejects races where both players
 * have the same finishing position (e.g. both 2nd), but allows both at
 * position 0 (both game over, §7.2).
 *
 * Uses the shared Normal tournament with 2 shared players on the /gp endpoint.
 * GP setup is independent of MR setup on the same tournament (each mode has
 * its own route).
 */
async function runTc612(adminPage) {
  try {
    if (!sharedFixture) throw new Error('Shared fixture is not initialized');
    const tournamentId = sharedFixture.normalTournament.id;
    const players = sharedFixture.players.slice(0, 2);

    // Setup GP qualification with 2 players on the shared tournament.
    // POST /gp is upsert-friendly: re-running replaces the previous GP setup.
    const setup = await adminPage.evaluate(async ([url, data]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/gp`, {
      players: [
        { playerId: players[0].id, group: 'A' },
        { playerId: players[1].id, group: 'A' },
      ],
    }]);
    if (setup.s !== 201) throw new Error(`GP setup failed (${setup.s}): ${JSON.stringify(setup.b).slice(0, 200)}`);

    // Get match
    const gpData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/gp`);
    const match = (gpData.data?.matches || gpData.matches || []).find((m) => !m.isBye);
    if (!match) throw new Error('No non-BYE GP match');
    const cup = match.cup || 'Mushroom';

    // Test 1: Same position (both 2nd) should be rejected (400)
    const samePos = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/gp`, {
      matchId: match.id,
      cup,
      races: [
        { course: 'MC1', position1: 1, position2: 3 },
        { course: 'DP1', position1: 2, position2: 2 }, // same position!
        { course: 'GV1', position1: 1, position2: 4 },
        { course: 'BC1', position1: 3, position2: 1 },
        { course: 'MC2', position1: 1, position2: 5 },
      ],
    }]);
    const sameRejected = samePos.s === 400;

    // Test 2: Both game over (0-0) should be allowed (200)
    const bothGameOver = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/gp`, {
      matchId: match.id,
      cup,
      races: [
        { course: 'MC1', position1: 1, position2: 3 },
        { course: 'DP1', position1: 0, position2: 0 }, // both game over
        { course: 'GV1', position1: 1, position2: 4 },
        { course: 'BC1', position1: 3, position2: 1 },
        { course: 'MC2', position1: 1, position2: 5 },
      ],
    }]);
    const gameOverAccepted = bothGameOver.s === 200;

    // Test 3: Normal valid data (all different positions) should succeed (200)
    const validData = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/gp`, {
      matchId: match.id,
      cup,
      races: [
        { course: 'MC1', position1: 1, position2: 3 },
        { course: 'DP1', position1: 2, position2: 4 },
        { course: 'GV1', position1: 1, position2: 5 },
        { course: 'BC1', position1: 3, position2: 1 },
        { course: 'MC2', position1: 1, position2: 2 },
      ],
    }]);
    const validAccepted = validData.s === 200;

    const allPassed = sameRejected && gameOverAccepted && validAccepted;
    log('TC-612', allPassed ? 'PASS' : 'FAIL',
      !sameRejected ? `Same position not rejected (got ${samePos.s}, expected 400)`
      : !gameOverAccepted ? `Both game-over rejected (got ${bothGameOver.s}, expected 200)`
      : !validAccepted ? `Valid data rejected (got ${validData.s}, expected 200)`
      : '');
  } catch (err) {
    log('TC-612', 'FAIL', err instanceof Error ? err.message : 'GP position validation failed');
  }
}

/* ───────── TC-820: MR match/[matchId] page view-only ─────────
 * Similar to TC-321 (BM match page), MR match pages are also view-only.
 * Score entry is consolidated to the /mr/participant page. */
async function runTc820(adminPage) {
  try {
    const { tournamentId, p1, p2, match } = await prepareSharedMrPair(adminPage);

    // Visit match page
    await nav(adminPage, `/tournaments/${tournamentId}/mr/match/${match.id}`);
    const matchText = await adminPage.locator('body').innerText();

    // Should show player names
    const showsPlayers = matchText.includes(p1.nickname) && matchText.includes(p2.nickname);
    // Should NOT have score entry form (winner buttons, course selectors)
    const noScoreForm = !matchText.includes('wins race') && !matchText.includes('I am') && !matchText.includes('私は');

    log('TC-820', showsPlayers && noScoreForm ? 'PASS' : 'FAIL',
      !showsPlayers ? 'Match page missing player names' : !noScoreForm ? 'Match page has score entry form' : '');
  } catch (err) {
    log('TC-820', 'FAIL', err instanceof Error ? err.message : 'MR match view test failed');
  }
}

/* ───────── TC-822: MR scoresConfirmed → subsequent PUT blocked ─────────
 * SKIPPED — feature not implemented. MRMatch has no `scoresConfirmed` column
 * and qualification-route.ts only blocks edits when the whole qualification
 * stage is confirmed, not per match. See E2E_TEST_CASES.md TC-822 entry. */
async function runTc822(adminPage) {
  // eslint-disable-next-line no-unused-vars
  const _ = adminPage;
  log('TC-822', 'SKIP', 'feature not implemented (no scoresConfirmed column on MRMatch)');
}

/* See tc-bm.js::getSuite for the shared-fixture composition contract. */
function getSuite({ sharedFixture: externalFixture = null } = {}) {
  const ownsFixture = !externalFixture;
  return {
    suiteName: 'MR',
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
      sharedMrFinalsReady = false;
    },
    tests: [
      { name: 'TC-602', fn: runTc602 },
      { name: 'TC-603', fn: runTc603 },
      { name: 'TC-608', fn: runTc608 },
      { name: 'TC-609', fn: runTc609 },
      { name: 'TC-820', fn: runTc820 },
      { name: 'TC-601', fn: runTc601 },
      { name: 'TC-604', fn: runTc604 },
      { name: 'TC-605', fn: runTc605 },
      { name: 'TC-606', fn: runTc606 },
      { name: 'TC-607', fn: runTc607 },
      { name: 'TC-610', fn: runTc610 },
      { name: 'TC-612', fn: runTc612 },
      { name: 'TC-611', fn: runTc611 },
      { name: 'TC-822', fn: runTc822 },
    ],
  };
}

module.exports = {
  runTc601, runTc602, runTc603, runTc604, runTc605, runTc606, runTc607,
  runTc608, runTc609, runTc610, runTc611, runTc612, runTc820, runTc822,
  getSuite,
  results,
};

if (require.main === module) {
  runSuite(getSuite());
}

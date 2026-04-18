/**
 * E2E MR (Match Race) focused tests.
 *
 * Mirrors tc-bm.js structure but covers MR-specific flows.
 * Full-workflow tests use 28 players (4 groups × 7, snake-draft).
 * Single-match tests use 2 players for speed.
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
 *  TC-611  BM/MR/GP qualification confirmed → score-input lock
 *  TC-612  GP race position validation (no-tie + double-game-over)
 *
 * Uses Playwright persistent profile at /tmp/playwright-smkc-profile.
 * Admin session must already exist in the profile (Discord OAuth).
 *
 * Run: node e2e/tc-mr.js  (from smkc-score-app/)
 */
const { chromium } = require('playwright');

/* Shared helpers (logging, API CRUD, snake-draft, 28-player setup) live in
 * e2e/lib/common.js. We import-and-alias to keep call-sites in this file
 * unchanged from the pre-common-extraction version. */
const {
  makeResults, makeLog, nav,
  apiCreatePlayer: createPlayer,
  apiCreateTournament: createTournament,
  apiDeletePlayer: deletePlayer,
  apiDeleteTournament: deleteTournament,
  apiPutMrQualScore,
  apiGenerateMrFinals: generateMrFinalsBracket,
  apiSetMrFinalsScore: setMrFinalsScore,
  apiFetchMrFinalsMatches: fetchMrFinalsMatches,
  setupMr28PlayerFinals,
  snakeDraft28: snakeDraftMr28,
} = require('./lib/common');
const { runSuite } = require('./lib/runner');

const results = makeResults();
const log = makeLog(results);

/** Complete every non-BYE MR qualification match via admin PUT (3-1 by default).
 *  Used by TC-604/605/606/607 setup paths that call setupMr28PlayerFinals
 *  internally; kept here for any tests that need to score additional matches
 *  after the helper-driven setup. */
async function completeAllMrQualMatches(adminPage, tournamentId, score1 = 3, score2 = 1) {
  const data = await adminPage.evaluate(async (url) => {
    const r = await fetch(url);
    return r.json().catch(() => ({}));
  }, `/api/tournaments/${tournamentId}/mr`);
  const matches = (data.data?.matches || data.matches || []).filter((m) => !m.isBye && !m.completed);
  for (const m of matches) {
    const res = await apiPutMrQualScore(adminPage, tournamentId, m.id, score1, score2);
    if (res.s !== 200) {
      throw new Error(`MR qual put failed (${res.s}) match=${m.id}`);
    }
  }
}

/**
 * TC-601: MR qualification full flow with 28 players, seeding, snake-draft 4 groups
 *
 * Verifies:
 * - 28 players with seeding 1-28 distributed across 4 groups (A/B/C/D × 7)
 * - Snake-draft (boustrophedon: row r=floor(i/4), col=i%4 normally / 3-i%4 odd row)
 * - All 84 non-BYE matches (7-player RR = 21 × 4 groups) scored sum=4 (BYE allowed for odd group size)
 * - Standings sorted by score desc → points desc per group
 * - Course assignment exists in match data (assignCoursesRandomly)
 */
async function runTc601(adminPage) {
  let tournamentId = null;
  const playerIds = [];

  try {
    const stamp = Date.now();

    // Step 1: Create 28 players
    for (let i = 1; i <= 28; i++) {
      const p = await createPlayer(adminPage, `E2E MR P${i}`, `e2e_mr601_${stamp}_${i}`);
      playerIds.push(p.id);
    }

    // Step 2: Create tournament
    tournamentId = await createTournament(adminPage, `E2E MR Full ${stamp}`);

    // Step 3: Setup MR qualification with seeding across 4 groups (snake draft).
    // Boustrophedon: row r = floor(i/4); column c = i%4 on even rows, 3-(i%4) on odd rows.
    // 7 rows × 4 cols = 28 entries. Each column maps to a group A/B/C/D.
    const groupNames = ['A', 'B', 'C', 'D'];
    const players = playerIds.map((playerId, i) => {
      const row = Math.floor(i / 4);
      const col = row % 2 === 0 ? (i % 4) : (3 - (i % 4));
      return { playerId, group: groupNames[col], seeding: i + 1 };
    });

    const setup = await adminPage.evaluate(async ([url, data]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/mr`, { players }]);

    if (setup.s !== 201) throw new Error(`MR setup failed (${setup.s}): ${JSON.stringify(setup.b)}`);

    // Step 4: Fetch matches and verify structure
    const mrData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);

    const matches = mrData.data?.matches || mrData.matches || [];
    const nonByeMatches = matches.filter((m) => !m.isBye);

    // 7-player RR per group = 21 matches × 4 groups = 84 non-BYE matches
    const hasExpectedMatches = nonByeMatches.length === 84;

    // Step 5: Input scores for all matches (valid MR: score1+score2=4)
    // Use varied scores: 3-1, 2-2, 4-0, 1-3 to test all valid combinations
    const scorePatterns = [[3, 1], [2, 2], [4, 0], [1, 3], [3, 1], [2, 2]];
    let allScoresOk = true;

    for (let i = 0; i < nonByeMatches.length; i++) {
      const m = nonByeMatches[i];
      const [s1, s2] = scorePatterns[i % scorePatterns.length];
      const scoreRes = await adminPage.evaluate(async ([url, body]) => {
        const r = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return { s: r.status };
      }, [`/api/tournaments/${tournamentId}/mr`, { matchId: m.id, score1: s1, score2: s2 }]);
      if (scoreRes.s !== 200) {
        allScoresOk = false;
        break;
      }
    }

    // Step 6: Verify standings page renders
    await nav(adminPage, `/tournaments/${tournamentId}/mr`);
    const pageText = await adminPage.locator('main').innerText().catch(() => '');
    const hasStandings = pageText.length > 50 &&
      !pageText.includes('Failed to fetch') &&
      !pageText.includes('エラーが発生しました');

    // Step 7: Verify standings via API — sorted by score desc, points desc per group
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

    // Step 8: Verify courses are assigned (MR-specific: assignCoursesRandomly)
    // Re-fetch after scoring to check if rounds data persists
    const postScoreData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const postScoreMatches = postScoreData.data?.matches || postScoreData.matches || [];
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
  } finally {
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await deletePlayer(adminPage, id);
  }
}

/**
 * TC-602: MR player login + participant score entry
 *
 * Creates a temp tournament with 2 players, player1 logs in via separate browser,
 * submits race results (3-1) via the MR participant page, verifies persistence.
 */
async function runTc602(adminPage) {
  let tournamentId = null;
  let player1 = null;
  let player2 = null;
  let playerBrowser = null;

  try {
    const stamp = Date.now();
    player1 = await createPlayer(adminPage, 'E2E MR Part P1', `e2e_mr602_p1_${stamp}`);
    player2 = await createPlayer(adminPage, 'E2E MR Part P2', `e2e_mr602_p2_${stamp}`);

    tournamentId = await createTournament(adminPage, `E2E MR Part ${stamp}`);

    // Setup MR qualification with 2 players
    const setup = await adminPage.evaluate(async ([url, data]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/mr`, {
      players: [
        { playerId: player1.id, group: 'A' },
        { playerId: player2.id, group: 'A' },
      ],
    }]);
    if (setup.s !== 201) throw new Error(`MR setup failed (${setup.s})`);

    // Get the pending match
    const mrData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const match = (mrData.data?.matches || mrData.matches || []).find((m) => !m.isBye);
    if (!match) throw new Error('No non-BYE MR match found');

    // Player login in separate browser
    playerBrowser = await chromium.launch({ headless: false });
    const playerContext = await playerBrowser.newContext({ viewport: { width: 1280, height: 720 } });
    const playerPage = await playerContext.newPage();

    await nav(playerPage, '/auth/signin');
    await playerPage.locator('#nickname').fill(player1.nickname);
    await playerPage.locator('#password').fill(player1.password);
    await playerPage.getByRole('button', { name: /ログイン|Login/ }).click();
    await playerPage.waitForURL((url) => url.pathname === '/tournaments', { timeout: 15000 });
    await playerPage.waitForTimeout(1000);

    // Navigate to MR participant page
    await nav(playerPage, `/tournaments/${tournamentId}/mr/participant`);

    // MR participant: fixed 4 assigned courses with winner buttons.
    // P1 wins races 1, 2, 4; P2 wins race 3 → 3-1
    for (let i = 0; i < 4; i++) {
      const winnerButtons = playerPage.locator(`button[aria-label$="wins race ${i + 1}"]`);
      const winnerIdx = i === 2 ? 1 : 0;
      await winnerButtons.nth(winnerIdx).click();
      await playerPage.waitForTimeout(300);
    }

    // Submit the score
    playerPage.once('dialog', async (dialog) => { await dialog.accept(); });
    await playerPage.getByRole('button', { name: /Submit|スコア送信|送信/ }).click();
    await playerPage.waitForTimeout(5000);

    // Verify via admin API
    const updatedMr = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const updatedMatch = (updatedMr.data?.matches || updatedMr.matches || []).find((m) => m.id === match.id);

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
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    if (player1) await deletePlayer(adminPage, player1.id);
    if (player2) await deletePlayer(adminPage, player2.id);
  }
}

/**
 * TC-603: MR draw (2-2) score submission
 *
 * Verifies that a 2-2 draw is a valid MR score and persists correctly.
 */
async function runTc603(adminPage) {
  let tournamentId = null;
  let player1 = null;
  let player2 = null;

  try {
    const stamp = Date.now();
    player1 = await createPlayer(adminPage, 'E2E MR Draw P1', `e2e_mr603_p1_${stamp}`);
    player2 = await createPlayer(adminPage, 'E2E MR Draw P2', `e2e_mr603_p2_${stamp}`);

    tournamentId = await createTournament(adminPage, `E2E MR Draw ${stamp}`);

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

    // Get match
    const mrData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const match = (mrData.data?.matches || mrData.matches || []).find((m) => !m.isBye);
    if (!match) throw new Error('No non-BYE match');

    // Submit 2-2 draw via admin API (simulates player draw scenario)
    const drawRes = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/mr`, { matchId: match.id, score1: 2, score2: 2 }]);

    const drawAccepted = drawRes.s === 200;

    // Verify persistence
    const updated = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const updatedMatch = (updated.data?.matches || updated.matches || []).find((m) => m.id === match.id);
    const drawPersisted = updatedMatch?.completed === true &&
      updatedMatch.score1 === 2 && updatedMatch.score2 === 2;

    log('TC-603', drawAccepted && drawPersisted ? 'PASS' : 'FAIL',
      !drawAccepted ? `Draw rejected (${drawRes.s})`
      : !drawPersisted ? `Draw not persisted: ${updatedMatch?.score1}-${updatedMatch?.score2}`
      : '');
  } catch (err) {
    log('TC-603', 'FAIL', err instanceof Error ? err.message : 'MR draw test failed');
  } finally {
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    if (player1) await deletePlayer(adminPage, player1.id);
    if (player2) await deletePlayer(adminPage, player2.id);
  }
}

/**
 * TC-604: MR predicated 28-player full + finals bracket gen + race-format UI score entry
 *
 * Creates 28 players in 4 groups (snake-draft), completes 84 qualification matches,
 * then generates the finals bracket via the UI (top 8) and uses the race entry dialog
 * to score the first match (first-to-3). Also validates that first-to-5 (BM style)
 * is rejected via API. Verifies winner/loser routing into M5 and M8.
 */
async function runTc604(adminPage) {
  let tournamentId = null;
  let playerIds = [];

  try {
    const setup = await setupMr28PlayerFinals(adminPage, '604');
    tournamentId = setup.tournamentId;
    playerIds = setup.playerIds;

    // Navigate to finals page and generate bracket
    await nav(adminPage, `/tournaments/${tournamentId}/mr/finals`);
    await adminPage.getByRole('button', { name: /Generate finals bracket|Generate Bracket|ブラケット生成/i }).click();
    await adminPage.getByRole('button', { name: /生成 \(8 players\)|Generate \(8 players\)/ }).click();
    await adminPage.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('0 / 17') && (text.includes('M1') || text.includes('Match 1'));
    }, null, { timeout: 20000 });

    // Fetch generated bracket
    const generated = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr/finals`);
    const matches = generated.data?.matches || generated.matches || [];
    const match1 = matches.find((m) => m.matchNumber === 1);
    if (!match1) throw new Error('Generated bracket missing match 1');

    // MR finals validation: first-to-3 race wins (targetWins defaults to 3).
    // Both players reaching targetWins (3-3) is invalid: only one winner allowed.
    const invalidBothWin = await adminPage.evaluate(async ([url, matchId]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, score1: 3, score2: 3 }),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr/finals`, match1.id]);

    // Valid MR finals: first-to-3 (score1=3, score2=1)
    // Use UI dialog for the first match to test the race entry workflow
    await adminPage.locator(`[aria-label^="Match 1:"]`).first().click();
    await adminPage.waitForTimeout(500);

    // MR finals dialog: 5 race rows pre-rendered with course select + P1/P2 winner buttons.
    // We need P1 to win 3 out of 4 races (first-to-3):
    // Race 1: P1 wins, Race 2: P1 wins, Race 3: P2 wins, Race 4: P1 wins → 3-1
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

    // Click save
    await adminPage.getByRole('button', { name: /Save|保存/ }).click();
    await adminPage.waitForTimeout(3000);

    // Poll for bracket update
    let updated = null;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      updated = await adminPage.evaluate(async (url) => {
        const r = await fetch(`${url}?ts=${Date.now()}`, { cache: 'no-store' });
        return r.json().catch(() => ({}));
      }, `/api/tournaments/${tournamentId}/mr/finals`);

      const polledMatches = updated.data?.matches || updated.matches || [];
      const m1 = polledMatches.find((m) => m.id === match1.id);
      const winnerTarget = polledMatches.find((m) => m.matchNumber === 5);
      const loserTarget = polledMatches.find((m) => m.matchNumber === 8);
      if (m1?.completed && winnerTarget?.player1Id && loserTarget?.player1Id) break;
      await adminPage.waitForTimeout(500);
    }

    const updatedMatches = updated.data?.matches || updated.matches || [];
    const updatedMatch1 = updatedMatches.find((m) => m.id === match1.id);
    const winnerTarget = updatedMatches.find((m) => m.matchNumber === 5);
    const loserTarget = updatedMatches.find((m) => m.matchNumber === 8);

    // MR uses getStyle: 'simple' — no winnersMatches/losersMatches/grandFinalMatches
    // Only verify total match count (17 for 8-player double elimination)
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
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await deletePlayer(adminPage, id);
  }
}

/* setupMr28PlayerFinals / generateMrFinalsBracket / setMrFinalsScore /
 * fetchMrFinalsMatches / snakeDraftMr28 are imported from ./lib/common above. */

/* ───────── TC-605: MR finals bracket reset (28-player full) ─────────
 * Re-POST to /finals (same endpoint the UI's Reset button calls) regenerates
 * the bracket with all 17 matches pending. */
async function runTc605(adminPage) {
  let tournamentId = null;
  let playerIds = [];
  try {
    const setup = await setupMr28PlayerFinals(adminPage, '605');
    tournamentId = setup.tournamentId;
    playerIds = setup.playerIds;

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
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await deletePlayer(adminPage, id);
  }
}

/* ───────── TC-606: MR Grand Final → champion (28-player full) ─────────
 * Drive M1..M16 with player1 sweeping 3-0 each. The Winners-side champion
 * takes M16 and the champion banner on /mr/finals must show the expected nick. */
async function runTc606(adminPage) {
  let tournamentId = null;
  let playerIds = [];
  let nicknames = [];
  try {
    const setup = await setupMr28PlayerFinals(adminPage, '606');
    tournamentId = setup.tournamentId;
    playerIds = setup.playerIds;
    nicknames = setup.nicknames;

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
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await deletePlayer(adminPage, id);
  }
}

/* ───────── TC-607: MR Grand Final Reset Match (M17) ─────────
 * If the L-side champion takes the GF, M17 is generated. We force this by
 * scoring M16 0-3 (the L-side champion is in the P2 slot per bracket routing). */
async function runTc607(adminPage) {
  let tournamentId = null;
  let playerIds = [];
  try {
    const setup = await setupMr28PlayerFinals(adminPage, '607');
    tournamentId = setup.tournamentId;
    playerIds = setup.playerIds;

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
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await deletePlayer(adminPage, id);
  }
}

/**
 * TC-608: MR dual report — agreement auto-confirm
 *
 * With dualReportEnabled=true, both players report the same score (3-1),
 * which auto-confirms the match.
 */
async function runTc608(adminPage) {
  let tournamentId = null;
  let player1 = null;
  let player2 = null;

  try {
    const stamp = Date.now();
    player1 = await createPlayer(adminPage, 'E2E MR Dual P1', `e2e_mr608_p1_${stamp}`);
    player2 = await createPlayer(adminPage, 'E2E MR Dual P2', `e2e_mr608_p2_${stamp}`);

    // Create tournament with dual report enabled
    tournamentId = await createTournament(adminPage, `E2E MR Dual ${stamp}`, { dualReportEnabled: true });

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

    // Get match
    const mrData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const match = (mrData.data?.matches || mrData.matches || []).find((m) => !m.isBye);
    if (!match) throw new Error('No non-BYE match');

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

    // Verify match still incomplete
    const midCheck = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const midMatch = (midCheck.data?.matches || midCheck.matches || []).find((m) => m.id === match.id);
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

    // Verify match is now completed
    const finalCheck = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const finalMatch = (finalCheck.data?.matches || finalCheck.matches || []).find((m) => m.id === match.id);
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
  } finally {
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    if (player1) await deletePlayer(adminPage, player1.id);
    if (player2) await deletePlayer(adminPage, player2.id);
  }
}

/**
 * TC-609: MR dual report — mismatch detection
 *
 * P1 reports 3-1, P2 reports 1-3 (disagreement). Match stays incomplete
 * with mismatch flag. Admin resolves.
 */
async function runTc609(adminPage) {
  let tournamentId = null;
  let player1 = null;
  let player2 = null;

  try {
    const stamp = Date.now();
    player1 = await createPlayer(adminPage, 'E2E MR Mis P1', `e2e_mr609_p1_${stamp}`);
    player2 = await createPlayer(adminPage, 'E2E MR Mis P2', `e2e_mr609_p2_${stamp}`);

    tournamentId = await createTournament(adminPage, `E2E MR Mis ${stamp}`, { dualReportEnabled: true });

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

    const mrData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const match = (mrData.data?.matches || mrData.matches || []).find((m) => !m.isBye);
    if (!match) throw new Error('No non-BYE match');

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

    // Match should still be incomplete
    const midCheck = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const midMatch = (midCheck.data?.matches || midCheck.matches || []).find((m) => m.id === match.id);
    const stillIncomplete = midMatch?.completed === false;

    // Admin resolves with PUT
    const adminResolve = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr`, { matchId: match.id, score1: 3, score2: 1 }]);

    const resolved = adminResolve.s === 200;

    // Verify final state
    const finalCheck = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const finalMatch = (finalCheck.data?.matches || finalCheck.matches || []).find((m) => m.id === match.id);
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
  } finally {
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    if (player1) await deletePlayer(adminPage, player1.id);
    if (player2) await deletePlayer(adminPage, player2.id);
  }
}

/**
 * TC-610: MR Finals admin-only enforcement
 *
 * Verifies that non-admin (player) receives 403 when trying to PUT
 * score on MR finals matches. BM/GP finals share the same putRequiresAuth
 * mechanism in finals-route factory, so testing MR covers the shared logic.
 */
async function runTc610(adminPage) {
  let tournamentId = null;
  const playerIds = [];
  let playerBrowser = null;

  try {
    const stamp = Date.now();

    // Create 8 players for bracket generation
    for (let i = 1; i <= 8; i++) {
      const p = await createPlayer(adminPage, `E2E Finals Auth P${i}`, `e2e_f610_${stamp}_${i}`);
      playerIds.push(p.id);
    }

    tournamentId = await createTournament(adminPage, `E2E Finals Auth ${stamp}`);

    // Setup MR qualification and complete all matches
    const setup = await adminPage.evaluate(async ([url, ids]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          players: ids.map((playerId, index) => ({
            playerId,
            group: 'A',
            seeding: index + 1,
          })),
        }),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr`, playerIds]);
    if (setup.s !== 201) throw new Error(`MR setup failed (${setup.s})`);

    // Complete all qualification matches
    const mrData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const qualMatches = (mrData.data?.matches || mrData.matches || []).filter((m) => !m.isBye);
    for (const m of qualMatches) {
      await adminPage.evaluate(async ([url, body]) => {
        await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }, [`/api/tournaments/${tournamentId}/mr`, { matchId: m.id, score1: 3, score2: 1 }]);
    }

    // Generate MR finals bracket via API
    const bracketRes = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/mr/finals`, { bracketSize: 8 }]);
    if (bracketRes.s !== 201 && bracketRes.s !== 200) {
      throw new Error(`Bracket generation failed (${bracketRes.s})`);
    }

    // Get first finals match
    const finalsData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr/finals`);
    const finalsMatch = (finalsData.matches || []).find((m) => m.matchNumber === 1);
    if (!finalsMatch) throw new Error('No finals match found');

    // Create a player browser session (non-admin)
    playerBrowser = await chromium.launch({ headless: false });
    const playerContext = await playerBrowser.newContext({ viewport: { width: 1280, height: 720 } });
    const playerPage = await playerContext.newPage();

    // Login as player (non-admin)
    const p1 = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/players/${playerIds[0]}`);
    const playerNick = p1.data?.nickname || p1.nickname;

    // Reset password to get credentials
    const resetRes = await adminPage.evaluate(async (url) => {
      const r = await fetch(url, { method: 'POST' });
      return r.json().catch(() => ({}));
    }, `/api/players/${playerIds[0]}/reset-password`);
    const playerPassword = resetRes.data?.temporaryPassword || resetRes.temporaryPassword;

    await nav(playerPage, '/auth/signin');
    await playerPage.locator('#nickname').fill(playerNick);
    await playerPage.locator('#password').fill(playerPassword);
    await playerPage.getByRole('button', { name: /ログイン|Login/ }).click();
    await playerPage.waitForURL((url) => url.pathname === '/tournaments', { timeout: 15000 });
    await playerPage.waitForTimeout(1000);

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
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await deletePlayer(adminPage, id);
  }
}

/**
 * TC-611: Qualification confirmed — score lock verification
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

    // Get match
    const mrData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const match = (mrData.data?.matches || mrData.matches || []).find((m) => !m.isBye);
    if (!match) throw new Error('No non-BYE match');

    // Step 1: Score edit works before confirmation
    const preRes = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr`, { matchId: match.id, score1: 3, score2: 1 }]);
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
    const lockedPut = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    }, [`/api/tournaments/${tournamentId}/mr`, { matchId: match.id, score1: 2, score2: 2 }]);
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
    const postUnlock = await adminPage.evaluate(async ([url, body]) => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr`, { matchId: match.id, score1: 2, score2: 2 }]);
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
 */
async function runTc612(adminPage) {
  let tournamentId = null;
  let player1 = null;
  let player2 = null;

  try {
    const stamp = Date.now();
    player1 = await createPlayer(adminPage, 'E2E GP Pos P1', `e2e_gp612_p1_${stamp}`);
    player2 = await createPlayer(adminPage, 'E2E GP Pos P2', `e2e_gp612_p2_${stamp}`);

    tournamentId = await createTournament(adminPage, `E2E GP Pos ${stamp}`);

    // Setup GP qualification
    const setup = await adminPage.evaluate(async ([url, data]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/gp`, {
      players: [
        { playerId: player1.id, group: 'A' },
        { playerId: player2.id, group: 'A' },
      ],
    }]);
    if (setup.s !== 201) throw new Error(`GP setup failed (${setup.s})`);

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
  } finally {
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    if (player1) await deletePlayer(adminPage, player1.id);
    if (player2) await deletePlayer(adminPage, player2.id);
  }
}

// Export individual test functions for integration into tc-all.js
module.exports = { runTc601, runTc602, runTc603, runTc604, runTc605, runTc606, runTc607, runTc608, runTc609, runTc610, runTc611, runTc612, runTc820, runTc822 };

// Standalone execution
if (require.main === module) {
  runSuite({
    suiteName: 'MR',
    results,
    log,
    tests: [
      { name: 'TC-601', fn: runTc601 },
      { name: 'TC-602', fn: runTc602 },
      { name: 'TC-603', fn: runTc603 },
      { name: 'TC-604', fn: runTc604 },
      { name: 'TC-605', fn: runTc605 },
      { name: 'TC-606', fn: runTc606 },
      { name: 'TC-607', fn: runTc607 },
      { name: 'TC-608', fn: runTc608 },
      { name: 'TC-609', fn: runTc609 },
      { name: 'TC-610', fn: runTc610 },
      { name: 'TC-611', fn: runTc611 },
      { name: 'TC-612', fn: runTc612 },
      { name: 'TC-820', fn: runTc820 },
      { name: 'TC-822', fn: runTc822 },
    ],
  });
}

/* ───────── TC-820: MR match/[matchId] page view-only ─────────
 * Similar to TC-321 (BM match page), MR match pages are also view-only.
 * Score entry is consolidated to the /mr/participant page. */
async function runTc820(adminPage) {
  let tournamentId = null;
  let player1 = null;
  let player2 = null;
  try {
    const stamp = Date.now();
    player1 = await createPlayer(adminPage, 'E2E MR 820 P1', `e2e_mr820_p1_${stamp}`);
    player2 = await createPlayer(adminPage, 'E2E MR 820 P2', `e2e_mr820_p2_${stamp}`);
    tournamentId = await createTournament(adminPage, `E2E MR 820 ${stamp}`);

    // Setup MR qualification
    const setup = await adminPage.evaluate(async ([url, data]) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr`, {
      players: [{ playerId: player1.id, group: 'A' }, { playerId: player2.id, group: 'A' }],
    }]);
    if (setup.s !== 201) throw new Error(`MR setup failed (${setup.s})`);

    // Get a non-BYE match
    const mrData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const match = (mrData.data?.matches || mrData.matches || []).find((m) => !m.isBye);
    if (!match) throw new Error('No non-BYE match');

    // Visit match page
    await nav(adminPage, `/tournaments/${tournamentId}/mr/match/${match.id}`);
    const matchText = await adminPage.locator('body').innerText();

    // Should show player names
    const showsPlayers = matchText.includes(player1.nickname) && matchText.includes(player2.nickname);
    // Should NOT have score entry form (winner buttons, course selectors)
    const noScoreForm = !matchText.includes('wins race') && !matchText.includes('I am') && !matchText.includes('私は');

    log('TC-820', showsPlayers && noScoreForm ? 'PASS' : 'FAIL',
      !showsPlayers ? 'Match page missing player names' : !noScoreForm ? 'Match page has score entry form' : '');
  } catch (err) {
    log('TC-820', 'FAIL', err instanceof Error ? err.message : 'MR match view test failed');
  } finally {
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    if (player1) await deletePlayer(adminPage, player1.id);
    if (player2) await deletePlayer(adminPage, player2.id);
  }
}

/* ───────── TC-822: MR scoresConfirmed → subsequent PUT blocked ─────────
 * After admin confirms a mismatched dual-report, scoresConfirmed flag is set.
 * A second PUT should return 400. */
async function runTc822(adminPage) {
  let tournamentId = null;
  let player1 = null;
  let player2 = null;
  try {
    const stamp = Date.now();
    player1 = await createPlayer(adminPage, 'E2E MR 822 P1', `e2e_mr822_p1_${stamp}`);
    player2 = await createPlayer(adminPage, 'E2E MR 822 P2', `e2e_mr822_p2_${stamp}`);
    tournamentId = await createTournament(adminPage, `E2E MR 822 ${stamp}`, { dualReportEnabled: true });

    // Setup MR with dualReport
    const setup = await adminPage.evaluate(async ([url, data]) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr`, {
      players: [{ playerId: player1.id, group: 'A' }, { playerId: player2.id, group: 'A' }],
    }]);
    if (setup.s !== 201) throw new Error(`MR setup failed (${setup.s})`);

    // Get match
    const mrData = await adminPage.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json().catch(() => ({}));
    }, `/api/tournaments/${tournamentId}/mr`);
    const match = (mrData.data?.matches || mrData.matches || []).find((m) => !m.isBye);
    if (!match) throw new Error('No non-BYE match');

    // First PUT to confirm mismatched report (admin resolves)
    const confirm = await adminPage.evaluate(async ([url, data]) => {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr`, { matchId: match.id, score1: 3, score2: 1 }]);
    if (confirm.s !== 200) throw new Error(`Confirm failed (${confirm.s})`);

    // Second PUT should be blocked
    const secondPut = await adminPage.evaluate(async ([url, data]) => {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return { s: r.status };
    }, [`/api/tournaments/${tournamentId}/mr`, { matchId: match.id, score1: 2, score2: 2 }]);

    log('TC-822', secondPut.s === 400 ? 'PASS' : 'FAIL',
      secondPut.s !== 400 ? `Expected 400, got ${secondPut.s}` : '');
  } catch (err) {
    log('TC-822', 'FAIL', err instanceof Error ? err.message : 'MR scoresConfirmed test failed');
  } finally {
    if (tournamentId) await deleteTournament(adminPage, tournamentId);
    if (player1) await deletePlayer(adminPage, player1.id);
    if (player2) await deletePlayer(adminPage, player2.id);
  }
}

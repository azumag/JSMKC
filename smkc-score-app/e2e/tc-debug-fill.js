/**
 * E2E Debug-fill tests.
 *
 * Coverage:
 *   TC-DBG-01  Debug tournament can auto-fill BM/MR/GP/TA qualification scores.
 *   TC-DBG-02  Normal tournament rejects debug-fill and hides the admin button.
 *   TC-DBG-03  Existing BM scores are skipped and preserved.
 *   TC-DBG-04  Confirmed BM qualification locks debug-fill.
 *
 * Run: node e2e/tc-debug-fill.js  (from smkc-score-app/)  or: npm run e2e:debug-fill
 */
const {
  makeResults,
  makeLog,
  nav,
  apiCreatePlayer,
  apiCreateTournament,
  apiJson,
  apiDeletePlayer,
  apiDeleteTournament,
  apiSetupBmGroup,
  apiSetupMrGroup,
  apiSetupGpGroup,
  apiAddTaEntries,
  apiPutBmQualScore,
  apiFetchBm,
  apiFetchMr,
  apiFetchGp,
  apiFetchTa,
  apiUpdateTournament,
  launchPersistentChromiumContext,
  resolveE2EProfileDir,
  BASE,
} = require('./lib/common');
const { closeBrowser, envMs, exitAfterCleanup } = require('./lib/runner');

const results = makeResults();
const log = makeLog(results);

function playerAssignments(players) {
  return players.map((player, index) => ({
    playerId: player.id,
    group: index < players.length / 2 ? 'A' : 'B',
    seeding: index + 1,
  }));
}

async function createPlayers(page, prefix, count) {
  const stamp = Date.now();
  const players = [];
  for (let index = 1; index <= count; index++) {
    const nickname = `${prefix.toLowerCase()}_${stamp}_${index}`;
    const player = await apiCreatePlayer(page, `${prefix} Player ${index}`, nickname);
    players.push({
      ...player,
      name: `${prefix} Player ${index}`,
    });
  }
  return players;
}

async function setupAllModes(page, tournamentId, players) {
  const assignments = playerAssignments(players);
  const [bm, mr, gp, ta] = await Promise.all([
    apiSetupBmGroup(page, tournamentId, assignments),
    apiSetupMrGroup(page, tournamentId, assignments),
    apiSetupGpGroup(page, tournamentId, assignments),
    apiAddTaEntries(page, tournamentId, {
      playerEntries: players.map((player, index) => ({
        playerId: player.id,
        seeding: index + 1,
      })),
    }),
  ]);
  const failed = [
    ['bm', bm],
    ['mr', mr],
    ['gp', gp],
    ['ta', ta],
  ].filter(([, response]) => response.s !== 201);
  if (failed.length > 0) {
    throw new Error(`mode setup failed: ${failed.map(([mode, response]) => `${mode}=${response.s}`).join(' ')}`);
  }
}

async function runDebugFill(page, tournamentId, mode) {
  return apiJson(page, `/api/tournaments/${tournamentId}/${mode}/debug-fill`, { method: 'POST' });
}

function unwrapData(json) {
  return json?.data ?? json;
}

function allTwoPlayerMatchesAreFilled(matches) {
  const realMatches = (matches || []).filter((match) => !match.isBye);
  return realMatches.length > 0 && realMatches.every((match) =>
    match.completed === true &&
    typeof match.score1 === 'number' &&
    typeof match.score2 === 'number' &&
    match.score1 + match.score2 === 4
  );
}

function gpMatchesAreFilled(matches) {
  const realMatches = (matches || []).filter((match) => !match.isBye);
  return realMatches.length > 0 && realMatches.every((match) =>
    match.completed === true &&
    Array.isArray(match.races) &&
    match.races.length === 5 &&
    match.races.every((race) => race.position1 !== race.position2)
  );
}

function taEntriesAreFilled(entries) {
  return (entries || []).length > 0 && entries.every((entry) =>
    entry.times && Object.keys(entry.times).length === 20
  );
}

function taEntriesFromFetch(response) {
  return unwrapData(response?.b)?.entries ?? response?.entries ?? [];
}

function countDebugFillFailures(testResults) {
  return testResults.filter((result) => result.s === 'FAIL').length;
}

async function tcDbg01(page) {
  let tournamentId = null;
  const players = [];
  try {
    players.push(...await createPlayers(page, 'TCDBG01', 8));
    tournamentId = await apiCreateTournament(page, `E2E TC-DBG-01 ${Date.now()}`, { debugMode: true });
    await setupAllModes(page, tournamentId, players);

    const fills = {};
    for (const mode of ['bm', 'mr', 'gp', 'ta']) {
      fills[mode] = await runDebugFill(page, tournamentId, mode);
    }

    const bm = await apiFetchBm(page, tournamentId);
    const mr = await apiFetchMr(page, tournamentId);
    const gp = await apiFetchGp(page, tournamentId);
    const ta = await apiFetchTa(page, tournamentId);

    const responsesOk = Object.values(fills).every((response) =>
      response.status === 200 &&
      unwrapData(response.body)?.filled > 0 &&
      unwrapData(response.body)?.skipped === 0
    );
    const ok = (
      responsesOk &&
      allTwoPlayerMatchesAreFilled(bm.matches) &&
      allTwoPlayerMatchesAreFilled(mr.matches) &&
      gpMatchesAreFilled(gp.matches) &&
      taEntriesAreFilled(taEntriesFromFetch(ta))
    );

    log('TC-DBG-01', ok ? 'PASS' : 'FAIL',
      `fills=${Object.entries(fills).map(([mode, response]) => `${mode}:${response.status}/${unwrapData(response.body)?.filled ?? 'n/a'}`).join(' ')}`);
  } catch (error) {
    log('TC-DBG-01', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await apiDeleteTournament(page, tournamentId);
    for (const player of players) await apiDeletePlayer(page, player.id);
  }
}

async function tcDbg02(page) {
  let tournamentId = null;
  const players = [];
  try {
    players.push(...await createPlayers(page, 'TCDBG02', 4));
    tournamentId = await apiCreateTournament(page, `E2E TC-DBG-02 ${Date.now()}`, { debugMode: false });
    await apiSetupBmGroup(page, tournamentId, playerAssignments(players));

    const fill = await runDebugFill(page, tournamentId, 'bm');
    const bm = await apiFetchBm(page, tournamentId);
    await nav(page, `/tournaments/${tournamentId}/bm`);
    const buttonVisible = await page.getByRole('button', {
      name: /予選スコア自動入力|Auto-fill qualification scores/,
    }).count();

    const code = fill.body?.code;
    const scoresUntouched = (bm.matches || []).filter((match) => !match.isBye).every((match) =>
      (match.score1 ?? 0) === 0 &&
      (match.score2 ?? 0) === 0 &&
      match.completed !== true
    );

    log('TC-DBG-02',
      fill.status === 403 && code === 'DEBUG_MODE_DISABLED' && scoresUntouched && buttonVisible === 0 ? 'PASS' : 'FAIL',
      `status=${fill.status} code=${code} scoresUntouched=${scoresUntouched} buttonVisible=${buttonVisible}`,
    );
  } catch (error) {
    log('TC-DBG-02', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await apiDeleteTournament(page, tournamentId);
    for (const player of players) await apiDeletePlayer(page, player.id);
  }
}

async function tcDbg03(page) {
  let tournamentId = null;
  const players = [];
  try {
    players.push(...await createPlayers(page, 'TCDBG03', 4));
    tournamentId = await apiCreateTournament(page, `E2E TC-DBG-03 ${Date.now()}`, { debugMode: true });
    await apiSetupBmGroup(page, tournamentId, playerAssignments(players));

    const before = await apiFetchBm(page, tournamentId);
    const manualMatch = (before.matches || []).find((match) => !match.isBye);
    if (!manualMatch) throw new Error('No BM match available for preserve check');
    const manual = await apiPutBmQualScore(page, tournamentId, manualMatch.id, 4, 0);
    if (manual.s !== 200) throw new Error(`manual score failed (${manual.s})`);

    const fill = await runDebugFill(page, tournamentId, 'bm');
    const after = await apiFetchBm(page, tournamentId);
    const preserved = (after.matches || []).find((match) => match.id === manualMatch.id);
    const data = unwrapData(fill.body);
    const ok = (
      fill.status === 200 &&
      data.filled > 0 &&
      data.skipped >= 1 &&
      preserved?.score1 === 4 &&
      preserved?.score2 === 0 &&
      preserved?.completed === true
    );

    log('TC-DBG-03', ok ? 'PASS' : 'FAIL',
      `status=${fill.status} filled=${data?.filled} skipped=${data?.skipped} preserved=${preserved?.score1}-${preserved?.score2}`);
  } catch (error) {
    log('TC-DBG-03', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await apiDeleteTournament(page, tournamentId);
    for (const player of players) await apiDeletePlayer(page, player.id);
  }
}

async function tcDbg04(page) {
  let tournamentId = null;
  const players = [];
  try {
    players.push(...await createPlayers(page, 'TCDBG04', 4));
    tournamentId = await apiCreateTournament(page, `E2E TC-DBG-04 ${Date.now()}`, { debugMode: true });
    await apiSetupBmGroup(page, tournamentId, playerAssignments(players));
    await apiUpdateTournament(page, tournamentId, { bmQualificationConfirmed: true });

    const fill = await runDebugFill(page, tournamentId, 'bm');
    const bm = await apiFetchBm(page, tournamentId);
    const scoresUntouched = (bm.matches || []).filter((match) => !match.isBye).every((match) =>
      (match.score1 ?? 0) === 0 &&
      (match.score2 ?? 0) === 0 &&
      match.completed !== true
    );

    log('TC-DBG-04',
      fill.status === 409 && fill.body?.code === 'QUALIFICATION_LOCKED' && scoresUntouched ? 'PASS' : 'FAIL',
      `status=${fill.status} code=${fill.body?.code} scoresUntouched=${scoresUntouched}`,
    );
  } catch (error) {
    log('TC-DBG-04', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await apiDeleteTournament(page, tournamentId);
    for (const player of players) await apiDeletePlayer(page, player.id);
  }
}

async function runDebugFillTests(page) {
  await tcDbg01(page);
  await tcDbg02(page);
  await tcDbg03(page);
  await tcDbg04(page);

  const failedCount = countDebugFillFailures(results);
  console.log(`\nTC-DBG summary: ${results.length - failedCount}/${results.length} passed`);
  return { failed: failedCount };
}

async function main() {
  let browser = null;
  const suiteTimeoutMs = envMs('E2E_DEBUG_FILL_TIMEOUT_MS', envMs('E2E_SUITE_TIMEOUT_MS', 20 * 60 * 1000));
  const suiteTimer = setTimeout(() => {
    console.error(`[tc-debug-fill] suite timed out after ${suiteTimeoutMs}ms`);
    exitAfterCleanup(124, () => closeBrowser(browser));
  }, suiteTimeoutMs);

  try {
    browser = await launchPersistentChromiumContext(resolveE2EProfileDir(), {
      headless: process.env.E2E_HEADLESS === '1',
      viewport: { width: 1280, height: 720 },
    });
    const page = browser.pages()[0] || await browser.newPage();
    page.setDefaultTimeout(envMs('E2E_ACTION_TIMEOUT_MS', 30 * 1000));
    page.setDefaultNavigationTimeout(envMs('E2E_NAV_TIMEOUT_MS', 30 * 1000));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

    const { failed } = await runDebugFillTests(page);
    process.exitCode = failed ? 1 : 0;
  } finally {
    clearTimeout(suiteTimer);
    await closeBrowser(browser);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
}

module.exports = {
  runDebugFillTests,
  countDebugFillFailures,
  taEntriesFromFetch,
};

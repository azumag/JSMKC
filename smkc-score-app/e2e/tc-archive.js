/**
 * E2E Tournament archive tests.
 *
 * Coverage:
 *   TC-ARC-01  Missing archive returns 404.
 *   TC-ARC-02  Archive regeneration rejects non-completed tournaments.
 *   TC-ARC-03  Completed public tournament archive can be regenerated and read.
 *   TC-ARC-04  Completed private archive is not publicly readable.
 *   TC-ARC-06  Archive BM match rows keep stage and public player payloads.
 *   TC-ARC-07  TA API falls back to archive when live tournament row is gone.
 *   TC-ARC-08  Two completed archives stay independently readable.
 *   TC-ARC-09  Qualification pages keep mode data and players fetches parallel.
 *
 * Run: node e2e/tc-archive.js  (from smkc-score-app/)  or: npm run e2e:archive
 */
const {
  makeResults,
  makeLog,
  apiCreatePlayer,
  apiCreateTournament,
  apiJson,
  apiDeletePlayer,
  apiDeleteTournament,
  apiSetupBmGroup,
  apiPutAllBmQualScores,
  apiUpdateTournament,
  launchPersistentChromiumContext,
  resolveE2EProfileDir,
  BASE,
} = require('./lib/common');
const { closeBrowser, envMs, exitAfterCleanup } = require('./lib/runner');

const results = makeResults();
const log = makeLog(results);
const QUALIFICATION_MODES = ['ta', 'bm', 'mr', 'gp'];
const QUALIFICATION_FETCH_TIMEOUT_MS = 15_000;

async function createPlayers(page, prefix, count) {
  const stamp = Date.now();
  const players = [];
  for (let index = 1; index <= count; index++) {
    const nickname = `${prefix.toLowerCase()}_${stamp}_${index}`;
    const player = await apiCreatePlayer(page, `${prefix} Player ${index}`, nickname);
    players.push({ ...player, name: `${prefix} Player ${index}` });
  }
  return players;
}

function bmAssignments(players) {
  return players.map((player, index) => ({
    playerId: player.id,
    group: 'A',
    seeding: index + 1,
  }));
}

async function createCompletedPublicBmArchive(page, prefix, caseName) {
  const players = [];
  let tournamentId = null;
  try {
    players.push(...await createPlayers(page, prefix, 4));
    tournamentId = await apiCreateTournament(page, `E2E ${caseName} ${Date.now()}`);
    const setup = await apiSetupBmGroup(page, tournamentId, bmAssignments(players));
    if (setup.s !== 201) throw new Error(`BM setup failed (${setup.s})`);
    await apiPutAllBmQualScores(page, tournamentId, { score1: 3, score2: 1, randomize: false });

    const completed = await apiUpdateTournament(page, tournamentId, {
      status: 'completed',
      publicModes: ['bm', 'overall'],
      bmQualificationConfirmed: true,
    });
    if (completed.s !== 200) throw new Error(`completion update failed (${completed.s})`);

    const post = await apiJson(page, `/api/tournaments/${tournamentId}/archive`, { method: 'POST' });
    const get = await apiJson(page, `/api/tournaments/${tournamentId}/archive`);
    return { tournamentId, players, post, get, archive: get.body?.data };
  } catch (error) {
    await cleanupArchiveFixture(page, { tournamentId, players });
    throw error;
  }
}

async function cleanupArchiveFixture(page, fixture) {
  const deletions = [
    { label: `tournament ${fixture?.tournamentId ?? ''}`, promise: apiDeleteTournament(page, fixture?.tournamentId) },
    ...(fixture?.players ?? []).map((player) => ({
      label: `player ${player.id}`,
      promise: apiDeletePlayer(page, player.id),
    })),
  ];
  const results = await Promise.allSettled(deletions.map((deletion) => deletion.promise));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(`[tc-archive] cleanup failed for ${deletions[index].label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  });
}

async function tcArc01(page) {
  const stamp = Date.now();
  try {
    const response = await apiJson(page, `/api/tournaments/missing-archive-${stamp}/archive`);
    log('TC-ARC-01',
      response.status === 404 && response.body?.code === 'NOT_FOUND' ? 'PASS' : 'FAIL',
      `status=${response.status} code=${response.body?.code}`,
    );
  } catch (error) {
    log('TC-ARC-01', 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

async function tcArc02(page) {
  let tournamentId = null;
  try {
    tournamentId = await apiCreateTournament(page, `E2E TC-ARC-02 ${Date.now()}`);
    const response = await apiJson(page, `/api/tournaments/${tournamentId}/archive`, { method: 'POST' });
    log('TC-ARC-02',
      response.status === 409 && response.body?.code === 'CONFLICT' ? 'PASS' : 'FAIL',
      `status=${response.status} code=${response.body?.code}`,
    );
  } catch (error) {
    log('TC-ARC-02', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await apiDeleteTournament(page, tournamentId);
  }
}

async function tcArc03(page) {
  let fixture = null;
  try {
    fixture = await createCompletedPublicBmArchive(page, 'TCARC03', 'TC-ARC-03');
    const { tournamentId, post, get, archive } = fixture;
    const ok = (
      post.status === 200 &&
      get.status === 200 &&
      archive?.archived === true &&
      archive?.tournament?.id === tournamentId &&
      Array.isArray(archive?.tournament?.publicModes) &&
      archive.tournament.publicModes.includes('bm') &&
      Array.isArray(archive?.modes?.bm?.matches) &&
      Array.isArray(archive?.overallRanking?.rankings)
    );

    log('TC-ARC-03', ok ? 'PASS' : 'FAIL',
      `post=${post.status} get=${get.status} publicModes=${archive?.tournament?.publicModes?.join(',') || ''}`);
  } catch (error) {
    log('TC-ARC-03', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await cleanupArchiveFixture(page, fixture);
  }
}

async function tcArc06(page) {
  let fixture = null;
  try {
    fixture = await createCompletedPublicBmArchive(page, 'TCARC06', 'TC-ARC-06');
    const archivedMatch = fixture.archive?.modes?.bm?.matches?.[0];
    const typedMatchOk = (
      fixture.get.status === 200 &&
      archivedMatch?.stage === 'qualification' &&
      archivedMatch?.score1 === 3 &&
      archivedMatch?.score2 === 1 &&
      typeof archivedMatch?.player1?.id === 'string' &&
      typeof archivedMatch?.player2?.id === 'string' &&
      typeof archivedMatch?.player1?.name === 'string' &&
      typeof archivedMatch?.player2?.nickname === 'string'
    );
    log('TC-ARC-06', typedMatchOk ? 'PASS' : 'FAIL',
      `stage=${archivedMatch?.stage || ''} score=${archivedMatch?.score1}-${archivedMatch?.score2} p1=${archivedMatch?.player1?.id || ''} p2=${archivedMatch?.player2?.id || ''}`);
  } catch (error) {
    log('TC-ARC-06', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await cleanupArchiveFixture(page, fixture);
  }
}

async function tcArc08(page) {
  let firstFixture = null;
  let secondFixture = null;
  try {
    firstFixture = await createCompletedPublicBmArchive(page, 'TCARC08A', 'TC-ARC-08A');
    secondFixture = await createCompletedPublicBmArchive(page, 'TCARC08B', 'TC-ARC-08B');

    const first = await apiJson(page, `/api/tournaments/${firstFixture.tournamentId}/archive`);
    const second = await apiJson(page, `/api/tournaments/${secondFixture.tournamentId}/archive`);
    const firstId = first.body?.data?.tournament?.id;
    const secondId = second.body?.data?.tournament?.id;
    const ok = (
      first.status === 200 &&
      second.status === 200 &&
      first.body?.data?.archived === true &&
      second.body?.data?.archived === true &&
      firstId === firstFixture.tournamentId &&
      secondId === secondFixture.tournamentId &&
      firstId !== secondId
    );

    log('TC-ARC-08', ok ? 'PASS' : 'FAIL',
      `first=${first.status}:${firstId || ''} second=${second.status}:${secondId || ''}`);
  } catch (error) {
    log('TC-ARC-08', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await cleanupArchiveFixture(page, firstFixture);
    await cleanupArchiveFixture(page, secondFixture);
  }
}

async function tcArc07(page) {
  let tournamentId = null;
  let tournamentDeleted = false;
  try {
    tournamentId = await apiCreateTournament(page, `E2E TC-ARC-07 ${Date.now()}`);
    const completed = await apiUpdateTournament(page, tournamentId, {
      status: 'completed',
      publicModes: ['ta'],
    });
    if (completed.s !== 200) throw new Error(`completion update failed (${completed.s})`);

    const post = await apiJson(page, `/api/tournaments/${tournamentId}/archive`, { method: 'POST' });
    await apiDeleteTournament(page, tournamentId);
    tournamentDeleted = true;
    const response = await apiJson(page, `/api/tournaments/${tournamentId}/ta`);

    const ok = (
      post.status === 200 &&
      response.status === 200 &&
      response.body?.data?.archived === true &&
      Array.isArray(response.body?.data?.entries) &&
      Array.isArray(response.body?.data?.courses) &&
      Array.isArray(response.body?.data?.allPlayers)
    );
    log('TC-ARC-07', ok ? 'PASS' : 'FAIL',
      `post=${post.status} get=${response.status} archived=${response.body?.data?.archived}`);
  } catch (error) {
    log('TC-ARC-07', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    if (!tournamentDeleted) {
      await apiDeleteTournament(page, tournamentId);
    }
  }
}

async function tcArc04(page) {
  let tournamentId = null;
  try {
    tournamentId = await apiCreateTournament(page, `E2E TC-ARC-04 ${Date.now()}`);
    const completed = await apiUpdateTournament(page, tournamentId, {
      status: 'completed',
      publicModes: [],
    });
    if (completed.s !== 200) throw new Error(`completion update failed (${completed.s})`);

    const post = await apiJson(page, `/api/tournaments/${tournamentId}/archive`, { method: 'POST' });
    const response = await apiJson(page, `/api/tournaments/${tournamentId}/archive`);
    log('TC-ARC-04',
      post.status === 200 && response.status === 403 && response.body?.code === 'FORBIDDEN' ? 'PASS' : 'FAIL',
      `post=${post.status} get=${response.status} code=${response.body?.code}`,
    );
  } catch (error) {
    log('TC-ARC-04', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await apiDeleteTournament(page, tournamentId);
  }
}

function qualificationModePayload(mode) {
  const base = {
    allPlayers: [],
    qualificationConfirmed: false,
  };
  if (mode === 'ta') {
    return { ...base, entries: [] };
  }
  return { ...base, qualifications: [], matches: [] };
}

function requestKindForQualificationFetch(url, tournamentId, mode) {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === `/api/tournaments/${tournamentId}/${mode}`) {
      return 'mode';
    }
    if (parsed.pathname === '/api/players' && parsed.searchParams.get('limit') === '100') {
      return 'players';
    }
  } catch {
    return null;
  }
  return null;
}

async function assertQualificationFetchesStartInParallel(page, tournamentId, mode) {
  const starts = {};
  const pending = {};
  let released = false;
  let releasePromise = null;
  let timeout = null;

  const payloads = {
    mode: { data: qualificationModePayload(mode) },
    players: { data: [] },
  };

  const releasePending = () => {
    if (released) return releasePromise;
    if (!pending.mode || !pending.players) return null;
    released = true;
    if (timeout) clearTimeout(timeout);
    releasePromise = Promise.all(Object.entries(pending).map(([kind, item]) =>
      item.route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payloads[kind]),
      }).finally(item.done),
    )).catch((error) => {
      console.error('TC-ARC-09 releasePending error:', error);
    });
    return releasePromise;
  };

  const routeHandler = (route) => {
    const kind = requestKindForQualificationFetch(route.request().url(), tournamentId, mode);
    if (!kind) {
      return route.continue();
    }
    if (released) {
      return route.continue();
    }
    if (pending[kind]) {
      return route.continue();
    }
    starts[kind] = starts[kind] ?? Date.now();
    return new Promise((done) => {
      pending[kind] = { route, done };
      releasePending();
    });
  };

  await page.route('**/api/**', routeHandler);
  try {
    timeout = setTimeout(() => {
      if (released) return;
      released = true;
      releasePromise = Promise.all(Object.values(pending).map((item) =>
        item.route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'TC-ARC-09 timed out waiting for paired request' }),
        }).finally(item.done),
      )).catch((error) => {
        console.error('TC-ARC-09 timeout fulfill error:', error);
      });
    }, QUALIFICATION_FETCH_TIMEOUT_MS);

    const modeRequest = page.waitForRequest(
      (request) => requestKindForQualificationFetch(request.url(), tournamentId, mode) === 'mode',
      { timeout: QUALIFICATION_FETCH_TIMEOUT_MS },
    );
    const playersRequest = page.waitForRequest(
      (request) => requestKindForQualificationFetch(request.url(), tournamentId, mode) === 'players',
      { timeout: QUALIFICATION_FETCH_TIMEOUT_MS },
    );

    await page.goto(`${BASE}/tournaments/${tournamentId}/${mode}`, { waitUntil: 'domcontentloaded' });
    await Promise.all([modeRequest, playersRequest]);
    await releasePending();

    if (!starts.mode || !starts.players) {
      throw new Error(`${mode}: missing mode or players request`);
    }
    const deltaMs = Math.abs(starts.mode - starts.players);
    if (deltaMs > 1_000) {
      throw new Error(`${mode}: request start delta ${deltaMs}ms exceeded 1000ms`);
    }
    return deltaMs;
  } finally {
    if (timeout) clearTimeout(timeout);
    await page.unroute('**/api/**', routeHandler).catch(() => {});
  }
}

async function tcArc09(page) {
  let tournamentId = null;
  try {
    tournamentId = await apiCreateTournament(page, `E2E TC-ARC-09 ${Date.now()}`);
    const activated = await apiUpdateTournament(page, tournamentId, {
      status: 'active',
      publicModes: QUALIFICATION_MODES,
    });
    if (activated.s !== 200) throw new Error(`activation update failed (${activated.s})`);

    const deltas = {};
    for (const mode of QUALIFICATION_MODES) {
      deltas[mode] = await assertQualificationFetchesStartInParallel(page, tournamentId, mode);
    }

    log('TC-ARC-09', 'PASS',
      `TA/BM/MR/GP requested mode data and /api/players?limit=100 before either response resolved (${Object.entries(deltas).map(([mode, ms]) => `${mode}:${ms}ms`).join(' ')})`);
  } catch (error) {
    log('TC-ARC-09', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await apiDeleteTournament(page, tournamentId);
  }
}

async function runArchiveTests(page) {
  await tcArc01(page);
  await tcArc02(page);
  await tcArc03(page);
  await tcArc04(page);
  await tcArc06(page);
  await tcArc07(page);
  await tcArc08(page);
  await tcArc09(page);

  const failed = results.filter((result) => result.s === 'FAIL');
  console.log(`\nTC-ARC summary: ${results.length - failed.length}/${results.length} passed`);
  return { failed: failed.length };
}

async function main() {
  let browser = null;
  const suiteTimeoutMs = envMs('E2E_ARCHIVE_TIMEOUT_MS', envMs('E2E_SUITE_TIMEOUT_MS', 15 * 60 * 1000));
  const suiteTimer = setTimeout(() => {
    console.error(`[tc-archive] suite timed out after ${suiteTimeoutMs}ms`);
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

    const { failed } = await runArchiveTests(page);
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
  runArchiveTests,
  createCompletedPublicBmArchive,
  cleanupArchiveFixture,
  QUALIFICATION_FETCH_TIMEOUT_MS,
  assertQualificationFetchesStartInParallel,
  requestKindForQualificationFetch,
};

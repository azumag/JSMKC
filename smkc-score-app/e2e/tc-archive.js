/**
 * E2E Tournament archive tests.
 *
 * Coverage:
 *   TC-ARC-01  Missing archive returns 404.
 *   TC-ARC-02  Archive regeneration rejects non-completed tournaments.
 *   TC-ARC-03  Completed public tournament archive can be regenerated and read.
 *   TC-ARC-04  Completed private archive is not publicly readable.
 *
 * Run: node e2e/tc-archive.js  (from smkc-score-app/)  or: npm run e2e:archive
 */
const {
  makeResults,
  makeLog,
  apiCreateTournament,
  apiDeletePlayer,
  apiDeleteTournament,
  apiSetupBmGroup,
  apiUpdateTournament,
  launchPersistentChromiumContext,
  resolveE2EProfileDir,
  BASE,
} = require('./lib/common');
const { closeBrowser, envMs, exitAfterCleanup } = require('./lib/runner');

const results = makeResults();
const log = makeLog(results);

async function apiJson(page, path, options = {}) {
  return page.evaluate(async ([url, init]) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  }, [path, options]);
}

async function createPlayers(page, prefix, count) {
  const stamp = Date.now();
  const players = [];
  for (let index = 1; index <= count; index++) {
    const nickname = `${prefix.toLowerCase()}_${stamp}_${index}`;
    const player = await apiJson(page, '/api/players', {
      method: 'POST',
      body: {
        name: `${prefix} Player ${index}`,
        nickname,
        country: 'JP',
      },
    });
    const id = player.body?.data?.player?.id;
    if (player.status !== 201 || !id) throw new Error(`player create failed (${player.status})`);
    players.push({ id, name: `${prefix} Player ${index}`, nickname });
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
  let tournamentId = null;
  const players = [];
  try {
    players.push(...await createPlayers(page, 'TCARC03', 4));
    tournamentId = await apiCreateTournament(page, `E2E TC-ARC-03 ${Date.now()}`);
    const setup = await apiSetupBmGroup(page, tournamentId, bmAssignments(players));
    if (setup.s !== 201) throw new Error(`BM setup failed (${setup.s})`);

    const completed = await apiUpdateTournament(page, tournamentId, {
      status: 'completed',
      publicModes: ['bm', 'overall'],
      bmQualificationConfirmed: true,
    });
    if (completed.s !== 200) throw new Error(`completion update failed (${completed.s})`);

    const post = await apiJson(page, `/api/tournaments/${tournamentId}/archive`, { method: 'POST' });
    const get = await apiJson(page, `/api/tournaments/${tournamentId}/archive`);
    const archive = get.body?.data;
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
    await apiDeleteTournament(page, tournamentId);
    for (const player of players) await apiDeletePlayer(page, player.id);
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

    const response = await apiJson(page, `/api/tournaments/${tournamentId}/archive`);
    log('TC-ARC-04',
      response.status === 403 && response.body?.code === 'FORBIDDEN' ? 'PASS' : 'FAIL',
      `status=${response.status} code=${response.body?.code}`,
    );
  } catch (error) {
    log('TC-ARC-04', 'FAIL', error instanceof Error ? error.message : String(error));
  } finally {
    await apiDeleteTournament(page, tournamentId);
  }
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

    await tcArc01(page);
    await tcArc02(page);
    await tcArc03(page);
    await tcArc04(page);
  } finally {
    clearTimeout(suiteTimer);
    await closeBrowser(browser);
  }

  const failed = results.filter((result) => result.s === 'FAIL');
  console.log(`\nTC-ARC summary: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
}

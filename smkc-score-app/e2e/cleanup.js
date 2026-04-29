/**
 * E2E cleanup utility.
 *
 * Keeps the Playwright persistent profile intact. Cleanup happens through the
 * app API using the existing admin session stored in E2E_PROFILE_DIR.
 *
 * Deletes:
 * - tournaments matching TOURNAMENT_NAME_RE (E2E, Finals Ready, TC-315/316 legacy,
 *   BM-position-check, MR/GP/TA standalone tie/rank tests)
 * - players whose nickname starts with "e2e_" or "finals_ready_"
 *
 * Run:
 *   npm run e2e:cleanup
 *   npm run e2e:cleanup -- --dry-run
 */
const { BASE, installApiLogging, launchPersistentChromiumContext } = require('./lib/common');
const { closeBrowser, envMs, formatDuration } = require('./lib/runner');

const PROFILE_DIR = process.env.E2E_PROFILE_DIR || '/tmp/playwright-smkc-profile';
const PAGE_LIMIT = 100;
// Matches all tournament names created by e2e test suites.
// Includes legacy non-E2E-prefixed names from tc-bm/mr/gp/ta standalone runs.
const TOURNAMENT_NAME_RE = /^(E2E\b|Finals Ready\b|TC-315-test-|TC-316-test-|BM-position-check\b|MR Tie\b|GP Tie\b|TA Tie\b|TA Rank Del\b)/i;
const PLAYER_NICKNAME_RE = /^(e2e_|finals_ready_)/i;

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    dryRun: args.has('--dry-run') || process.env.E2E_CLEANUP_DRY_RUN === '1',
    help: args.has('--help') || args.has('-h'),
  };
}

function usage() {
  console.log([
    'Usage: npm run e2e:cleanup -- [--dry-run]',
    '',
    'Environment:',
    `  E2E_BASE_URL       Target app URL. Default: ${BASE}`,
    `  E2E_PROFILE_DIR    Playwright profile with admin session. Default: ${PROFILE_DIR}`,
    '  E2E_HEADLESS=1     Run Chromium headless.',
    '',
    'This command does not delete or reset the Playwright profile.',
  ].join('\n'));
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const data = payload.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray(data.data)) return data.data;

  return [];
}

function extractMeta(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.meta && typeof payload.meta === 'object') return payload.meta;
  if (payload.data && typeof payload.data === 'object' && payload.data.meta) return payload.data.meta;
  return null;
}

async function fetchJson(page, path, options = {}) {
  return page.evaluate(async ([url, requestOptions]) => {
    const res = await fetch(url, requestOptions);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { status: res.status, ok: res.ok, body };
  }, [path, options]);
}

async function listAll(page, endpoint) {
  const records = [];

  for (let pageNo = 1; ; pageNo++) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const res = await fetchJson(page, `${endpoint}${separator}page=${pageNo}&limit=${PAGE_LIMIT}`);
    if (!res.ok) {
      throw new Error(`GET ${endpoint} page=${pageNo} failed (${res.status}): ${JSON.stringify(res.body).slice(0, 300)}`);
    }

    const rows = extractArray(res.body);
    records.push(...rows);

    const meta = extractMeta(res.body);
    if (meta && Number.isFinite(meta.totalPages)) {
      if (pageNo >= meta.totalPages) break;
    } else if (rows.length < PAGE_LIMIT) {
      break;
    }
  }

  return records;
}

function tournamentLabel(tournament) {
  return `${tournament.name || '(unnamed)'} [${tournament.id}]`;
}

function playerLabel(player) {
  return `${player.nickname || '(no nickname)'} [${player.id}]`;
}

async function deleteTournament(page, tournament, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] tournament: ${tournamentLabel(tournament)}`);
    return true;
  }

  const demote = await fetchJson(page, `/api/tournaments/${tournament.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'draft' }),
  });

  const remove = await fetchJson(page, `/api/tournaments/${tournament.id}`, {
    method: 'DELETE',
  });

  if (!remove.ok) {
    console.error(
      `[cleanup] failed tournament: ${tournamentLabel(tournament)} ` +
      `PUT=${demote.status} DELETE=${remove.status} ${JSON.stringify(remove.body).slice(0, 300)}`,
    );
    return false;
  }

  console.log(`[cleanup] deleted tournament: ${tournamentLabel(tournament)}`);
  return true;
}

async function deletePlayer(page, player, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] player: ${playerLabel(player)}`);
    return true;
  }

  const remove = await fetchJson(page, `/api/players/${player.id}`, {
    method: 'DELETE',
  });

  if (!remove.ok) {
    console.error(
      `[cleanup] failed player: ${playerLabel(player)} ` +
      `DELETE=${remove.status} ${JSON.stringify(remove.body).slice(0, 300)}`,
    );
    return false;
  }

  console.log(`[cleanup] deleted player: ${playerLabel(player)}`);
  return true;
}

async function main() {
  const { dryRun, help } = parseArgs(process.argv);
  if (help) {
    usage();
    return 0;
  }

  const started = Date.now();
  let browser = null;
  let failures = 0;

  console.log(`[cleanup] target: ${BASE}`);
  console.log(`[cleanup] profile: ${PROFILE_DIR}`);
  if (dryRun) console.log('[cleanup] dry run: no data will be deleted');

  try {
    browser = await launchPersistentChromiumContext(PROFILE_DIR, {
      headless: process.env.E2E_HEADLESS === '1',
      viewport: { width: 1280, height: 720 },
    });
    installApiLogging(browser, 'cleanup');

    const page = browser.pages()[0] || await browser.newPage();
    page.setDefaultTimeout(envMs('E2E_ACTION_TIMEOUT_MS', 30 * 1000));
    page.setDefaultNavigationTimeout(envMs('E2E_NAV_TIMEOUT_MS', 30 * 1000));

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: envMs('E2E_NAV_TIMEOUT_MS', 30 * 1000) });

    const session = await fetchJson(page, '/api/auth/session-status');
    if (!session.ok || session.body?.data?.authenticated !== true) {
      console.warn('[cleanup] warning: admin session was not confirmed; deletes may fail with 403');
    }

    const tournaments = (await listAll(page, '/api/tournaments'))
      .filter((tournament) => TOURNAMENT_NAME_RE.test(tournament.name || ''));
    console.log(`[cleanup] matched tournaments: ${tournaments.length}`);

    for (const tournament of tournaments) {
      const ok = await deleteTournament(page, tournament, dryRun);
      if (!ok) failures++;
    }

    const players = (await listAll(page, '/api/players'))
      .filter((player) => PLAYER_NICKNAME_RE.test(player.nickname || ''));
    console.log(`[cleanup] matched players: ${players.length}`);

    for (const player of players) {
      const ok = await deletePlayer(page, player, dryRun);
      if (!ok) failures++;
    }
  } finally {
    await closeBrowser(browser);
  }

  const elapsed = formatDuration(Date.now() - started);
  if (failures > 0) {
    console.error(`[cleanup] finished with ${failures} failure(s) in ${elapsed}`);
    return 1;
  }

  console.log(`[cleanup] finished in ${elapsed}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[cleanup] fatal:', err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  });

const {
  apiDeleteTournament,
  uiCreatePlayer,
  uiCreateTournament,
  setupModePlayersViaUi,
  setupTaQualViaUi,
} = require('./common');

const SHARED_PLAYER_COUNT = 28;
const SHARED_PREFIX = 'e2e_shared';

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
    const body = await res.json().catch(() => ({}));
    return { s: res.status, ok: res.ok, b: body };
  }, [path, options]);
}

async function listAll(page, endpoint) {
  const records = [];
  for (let pageNo = 1; ; pageNo++) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const res = await fetchJson(page, `${endpoint}${sep}page=${pageNo}&limit=100`);
    if (!res.ok) {
      throw new Error(`GET ${endpoint} page=${pageNo} failed (${res.s})`);
    }
    const rows = extractArray(res.b);
    records.push(...rows);
    const meta = extractMeta(res.b);
    if (meta?.totalPages) {
      if (pageNo >= meta.totalPages) break;
    } else if (rows.length < 100) {
      break;
    }
  }
  return records;
}

function sharedPlayerNickname(index) {
  return `${SHARED_PREFIX}_${String(index).padStart(2, '0')}`;
}

function sharedPlayerName(index) {
  return `E2E Shared P${String(index).padStart(2, '0')}`;
}

async function resetPlayerPassword(page, playerId) {
  const res = await fetchJson(page, `/api/players/${playerId}/reset-password`, { method: 'POST' });
  const password = res.b?.data?.temporaryPassword ?? res.b?.temporaryPassword ?? null;
  if (res.s !== 200 || !password) {
    throw new Error(`Failed to reset password for player ${playerId} (${res.s})`);
  }
  return password;
}

async function ensureSharedPlayers(page, count = SHARED_PLAYER_COUNT) {
  const existing = await listAll(page, '/api/players');
  const byNickname = new Map(existing.map((player) => [player.nickname, player]));
  const players = [];

  for (let i = 1; i <= count; i++) {
    const nickname = sharedPlayerNickname(i);
    let player = byNickname.get(nickname);
    let password = null;

    if (!player) {
      /* Create via the /players admin UI so the fixture exercises the real
       * admin flow; the password is scraped from the POST response that the
       * UI itself fires, then the confirmation dialog is dismissed. */
      const created = await uiCreatePlayer(page, sharedPlayerName(i), nickname);
      player = { id: created.id, name: sharedPlayerName(i), nickname };
      password = created.password;
    }

    if (!password) {
      password = await resetPlayerPassword(page, player.id);
    }

    players.push({ id: player.id, name: player.name || sharedPlayerName(i), nickname, password });
  }

  return players;
}

async function ensureSharedTournament(page, name, opts) {
  const tournaments = await listAll(page, '/api/tournaments');
  let tournament = tournaments.find((row) => row.name === name);

  if (tournament && Boolean(tournament.dualReportEnabled) !== Boolean(opts.dualReportEnabled)) {
    await apiDeleteTournament(page, tournament.id);
    tournament = null;
  }

  if (!tournament) {
    const id = await uiCreateTournament(page, name, opts);
    tournament = { id, name, ...opts };
  }

  return tournament;
}

/**
 * TA-specific fixture setup: prepares the shared tournament for a TA run by
 * (1) activating the tournament (idempotent PUT status='active'),
 * (2) deleting any pre-existing qualification TT entries so the tournament
 *     becomes a clean slate (the shared tournament is reused across tests
 *     and across whole suite invocations),
 * (3) re-adding the requested players via apiAddTaEntries with seeding 1..N,
 * (4) optionally seeding each entry's 20-course times + totalTime + rank via
 *     makeTaTimesForRank so rank i maps to the i-th player in `players`.
 *
 * Returns { tournamentId, entries } where entries is an array of
 * { entryId, playerId, nickname, rank } in input-player order.
 *
 * NOTE: This does NOT reset phase1/phase2/phase3 state. Tests that promote
 * phases mutate state that cannot be undone without freezing the stage, so
 * they must continue to provision their own isolated tournaments.
 */
async function setupTaEntriesFromShared(adminPage, tournamentId, players, { seedTimes = true } = {}) {
  /* Thin alias over setupTaQualViaUi so the fixture and the standalone bulk
   * setup helpers share one UI-driven code path. Kept as a separate export
   * so existing imports elsewhere in the suite continue to resolve. */
  return setupTaQualViaUi(adminPage, tournamentId, players, { seedTimes });
}

async function createSharedE2eFixture(page, suiteName) {
  const players = await ensureSharedPlayers(page);
  const normalTournament = await ensureSharedTournament(
    page,
    'E2E Shared Normal',
    { dualReportEnabled: false },
  );
  const dualTournament = await ensureSharedTournament(
    page,
    'E2E Shared DualReport',
    { dualReportEnabled: true },
  );
  /* Separate tournament dedicated to 28-player finals tests. Pair tests reset
   * normalTournament to a 2-player configuration every run, so sharing a
   * single tournament for both would force the expensive 28-player
   * setupXxxQualViaUi to re-seed on every finals test. Keeping finals
   * isolated lets beforeAll prepare it once and every finals test reuse. */
  const finalsTournament = await ensureSharedTournament(
    page,
    'E2E Shared Finals',
    { dualReportEnabled: false },
  );

  return {
    players,
    normalTournament,
    dualTournament,
    finalsTournament,
    /* Cleanup intentionally drops tournaments only. Shared e2e_shared_* players
     * persist across runs because ensureSharedPlayers is idempotent (matches by
     * nickname) and UI-based re-creation is slow. Full player teardown now lives
     * in the standalone `e2e/cleanup.js` script, to be run only when a clean
     * slate is explicitly desired. */
    cleanup: async () => {
      await apiDeleteTournament(page, normalTournament.id);
      await apiDeleteTournament(page, dualTournament.id);
      await apiDeleteTournament(page, finalsTournament.id);
    },
  };
}

module.exports = {
  createSharedE2eFixture,
  setupModePlayersViaUi,
  setupTaEntriesFromShared,
};

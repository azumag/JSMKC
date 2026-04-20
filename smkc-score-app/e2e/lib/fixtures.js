const {
  apiCreatePlayer,
  apiCreateTournament,
  apiDeletePlayer,
  apiDeleteTournament,
  apiActivateTournament,
  apiAddTaEntries,
  apiSeedTtEntry,
  apiFetchTa,
  makeTaTimesForRank,
  escapeRegex,
  nav,
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
      const created = await apiCreatePlayer(page, sharedPlayerName(i), nickname);
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
    const id = await apiCreateTournament(page, name, opts);
    tournament = { id, name, ...opts };
  }

  return tournament;
}

async function removeSelectedGroupPlayers(dialog) {
  for (let i = 0; i < 80; i++) {
    const removeButtons = dialog.getByRole('button', { name: /Remove|削除/ });
    const count = await removeButtons.count();
    if (count === 0) return;
    await removeButtons.first().click();
  }
  throw new Error('Too many selected players while clearing group setup dialog');
}

async function selectGroupPlayer(dialog, player) {
  const search = dialog.getByPlaceholder(/Search players|プレイヤーを検索/);
  await search.fill(player.nickname);
  const label = new RegExp(`^${escapeRegex(player.nickname)} \\(${escapeRegex(player.name)}\\)$`);
  await dialog.getByLabel(label).check();
  await search.fill('');
}

async function setupModePlayersViaUi(page, mode, tournamentId, players) {
  await nav(page, `/tournaments/${tournamentId}/${mode}`);
  const trigger = page.getByRole('button', { name: /Setup Groups|Edit Groups|グループ設定|グループ編集/ });
  await trigger.first().click();

  const dialog = page.getByRole('dialog').first();
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
  await removeSelectedGroupPlayers(dialog);

  for (const player of players) {
    await selectGroupPlayer(dialog, player);
  }

  if (players.length >= 4) {
    await dialog.getByRole('button', { name: /^4$/ }).click();
    const seedingInputs = dialog.locator('input[type="number"]');
    for (let i = 0; i < players.length; i++) {
      await seedingInputs.nth(i).fill(String(i + 1));
    }
    await dialog.getByRole('button', { name: /Distribute by Seed|シード順で振分け/ }).click();
  }

  const save = dialog.getByRole('button', {
    name: /Create Groups & Matches|Update Groups|グループ＆試合作成|グループ更新/,
  });
  const responsePromise = page.waitForResponse((res) =>
    res.url().includes(`/api/tournaments/${tournamentId}/${mode}`) &&
    res.request().method() === 'POST',
  );
  await save.click();
  const response = await responsePromise;
  if (response.status() !== 201) {
    throw new Error(`${mode.toUpperCase()} UI setup failed (${response.status()})`);
  }
  await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
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
  if (!tournamentId) throw new Error('setupTaEntriesFromShared: tournamentId is required');
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error('setupTaEntriesFromShared: players must be a non-empty array');
  }

  /* Activating an already-active tournament is a no-op PUT; calling
   * unconditionally avoids an extra GET round-trip. */
  await apiActivateTournament(adminPage, tournamentId);

  /* Delete any qualification entries left behind by prior runs.
   * If the tournament still has phase-stage entries from an earlier
   * aborted promotion, those would freeze the qualification stage; that
   * case is rare and surfaces here as a non-200 DELETE which we surface. */
  const existing = await apiFetchTa(adminPage, tournamentId);
  const existingEntries = existing.b?.data?.entries ?? [];
  for (const entry of existingEntries) {
    const res = await fetchJson(adminPage, `/api/tournaments/${tournamentId}/ta?entryId=${entry.id}`, { method: 'DELETE' });
    if (!res.ok && res.s !== 404) {
      throw new Error(`Failed to delete TA entry ${entry.id} (${res.s})`);
    }
  }

  const add = await apiAddTaEntries(adminPage, tournamentId, {
    playerEntries: players.map((player, i) => ({ playerId: player.id, seeding: i + 1 })),
  });
  if (add.s !== 201) {
    throw new Error(`TA add failed (${add.s}): ${JSON.stringify(add.b).slice(0, 200)}`);
  }

  const added = add.b?.data?.entries ?? [];
  /* Add response returns entries ordered by seeding; re-map defensively so
   * rank 1..N lines up with `players[0..N-1]` even if the server reorders. */
  const byPlayerId = new Map(added.map((e) => [e.playerId, e]));
  const entries = players.map((player, i) => {
    const row = byPlayerId.get(player.id);
    if (!row) throw new Error(`TA entry missing for player ${player.nickname}`);
    return {
      entryId: row.id,
      playerId: player.id,
      nickname: player.nickname,
      rank: i + 1,
    };
  });

  if (seedTimes) {
    for (const entry of entries) {
      const { times, totalMs } = makeTaTimesForRank(entry.rank);
      await apiSeedTtEntry(adminPage, tournamentId, entry.entryId, times, totalMs, entry.rank);
    }
  }

  return { tournamentId, entries };
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

  return {
    players,
    normalTournament,
    dualTournament,
    cleanup: async () => {
      await apiDeleteTournament(page, normalTournament.id);
      await apiDeleteTournament(page, dualTournament.id);
      for (const player of players) {
        await apiDeletePlayer(page, player.id);
      }
    },
  };
}

module.exports = {
  createSharedE2eFixture,
  setupModePlayersViaUi,
  setupTaEntriesFromShared,
};

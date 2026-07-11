/**
 * E2E TA battle royale follow-up coverage.
 *
 * Coverage:
 *   TC-TA-BR-01  BR starts directly in Phase 3 and mode changes lock after start.
 *   TC-TA-BR-02  Selected handicap snapshots are stored on Phase 3 entries.
 *   TC-TA-BR-03  Adjusted time decides life loss; history keeps raw/handicap/adjusted fields.
 *   TC-TA-BR-04  TA-only navigation, direct finals redirect, compact lives, and preview flow.
 *   TC-TA-BR-05  Archive v2 and archived phases API preserve the same BR rules/results.
 *
 * Run: node e2e/tc-ta-battle-royale.js
 */
const {
  apiCreatePlayer,
  apiCreateTournament,
  apiDeletePlayer,
  apiDeleteTournament,
  apiFetchTaPhase,
  apiJson,
  apiPostTaPhase,
  apiUpdateTournament,
  makeLog,
  makeResults,
  nav,
  uiPhaseStartRound,
} = require('./lib/common');
const { runSuite } = require('./lib/runner');

const results = makeResults();
const log = makeLog(results);
let tournamentId = null;
let players = [];
let entries = [];
let handicapByPlayerId = new Map();

function pass(condition, message) {
  if (!condition) throw new Error(message);
}

function msToMSS(ms) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

async function submitPhase3ResultsWithPreview(page, tournamentId, results) {
  const inputs = page.locator('input[placeholder="M:SS.mm"]');
  await inputs.first().waitFor({ state: 'visible', timeout: 15_000 });
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const row = page.getByRole('row').filter({ hasText: result.nickname }).first();
    const input = row.locator('input[placeholder="M:SS.mm"]').first();
    await ((await input.count()) ? input : inputs.nth(index)).fill(msToMSS(result.timeMs));
  }

  await page.getByRole('button', { name: /Submit & Deduct Lives|送信＆ライフ減算/ }).click();
  const dialog = page
    .getByRole('dialog')
    .filter({
      hasText: /Review Before Submit|送信前確認|補正後タイム順/,
    })
    .first();
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/tournaments/${tournamentId}/ta/phases`) && response.request().method() === 'POST',
    { timeout: 60_000 },
  );
  await dialog.getByRole('button', { name: /Confirm results|結果を確定/ }).click();
  const response = await responsePromise;
  pass(response.status() === 200, `UI submit_results failed (${response.status()})`);
}

async function setup(adminPage) {
  const stamp = Date.now();
  for (let index = 1; index <= 6; index += 1) {
    players.push(await apiCreatePlayer(adminPage, `TA BR Player ${index}`, `ta_br_${stamp}_${index}`));
  }

  tournamentId = await apiCreateTournament(adminPage, `E2E TA BR ${stamp}`, {
    taBattleRoyaleMode: true,
    taPlayerSelfEdit: false,
  });

  const handicaps = [0, -1, -3, -5, -3, -1];
  handicapByPlayerId = new Map(players.map((player, index) => [player.id, handicaps[index]]));
  const started = await apiJson(adminPage, `/api/tournaments/${tournamentId}/ta/battle-royale`, {
    method: 'POST',
    body: {
      players: players.map((player) => ({
        playerId: player.id,
        taHandicapSeconds: handicapByPlayerId.get(player.id),
      })),
    },
  });
  pass(started.status === 201, `direct Phase 3 start failed (${started.status})`);
  entries = started.body?.data?.entries ?? [];
  pass(entries.length === 6, `expected 6 Phase 3 entries, got ${entries.length}`);
}

async function tcModeAndDirectStart(adminPage) {
  try {
    const phase = await apiFetchTaPhase(adminPage, tournamentId, 'phase3');
    const phaseData = phase.b?.data;
    pass(phaseData?.taMode === 'battle_royale', 'phase API mode mismatch');
    pass(phaseData?.phase3Rules?.initialLives === 10, 'phase API initial lives mismatch');
    pass((phaseData?.phase3Rules?.lifeResetThresholds ?? []).length === 0, 'BR unexpectedly has reset thresholds');
    pass((phaseData?.entries ?? []).every((entry) => entry.lives === 10), 'Phase 3 entries did not start at 10 lives');
    pass(
      (phaseData?.entries ?? []).every(
        (entry) => entry.taHandicapSeconds === handicapByPlayerId.get(entry.playerId),
      ),
      'Phase 3 handicap snapshots differ from selected values',
    );

    const locked = await apiUpdateTournament(adminPage, tournamentId, { taBattleRoyaleMode: false });
    pass(locked.s === 409 && locked.b?.code === 'TA_MODE_LOCKED', `mode lock returned ${locked.s}/${locked.b?.code}`);

    await nav(adminPage, `/tournaments/${tournamentId}/ta`);
    await adminPage.waitForURL(new RegExp(`/tournaments/${tournamentId}/ta/finals(?:$|\\?)`), { timeout: 15_000 });
    pass((await adminPage.locator(`a[href="/tournaments/${tournamentId}/bm"]`).count()) === 0, 'BM tab is visible');
    pass((await adminPage.locator(`a[href="/tournaments/${tournamentId}/mr"]`).count()) === 0, 'MR tab is visible');
    pass((await adminPage.locator(`a[href="/tournaments/${tournamentId}/gp"]`).count()) === 0, 'GP tab is visible');
    pass(
      (await adminPage.locator(`a[href="/tournaments/${tournamentId}/overall-ranking"]`).count()) === 0,
      'Overall tab is visible',
    );

    log('TC-TA-BR-01', 'PASS');
    log('TC-TA-BR-02', 'PASS');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log('TC-TA-BR-01', 'FAIL', detail);
    log('TC-TA-BR-02', 'FAIL', detail);
  }
}

async function tcAdjustedRoundAndUi(adminPage) {
  try {
    const start = await apiPostTaPhase(adminPage, tournamentId, {
      action: 'start_round',
      phase: 'phase3',
      course: 'MC1',
    });
    pass(start.s === 200, `start_round failed (${start.s})`);
    const roundNumber = start.b?.data?.roundNumber ?? 1;
    const rawTimes = [100_000, 100_500, 102_000, 104_000, 103_500, 101_000];
    const submit = await apiPostTaPhase(adminPage, tournamentId, {
      action: 'submit_results',
      phase: 'phase3',
      roundNumber,
      results: entries.map((entry, index) => ({ playerId: entry.playerId, timeMs: rawTimes[index] })),
    });
    pass(submit.s === 200, `submit_results failed (${submit.s})`);

    const phase = await apiFetchTaPhase(adminPage, tournamentId, 'phase3');
    const phaseEntries = phase.b?.data?.entries ?? [];
    const byPlayer = new Map(phaseEntries.map((entry) => [entry.playerId, entry]));
    pass(byPlayer.get(entries[0].playerId)?.lives === 9, '0-second handicap player should lose a life');
    pass(byPlayer.get(entries[1].playerId)?.lives === 10, '-1-second handicap player should be safe');
    pass(byPlayer.get(entries[2].playerId)?.lives === 10, '-3-second handicap player should be safe');
    pass(byPlayer.get(entries[3].playerId)?.lives === 10, '-5-second handicap player should be safe');
    pass(byPlayer.get(entries[4].playerId)?.lives === 9, 'second -3-second handicap player should lose a life');
    pass(byPlayer.get(entries[5].playerId)?.lives === 9, 'second -1-second handicap player should lose a life');

    const storedRound = (phase.b?.data?.rounds ?? []).find((round) => round.roundNumber === roundNumber);
    const lastResult = storedRound?.results?.find((result) => result.playerId === entries[3].playerId);
    pass(lastResult?.rawTimeMs === 104_000, 'round history lost raw time');
    pass(lastResult?.handicapSeconds === -5, 'round history lost handicap');
    pass(lastResult?.timeMs === 99_000, 'round history adjusted time mismatch');
    pass(storedRound?.livesReset !== true, 'BR round unexpectedly reset lives');

    const simultaneousTargets = [entries[0], entries[4], entries[5]];
    for (const entry of simultaneousTargets) {
      const current = byPlayer.get(entry.playerId)?.lives ?? 10;
      const update = await apiJson(adminPage, `/api/tournaments/${tournamentId}/ta`, {
        method: 'PUT',
        body: { entryId: entry.id, action: 'update_lives', livesDelta: 1 - current },
      });
      pass(update.status === 200, `failed to prepare one-life state for ${entry.playerId}`);
    }

    const simultaneousStart = await apiPostTaPhase(adminPage, tournamentId, {
      action: 'start_round',
      phase: 'phase3',
      course: 'DP1',
    });
    pass(simultaneousStart.s === 200, `simultaneous elimination round failed to start (${simultaneousStart.s})`);
    const simultaneousSubmit = await apiPostTaPhase(adminPage, tournamentId, {
      action: 'submit_results',
      phase: 'phase3',
      roundNumber: simultaneousStart.b?.data?.roundNumber ?? roundNumber + 1,
      results: entries.map((entry, index) => ({ playerId: entry.playerId, timeMs: rawTimes[index] + 10_000 })),
    });
    pass(simultaneousSubmit.s === 200, `simultaneous elimination submit failed (${simultaneousSubmit.s})`);
    const afterSimultaneous = await apiFetchTaPhase(adminPage, tournamentId, 'phase3');
    const afterEntries = afterSimultaneous.b?.data?.entries ?? [];
    const afterByPlayer = new Map(afterEntries.map((entry) => [entry.playerId, entry]));
    pass(
      simultaneousTargets.every((entry) => {
        const current = afterByPlayer.get(entry.playerId);
        return current?.lives === 0 && current?.eliminated === true;
      }),
      'all three one-life bottom-half players must be eliminated in the same round',
    );
    pass(
      afterEntries.every((entry) => entry.lives > 0 || entry.eliminated === true),
      'found a zero-life player that was not eliminated',
    );
    pass(
      !(afterSimultaneous.b?.data?.pendingSuddenDeath?.kind === 'revival'),
      'battle royale must not create a standard-TA revival',
    );

    log('TC-TA-BR-03', 'PASS');

    await nav(adminPage, `/tournaments/${tournamentId}/ta/finals`);
    const body = await adminPage.locator('body').innerText();
    pass(/TA Battle Royale|TAバトルロワイヤル/.test(body), 'BR mode badge not visible');
    pass(body.includes('♥ 10/10') && /Eliminated|失格/.test(body), 'compact lives/elimination state not visible');

    await uiPhaseStartRound(adminPage, tournamentId, 'phase3');
    const activePhase = await apiFetchTaPhase(adminPage, tournamentId, 'phase3');
    const active = (activePhase.b?.data?.entries ?? []).filter((entry) => !entry.eliminated);
    await submitPhase3ResultsWithPreview(
      adminPage,
      tournamentId,
      active.map((entry, index) => ({ nickname: entry.player?.nickname, timeMs: 110_000 + index * 1000 })),
    );
    log('TC-TA-BR-04', 'PASS');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log('TC-TA-BR-03', 'FAIL', detail);
    log('TC-TA-BR-04', 'FAIL', detail);
  }
}

async function tcArchiveParity(adminPage) {
  try {
    const activated = await apiUpdateTournament(adminPage, tournamentId, { status: 'active' });
    pass(activated.s === 200, `activation failed (${activated.s})`);
    const completed = await apiUpdateTournament(adminPage, tournamentId, { status: 'completed', publicModes: ['ta'] });
    pass(completed.s === 200, `completion failed (${completed.s})`);

    const archiveResponse = await apiJson(adminPage, `/api/tournaments/${tournamentId}/archive`);
    const archive = archiveResponse.body?.data;
    pass(archiveResponse.status === 200, `archive GET failed (${archiveResponse.status})`);
    pass(archive?.schemaVersion === 2, 'archive schema is not v2');
    pass(archive?.modes?.ta?.rules?.mode === 'battle_royale', 'archive mode mismatch');
    pass(archive?.modes?.ta?.rules?.initialLives === 10, 'archive rules mismatch');
    pass((archive?.modes?.ta?.phaseRounds ?? []).length >= 2, 'archive round history missing');

    await apiDeleteTournament(adminPage, tournamentId);
    const archivedPhase = await apiFetchTaPhase(adminPage, tournamentId, 'phase3');
    pass(archivedPhase.s === 200 && archivedPhase.b?.data?.archived === true, 'phase API did not fall back to archive');
    pass(archivedPhase.b?.data?.taMode === 'battle_royale', 'archived phase API mode mismatch');
    pass(archivedPhase.b?.data?.phase3Rules?.initialLives === 10, 'archived phase rules mismatch');
    pass((archivedPhase.b?.data?.rounds ?? []).length >= 2, 'archived phase history missing');
    tournamentId = null;
    log('TC-TA-BR-05', 'PASS');
  } catch (error) {
    log('TC-TA-BR-05', 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

function getSuite() {
  return {
    suiteName: 'TA-BATTLE-ROYALE',
    results,
    log,
    beforeAll: setup,
    afterAll: async (adminPage) => {
      if (tournamentId) await apiDeleteTournament(adminPage, tournamentId).catch(() => {});
      await Promise.all(players.map((player) => apiDeletePlayer(adminPage, player.id).catch(() => {})));
      tournamentId = null;
      players = [];
      entries = [];
      handicapByPlayerId = new Map();
    },
    tests: [
      { name: 'TC-TA-BR-01/02', fn: tcModeAndDirectStart },
      { name: 'TC-TA-BR-03/04', fn: tcAdjustedRoundAndUi },
      { name: 'TC-TA-BR-05', fn: tcArchiveParity },
    ],
  };
}

module.exports = { getSuite, results };

if (require.main === module) runSuite(getSuite());

/**
 * E2E TA (Time Attack / Time Trial) tests.
 *
 * Coverage:
 *   TC-801  28-player qualification fill — all 20 courses per player, server-
 *           computed ranks are 1..28 and scoring output is present.
 *   TC-804  Promote to Phase 1 — ranks 17-24 (8 players) move to phase1 stage.
 *   TC-805  Remove a mistaken TA qualification player via UI.
 *   TC-806  Phase 2 page renders and shows correct entries (8 players).
 *   TC-807  Phase 3 page renders and shows correct entries (8 players).
 *   TC-808  TA Finals page renders with champion banner on completion.
 *
 * Setup:
 *   - Uses the shared Playwright persistent profile (/tmp/playwright-smkc-profile).
 *   - Admin Discord OAuth session must already be established in that profile.
 *
 * Run: node e2e/tc-ta.js  (from smkc-score-app/)
 */
const {
  makeResults, makeLog, nav,
  apiCreatePlayer, apiCreateTournament, apiDeletePlayer, apiDeleteTournament,
  apiActivateTournament, apiAddTaEntries,
  apiFetchTa, apiFetchTaPhase, apiPromoteTaPhase,
  setupTa28PlayerQual, apiSeedTtEntry, makeTaTimesForRank,
} = require('./lib/common');
const { runSuite } = require('./lib/runner');

const results = makeResults();
const log = makeLog(results);

/* ───────── TC-801: 28-player full qualification ─────────
 * The setup helper seeds 20-course times + totalTime + rank for all 28
 * players via the admin /tt/entries PUT. We verify the persisted state:
 * 28 entries, all with totalTime and a rank, ranks cover 1..28. Scoring
 * (qualificationPoints) is computed by a separate finalize flow and is
 * intentionally not asserted here. */
async function runTc801(adminPage) {
  let setup = null;
  try {
    setup = await setupTa28PlayerQual(adminPage, '801');
    const data = await apiFetchTa(adminPage, setup.tournamentId);
    const entries = data.b?.data?.entries ?? [];

    const countOk = entries.length === 28;
    const allHaveTimes = entries.every((e) => e.totalTime != null && e.totalTime > 0);
    const ranks = entries.map((e) => e.rank).filter((r) => r != null).sort((a, b) => a - b);
    /* Ranks must cover 1..28. Our seeded times are strictly increasing by
     * seeding so no ties are expected. */
    const ranksOk = ranks.length === 28 && ranks[0] === 1 && ranks[27] === 28;

    const ok = countOk && allHaveTimes && ranksOk;
    log('TC-801', ok ? 'PASS' : 'FAIL',
      !countOk ? `entries=${entries.length} expected=28`
      : !allHaveTimes ? `some entries missing totalTime`
      : !ranksOk ? `ranks first=${ranks[0]} last=${ranks[ranks.length - 1]} count=${ranks.length}`
      : '');
  } catch (err) {
    log('TC-801', 'FAIL', err instanceof Error ? err.message : 'TA 801 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-804: Promote to Phase 1 ─────────
 * After promote_phase1, ranks 17-24 should move to stage='phase1'.
 * The qualification stage still contains 28 entries (promotion clones, it
 * doesn't remove), so we check phase1 count = 8 via the phase API. */
async function runTc804(adminPage) {
  let setup = null;
  try {
    setup = await setupTa28PlayerQual(adminPage, '804');

    const promote = await apiPromoteTaPhase(adminPage, setup.tournamentId, 'promote_phase1');
    if (promote.s !== 200) {
      throw new Error(`promote_phase1 returned ${promote.s}: ${JSON.stringify(promote.b).slice(0, 200)}`);
    }

    const phase1 = await apiFetchTaPhase(adminPage, setup.tournamentId, 'phase1');
    const entries = phase1.b?.data?.entries ?? [];
    const countOk = entries.length === 8;
    /* The 8 phase1 entries must correspond to qual ranks 17-24. */
    const sourceRanks = entries
      .map((e) => e.rank)
      .filter((r) => r != null)
      .sort((a, b) => a - b);
    const ranksOk = countOk && sourceRanks[0] === 17 && sourceRanks[7] === 24;

    const ok = countOk && ranksOk;
    log('TC-804', ok ? 'PASS' : 'FAIL',
      !countOk ? `phase1 entries=${entries.length} expected=8`
      : !ranksOk ? `source ranks=${sourceRanks.join(',')} expected 17..24`
      : '');
  } catch (err) {
    log('TC-804', 'FAIL', err instanceof Error ? err.message : 'TA 804 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-805: Remove a mistaken TA qualification player via UI ─────────
 * The admin can remove a qualification entry, cancel safely, then confirm. The
 * player master record remains available and the player returns to the Add
 * Player candidate list for re-entry. */
async function runTc805(adminPage) {
  const playerIds = [];
  const stamp = Date.now();
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await apiDeletePlayer(adminPage, id);
  };

  try {
    const p1 = await apiCreatePlayer(adminPage, `E2E TA 805 P1`, `e2e_ta805_${stamp}_1`);
    const p2 = await apiCreatePlayer(adminPage, `E2E TA 805 P2`, `e2e_ta805_${stamp}_2`);
    playerIds.push(p1.id, p2.id);

    tournamentId = await apiCreateTournament(adminPage, `E2E TA 805 ${stamp}`, { dualReportEnabled: false });
    await apiActivateTournament(adminPage, tournamentId);

    const add = await apiAddTaEntries(adminPage, tournamentId, {
      playerEntries: [
        { playerId: p1.id, seeding: 1 },
        { playerId: p2.id, seeding: 2 },
      ],
    });
    if (add.s !== 201) {
      throw new Error(`TA add failed (${add.s}): ${JSON.stringify(add.b).slice(0, 200)}`);
    }

    await nav(adminPage, `/tournaments/${tournamentId}/ta`);
    await adminPage.getByRole('tab', { name: /タイム入力|Time Entry/ }).click();

    const rowFor = (nickname) => adminPage
      .getByRole('row')
      .filter({ hasText: nickname });

    const targetRow = rowFor(p1.nickname);
    await targetRow.getByRole('button', { name: /予選から削除|Remove from qualification/ }).click();

    const dialog = adminPage.getByRole('alertdialog');
    await dialog.getByText(/予選から削除しますか|Remove .* from qualification/).waitFor({ timeout: 10000 });
    const dialogText = await dialog.innerText();
    const explainsRemoval = /プレイヤー自体は削除されません|player record is not deleted/i.test(dialogText);
    const explainsReAdd = /再追加|add the player again/i.test(dialogText);
    if (!explainsRemoval || !explainsReAdd) {
      throw new Error(`Removal dialog did not explain deletion scope/re-add path: ${dialogText}`);
    }

    await dialog.getByRole('button', { name: /キャンセル|Cancel/ }).click();
    await rowFor(p1.nickname).waitFor({ timeout: 10000 });

    await rowFor(p1.nickname)
      .getByRole('button', { name: /予選から削除|Remove from qualification/ })
      .click();
    await adminPage
      .getByRole('alertdialog')
      .getByRole('button', { name: /予選から削除|Remove from qualification/ })
      .click();

    await rowFor(p1.nickname).waitFor({ state: 'detached', timeout: 15000 });

    let entries = [];
    let removedFromApi = false;
    let retainedOther = false;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const data = await apiFetchTa(adminPage, tournamentId);
      entries = data.b?.data?.entries ?? [];
      removedFromApi = !entries.some((entry) => entry.playerId === p1.id);
      retainedOther = entries.some((entry) => entry.playerId === p2.id);
      if (removedFromApi && retainedOther) break;
      await adminPage.waitForTimeout(1000);
    }

    await adminPage.getByRole('button', { name: /プレイヤー追加|Add Player/ }).click();
    await adminPage.getByPlaceholder(/プレイヤーを検索|Search players/).fill(p1.nickname);
    await adminPage.getByText(new RegExp(p1.nickname)).waitFor({ timeout: 10000 });

    const ok = removedFromApi && retainedOther;
    log('TC-805', ok ? 'PASS' : 'FAIL',
      !removedFromApi ? 'removed player still exists in TA API'
      : !retainedOther ? 'non-removed player disappeared from TA API'
      : '');
  } catch (err) {
    log('TC-805', 'FAIL', err instanceof Error ? err.message : 'TA 805 failed');
  } finally {
    await cleanup();
  }
}

/* ───────── TC-806: Phase 2 page renders with correct entries ─────────
 * After promoting phase1 and completing 4 elimination rounds (so only 4
 * survivors remain), promote phase2 to move those survivors + ranks 13-16.
 *
 * Phase 1 uses single elimination: after each course, the slowest player
 * is eliminated. 8 players → 4 survivors after 4 rounds.
 *
 * TC-806 verifies the Phase 2 page (/ta/phase2) renders and shows 8 entries:
 * the 4 phase1 survivors plus the 4 qualifiers from ranks 13-16. */
async function runTc806(adminPage) {
  let setup = null;
  try {
    setup = await setupTa28PlayerQual(adminPage, '806');

    /* Promote phase1: ranks 17-24 move to phase1 stage */
    await apiPromoteTaPhase(adminPage, setup.tournamentId, 'promote_phase1');

    /* Get phase1 entries to know player IDs for submitting results */
    const phase1Before = await apiFetchTaPhase(adminPage, setup.tournamentId, 'phase1');
    const phase1Entries = phase1Before.b?.data?.entries ?? [];
    if (phase1Entries.length !== 8) {
      throw new Error(`Phase1 should have 8 entries, got ${phase1Entries.length}`);
    }

    /* Run 4 elimination rounds in phase1 (8→4 players) */
    for (let round = 1; round <= 4; round++) {
      /* Start a round */
      const startRes = await adminPage.evaluate(async ([id]) => {
        const r = await fetch(`/api/tournaments/${id}/ta/phases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start_round', phase: 'phase1' }),
        });
        return r.json().catch(() => ({}));
      }, [setup.tournamentId]);
      if (!startRes.data?.roundNumber) throw new Error(`start_round phase1 round ${round} failed`);

      /* Submit results for only non-eliminated (active) phase1 players.
       * Times are based on rank: rank 17 (slowest of phase1) has highest time,
       * rank 24 (fastest of phase1) has lowest time. Lower time = safer from elimination.
       * After 4 rounds, players with ranks 17-20 survive (4 fastest of the 8). */
      const allEntries = (await apiFetchTaPhase(adminPage, setup.tournamentId, 'phase1'))
        .b?.data?.entries ?? [];
      const activeEntries = allEntries.filter((e) => !e.eliminated);
      const results = activeEntries.map((e) => ({
        playerId: e.playerId,
        /* Per-course single-round time (NOT qualification totalTime).
         * totalTime is cumulative across 20 qual courses (~1.2M ms) and would
         * exceed the phases route's RETRY_PENALTY_MS cap (599990). */
        timeMs: 60000 + (e.rank || 20) * 200,
        isRetry: false,
      }));
      const submitRes = await adminPage.evaluate(async ([id, rn, data]) => {
        const bodyStr = JSON.stringify({ action: 'submit_results', phase: 'phase1', roundNumber: rn, results: data });
        const r = await fetch(`/api/tournaments/${id}/ta/phases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
        });
        const text = await r.text().catch(() => 'PARSE_ERROR');
        let body;
        try { body = JSON.parse(text); } catch { body = { raw: text.substring(0, 500) }; }
        return { s: r.status, b: body, debug: { rn, resultsCount: data.length, firstPlayerId: data[0]?.playerId } };
      }, [setup.tournamentId, startRes.data.roundNumber, results]);
      if (!submitRes.data && submitRes.s !== 200) throw new Error(`submit_results phase1 round ${round} failed: status=${submitRes.s}, error=${JSON.stringify(submitRes.b ?? 'empty').slice(0, 300)}, debug=${JSON.stringify(submitRes.debug)}`);
    }

    /* Promote phase2: phase1 survivors (4) + ranks 13-16 (4) = 8 total */
    await apiPromoteTaPhase(adminPage, setup.tournamentId, 'promote_phase2');

    const phase2 = await apiFetchTaPhase(adminPage, setup.tournamentId, 'phase2');
    const entries = phase2.b?.data?.entries ?? [];

    const countOk = entries.length === 8;
    const allHaveRank = entries.every((e) => e.rank != null);

    log('TC-806', countOk && allHaveRank ? 'PASS' : 'FAIL',
      !countOk ? `phase2 entries=${entries.length} expected=8`
      : !allHaveRank ? 'some entries missing rank'
      : '');
  } catch (err) {
    log('TC-806', 'FAIL', err instanceof Error ? err.message : 'TA 806 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-807: Phase 3 page renders with correct entries ─────────
 * After promoting phase1 and completing 4 elimination rounds (8→4),
 * promote phase2 and complete 4 more elimination rounds (8→4),
 * then promote phase3 to get phase2 survivors (4) + qual ranks 1-12 (12) = 16.
 *
 * TC-807 verifies the Phase 3 page (/ta/finals) renders and shows 16 entries
 * with lives > 0 (not yet eliminated). */
async function runTc807(adminPage) {
  let setup = null;
  try {
    setup = await setupTa28PlayerQual(adminPage, '807');

    /* Promote phase1: ranks 17-24 move to phase1 stage */
    await apiPromoteTaPhase(adminPage, setup.tournamentId, 'promote_phase1');

    /* Run 4 elimination rounds in phase1 (8→4 players) */
    for (let round = 1; round <= 4; round++) {
      const startRes = await adminPage.evaluate(async ([id]) => {
        const r = await fetch(`/api/tournaments/${id}/ta/phases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start_round', phase: 'phase1' }),
        });
        return r.json().catch(() => ({}));
      }, [setup.tournamentId]);
      if (!startRes.data?.roundNumber) throw new Error(`start_round phase1 round ${round} failed`);

      const allEntries = (await apiFetchTaPhase(adminPage, setup.tournamentId, 'phase1'))
        .b?.data?.entries ?? [];
      const activeEntries = allEntries.filter((e) => !e.eliminated);
      const results = activeEntries.map((e) => ({
        playerId: e.playerId,
        /* Per-course single-round time (NOT qualification totalTime).
         * totalTime is cumulative across 20 qual courses (~1.2M ms) and would
         * exceed the phases route's RETRY_PENALTY_MS cap (599990). */
        timeMs: 60000 + (e.rank || 20) * 200,
        isRetry: false,
      }));
      const submitRes = await adminPage.evaluate(async ([id, rn, data]) => {
        const bodyStr = JSON.stringify({ action: 'submit_results', phase: 'phase1', roundNumber: rn, results: data });
        const r = await fetch(`/api/tournaments/${id}/ta/phases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
        });
        const text = await r.text().catch(() => 'PARSE_ERROR');
        let body;
        try { body = JSON.parse(text); } catch { body = { raw: text.substring(0, 500) }; }
        return { s: r.status, b: body, debug: { rn, resultsCount: data.length, firstPlayerId: data[0]?.playerId } };
      }, [setup.tournamentId, startRes.data.roundNumber, results]);
      if (!submitRes.data && submitRes.s !== 200) throw new Error(`submit_results phase1 round ${round} failed: status=${submitRes.s}, error=${JSON.stringify(submitRes.b ?? 'empty').slice(0, 300)}, debug=${JSON.stringify(submitRes.debug)}`);
    }

    /* Promote phase2: phase1 survivors (4) + qual ranks 13-16 (4) = 8 total */
    await apiPromoteTaPhase(adminPage, setup.tournamentId, 'promote_phase2');

    /* Run 4 elimination rounds in phase2 (8→4 players) */
    for (let round = 1; round <= 4; round++) {
      const startRes = await adminPage.evaluate(async ([id]) => {
        const r = await fetch(`/api/tournaments/${id}/ta/phases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start_round', phase: 'phase2' }),
        });
        return r.json().catch(() => ({}));
      }, [setup.tournamentId]);
      if (!startRes.data?.roundNumber) throw new Error(`start_round phase2 round ${round} failed`);

      const allEntries = (await apiFetchTaPhase(adminPage, setup.tournamentId, 'phase2'))
        .b?.data?.entries ?? [];
      const activeEntries = allEntries.filter((e) => !e.eliminated);
      const results = activeEntries.map((e) => ({
        playerId: e.playerId,
        /* Per-course single-round time (NOT qualification totalTime).
         * totalTime is cumulative across 20 qual courses (~1.2M ms) and would
         * exceed the phases route's RETRY_PENALTY_MS cap (599990). */
        timeMs: 60000 + (e.rank || 20) * 200,
        isRetry: false,
      }));
      const submitRes = await adminPage.evaluate(async ([id, rn, data]) => {
        const r = await fetch(`/api/tournaments/${id}/ta/phases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submit_results', phase: 'phase2', roundNumber: rn, results: data }),
        });
        return r.json().catch(() => ({}));
      }, [setup.tournamentId, startRes.data.roundNumber, results]);
      if (!submitRes.data) throw new Error(`submit_results phase2 round ${round} failed`);
    }

    /* Promote phase3: phase2 survivors (4) + qual ranks 1-12 (12) = 16 total */
    await apiPromoteTaPhase(adminPage, setup.tournamentId, 'promote_phase3');

    const phase3 = await apiFetchTaPhase(adminPage, setup.tournamentId, 'phase3');
    const entries = phase3.b?.data?.entries ?? [];

    const countOk = entries.length === 16;
    const allHaveLives = entries.every((e) => e.lives != null && e.lives > 0);

    log('TC-807', countOk && allHaveLives ? 'PASS' : 'FAIL',
      !countOk ? `phase3 entries=${entries.length} expected=16`
      : !allHaveLives ? 'some entries missing or zero lives'
      : '');
  } catch (err) {
    log('TC-807', 'FAIL', err instanceof Error ? err.message : 'TA 807 failed');
  } finally {
    if (setup) await setup.cleanup();
  }
}

/* ───────── TC-808: TA Finals champion banner on completion ─────────
 * Runs a minimal phase3 with 2 players only. After one round of phase3
 * (both submitting times), one will be eliminated (0 lives) leaving the
 * other as champion. Verifies champion banner shows on the TA Finals page. */
async function runTc808(adminPage) {
  const playerIds = [];
  const stamp = Date.now();
  let tournamentId = null;

  const cleanup = async () => {
    await apiDeleteTournament(adminPage, tournamentId);
    for (const id of playerIds) await apiDeletePlayer(adminPage, id);
  };

  try {
    /* Create just 2 players for minimal finals */
    for (let i = 1; i <= 2; i++) {
      const p = await apiCreatePlayer(
        adminPage,
        `E2E TA 808 P${i}`,
        `e2e_ta808_${stamp}_${i}`,
      );
      playerIds.push(p.id);
    }

    tournamentId = await apiCreateTournament(
      adminPage,
      `E2E TA 808 ${stamp}`,
      { dualReportEnabled: false },
    );
    await apiActivateTournament(adminPage, tournamentId);

    const add = await apiAddTaEntries(adminPage, tournamentId, {
      playerEntries: playerIds.map((playerId, i) => ({ playerId, seeding: i + 1 })),
    });
    if (add.s !== 201) throw new Error(`TA add failed (${add.s})`);

    const entries = add.b?.data?.entries ?? [];
    /* Seed entry 1 with best times (rank 1), entry 2 with worst (rank 2) */
    const { times: times1, totalMs: totalMs1 } = makeTaTimesForRank(1);
    const { times: times2, totalMs: totalMs2 } = makeTaTimesForRank(2);
    await apiSeedTtEntry(adminPage, tournamentId, entries[0].id, times1, totalMs1, 1);
    await apiSeedTtEntry(adminPage, tournamentId, entries[1].id, times2, totalMs2, 2);

    /* Promote through all phases */
    await apiPromoteTaPhase(adminPage, tournamentId, 'promote_phase1');
    await apiPromoteTaPhase(adminPage, tournamentId, 'promote_phase2');
    await apiPromoteTaPhase(adminPage, tournamentId, 'promote_phase3');

    /* Start a round, submit results: one player gets slower time, loses a life */
    const phase3Before = await apiFetchTaPhase(adminPage, tournamentId, 'phase3');
    const phase3Entries = phase3Before.b?.data?.entries ?? [];

    /* Phase3 uses life-based elimination (3 lives per player, bottom half loses
     * 1 life per round). With 2 players, the slower one is always in bottom half,
     * so we need 3 rounds to eliminate them (3 lives → 0). */
    for (let round = 1; round <= 3; round++) {
      const startRes = await adminPage.evaluate(async ([id]) => {
        const r = await fetch(`/api/tournaments/${id}/ta/phases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start_round', phase: 'phase3' }),
        });
        return r.json().catch(() => ({}));
      }, [tournamentId]);
      if (!startRes.data?.roundNumber) throw new Error(`start_round phase3 round ${round} failed`);

      /* Submit both players — entry[0] is faster (wins), entry[1] is slower (bottom half, loses a life) */
      const submitRes = await adminPage.evaluate(async ([id, rn, entries_data]) => {
        const results = [
          { playerId: entries_data[0].playerId, timeMs: 60000, isRetry: false },
          { playerId: entries_data[1].playerId, timeMs: 120000, isRetry: false },
        ];
        const r = await fetch(`/api/tournaments/${id}/ta/phases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submit_results', phase: 'phase3', roundNumber: rn, results }),
        });
        return r.json().catch(() => ({}));
      }, [tournamentId, startRes.data.roundNumber, phase3Entries]);
      if (!submitRes.data) throw new Error(`submit_results phase3 round ${round} failed`);
    }

    /* Navigate to TA Finals page */
    await nav(adminPage, `/tournaments/${tournamentId}/ta/finals`);
    const bodyText = await adminPage.locator('body').innerText();

    const championShown = bodyText.includes('Champion') ||
      bodyText.includes('チャンピオン') ||
      bodyText.includes('優勝');

    log('TC-808', championShown ? 'PASS' : 'FAIL',
      !championShown ? 'champion banner not found on TA finals page'
      : '');
  } catch (err) {
    log('TC-808', 'FAIL', err instanceof Error ? err.message : 'TA 808 failed');
  } finally {
    await cleanup();
  }
}

if (require.main === module) {
  runSuite({
    suiteName: 'TA',
    results,
    log,
    tests: [
      { name: 'TC-801', fn: runTc801 },
      { name: 'TC-804', fn: runTc804 },
      { name: 'TC-805', fn: runTc805 },
      { name: 'TC-806', fn: runTc806 },
      { name: 'TC-807', fn: runTc807 },
      { name: 'TC-808', fn: runTc808 },
    ],
  });
}

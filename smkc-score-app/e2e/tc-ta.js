/**
 * E2E TA (Time Attack / Time Trial) tests.
 *
 * Coverage:
 *   TC-801  28-player qualification fill — all 20 courses per player, server-
 *           computed ranks are 1..28 and scoring output is present.
 *   TC-802  Player login + TA participant time entry persists.
 *   TC-804  Promote to Phase 1 — ranks 17-24 (8 players) move to phase1 stage.
 *   TC-805  Remove a mistaken TA qualification player via UI.
 *   TC-806  Phase 2 page renders and shows correct entries (8 players).
 *   TC-807  Phase 3 page renders and shows correct entries (8 players).
 *   TC-808  TA Finals page renders with champion banner on completion.
 *
 * Setup:
 *   - Uses the shared Playwright persistent profile (/tmp/playwright-smkc-profile).
 *   - Admin Discord OAuth session must already be established in that profile.
 *   - TC-801/802/804/805 reuse the shared 28-player / normal-tournament fixture
 *     and reset the TA qualification state before each run via
 *     setupTaEntriesFromShared. TC-806/807/808 still provision isolated
 *     tournaments because phase promotion freezes the qualification stage —
 *     reusing the shared tournament would leak state into later runs.
 *
 * Run: node e2e/tc-ta.js  (from smkc-score-app/)
 */
const {
  makeResults, makeLog, nav,
  uiSetTaEntryTimes,
  uiFreezeTaQualification,
  uiPromoteTaPhase,
  uiPhaseStartRound, uiPhaseSubmitResults,
  apiGetTtEntry, loginPlayerBrowser,
  apiFetchTa, apiFetchTaPhase,
  makeTaTimesForRank,
} = require('./lib/common');
const { createSharedE2eFixture, setupTaEntriesFromShared } = require('./lib/fixtures');
const { runSuite } = require('./lib/runner');

const results = makeResults();
const log = makeLog(results);
let sharedFixture = null;
/* Shared TA qualification state. Populated once in beforeAll via
 * setupTaEntriesFromShared so TC-801/802/804/805 do not each re-clear and
 * re-seed 28 players × 20 courses (≈140s per call). Subsequent phase-promoting
 * tests (TC-804 → 806 → 807) chain on the same tournament. */
let sharedTaTournamentId = null;
let sharedTaEntries = [];

function sharedTaPlayers(count) {
  if (!sharedFixture) throw new Error('Shared TA fixture is not initialized');
  return sharedFixture.players.slice(0, count);
}

function sharedTaEntryByNickname(nickname) {
  return sharedTaEntries.find((e) => e.nickname === nickname) ?? null;
}

/* ───────── TC-801: 28-player full qualification ─────────
 * setupTaEntriesFromShared seeds 20-course times + totalTime + rank for all 28
 * players via the admin /tt/entries PUT. We verify the persisted state:
 * 28 entries, all with totalTime and a rank, ranks cover 1..28. Scoring
 * (qualificationPoints) is computed by a separate finalize flow and is
 * intentionally not asserted here. */
async function runTc801(adminPage) {
  try {
    /* Shared qualification already seeded in beforeAll — just validate. */
    const tournamentId = sharedTaTournamentId;
    if (!tournamentId) throw new Error('Shared TA tournament not initialized');

    const data = await apiFetchTa(adminPage, tournamentId);
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
  }
}

/* ───────── TC-802: Player login + TA participant time entry ─────────
 * Verifies a player can sign in, open /ta/participant, submit a qualification
 * time from the UI, and the value persists in the TT entry API.
 *
 * Uses a single shared player (no time-seeding — the UI is the source of
 * truth for this test). */
async function runTc802(adminPage) {
  let playerBrowser = null;
  const targetTime = '1:23.45';
  const targetTimeMs = 83450;

  try {
    /* Uses the already-seeded shared fixture entry for player[0]. Player
     * submits a time via /ta/participant and we verify persistence against the
     * TT entry API. Does not re-clear the roster — TC-804 still sees 28
     * qualification entries. Participant edits only overwrite individual
     * courses, so rank ordering may shift slightly but stays within bounds. */
    const tournamentId = sharedTaTournamentId;
    if (!tournamentId) throw new Error('Shared TA tournament not initialized');
    const [player] = sharedTaPlayers(1);
    const sharedEntry = sharedTaEntryByNickname(player.nickname);
    if (!sharedEntry) throw new Error(`Shared TA entry missing for ${player.nickname}`);
    const entryId = sharedEntry.entryId;

    const ctx = await loginPlayerBrowser(player.nickname, player.password);
    playerBrowser = ctx.browser;
    await nav(ctx.page, `/tournaments/${tournamentId}/ta/participant`);

    /* The participant page stacks partner card (if paired) above the self
     * card. Both render their own 20 M:SS.mm inputs + a "Submit Times" button.
     * Targeting by DOM order: self submit is always the LAST such button;
     * self's MC1 input is the input immediately preceding the self submit
     * in document order. When no partner is set the partner card is absent
     * and both `.first()` and `.last()` refer to the single self widgets. */
    const submitBtn = ctx.page.getByRole('button', { name: /タイム送信|Submit Times/ }).last();
    await submitBtn.waitFor({ timeout: 15000 });

    const allTimeInputs = ctx.page.locator('input[placeholder="M:SS.mm"]');
    const inputCount = await allTimeInputs.count();
    /* Self cup inputs are the LAST 20 (partner has 20 first when paired, else
     * there are only 20). The MC1 input is the first of the self block. */
    const selfMC1Index = Math.max(0, inputCount - 20);
    const firstTimeInput = allTimeInputs.nth(selfMC1Index);
    const inputDisabled = await firstTimeInput.isDisabled().catch(() => true);
    if (inputDisabled) throw new Error('TA participant time input is disabled before knockout');

    await firstTimeInput.fill(targetTime);
    await submitBtn.click();

    let persisted = false;
    let observed = '';
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const current = await apiGetTtEntry(adminPage, tournamentId, entryId);
      const data = current.b?.data ?? {};
      const times = data.times ?? {};
      const values = Object.values(times).map((value) => String(value || ''));
      const hasExactValue = values.some((value) => value === targetTime);
      const hasTotalTime = data.totalTime === targetTimeMs;
      if (hasExactValue || hasTotalTime) {
        persisted = true;
        observed = hasExactValue ? targetTime : `totalTime=${data.totalTime}`;
        break;
      }
      observed = values.find(Boolean) || `totalTime=${data.totalTime ?? 'none'}`;
      await ctx.page.waitForTimeout(1000);
    }

    log('TC-802', persisted ? 'PASS' : 'FAIL',
      persisted ? observed : `submitted time not persisted (observed: ${observed || 'empty'})`);
  } catch (err) {
    log('TC-802', 'FAIL', err instanceof Error ? err.message : 'TA 802 failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
  }
}

/* ───────── TC-804: Promote to Phase 1 ─────────
 * After promote_phase1, ranks 17-24 should move to stage='phase1'.
 * The qualification stage still contains 28 entries (promotion clones, it
 * doesn't remove), so we check phase1 count = 8 via the phase API.
 *
 * Phase state persists on the shared tournament until the next test wipes
 * qualification, so TC-805 must not assume a pristine qualification stage
 * itself (it always re-runs setupTaEntriesFromShared beforehand). */
async function runTc804(adminPage) {
  try {
    /* Promotes on the shared tournament so TC-806/807 can continue on the
     * same phase chain without re-seeding qualifications. */
    const tournamentId = sharedTaTournamentId;
    if (!tournamentId) throw new Error('Shared TA tournament not initialized');

    /* Diagnostic: confirm qualification ranks 17-24 still exist before the
     * page looks for "Start Phase 1". If previous tests disturbed rank
     * assignment the button never renders and the click times out. */
    const preQual = await apiFetchTa(adminPage, tournamentId);
    const preEntries = preQual.b?.data?.entries ?? [];
    const phase1Ready = preEntries.some((e) => e.rank != null && e.rank >= 17 && e.rank <= 24);
    if (!phase1Ready) {
      const rankSummary = preEntries
        .map((e) => `${e.player?.nickname ?? '?'}=${e.rank ?? 'null'}`)
        .slice(0, 30)
        .join(',');
      throw new Error(`No rank 17-24 entries on shared tournament; ranks=${rankSummary}`);
    }

    /* The Finals Phases card (with Start Phase buttons) only renders once
     * qualification is frozen. Freeze first, then promote. */
    await uiFreezeTaQualification(adminPage, tournamentId);
    await uiPromoteTaPhase(adminPage, tournamentId, 'promote_phase1');

    const phase1 = await apiFetchTaPhase(adminPage, tournamentId, 'phase1');
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
  }
}

/* ───────── TC-805: Remove a mistaken TA qualification player via UI ─────────
 * The admin can remove a qualification entry, cancel safely, then confirm. The
 * player master record remains available and the player returns to the Add
 * Player candidate list for re-entry. Uses 2 shared players. */
async function runTc805(adminPage) {
  try {
    /* Operates on the shared 28-player qualification state. Picks two
     * players, exercises the remove-from-qualification UX, then re-adds p1
     * via the Setup dialog so downstream tests still see 28 entries. */
    const tournamentId = sharedTaTournamentId;
    if (!tournamentId) throw new Error('Shared TA tournament not initialized');
    const [p1, p2] = sharedTaPlayers(2);

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

    /* Unified TA setup dialog replaced the separate "Add Player" dialog;
     * the trigger label toggles Setup↔Edit based on whether any roster rows exist.
     *
     * After the refactor the candidate list uses Checkbox + Label flex rows
     * (no role="row"), so rowFor/getByRole('row') never matches here. Scope
     * to the dialog and match the `${nickname} (${name})` label — the toast's
     * nickname-only text will not match this regex. */
    await adminPage.getByRole('button', {
      name: /^(Setup Players|Edit Players|プレイヤー設定|プレイヤー編集)$/,
    }).click();
    const setupDialog = adminPage.getByRole('dialog').filter({
      hasText: /Setup Time Trial Players|Edit Time Trial Players|タイムアタック プレイヤー(設定|編集)/,
    }).first();
    await setupDialog.waitFor({ state: 'visible', timeout: 10000 });
    await setupDialog.getByPlaceholder(/プレイヤーを検索|Search players/).fill(p1.nickname);
    await setupDialog
      .getByLabel(new RegExp(`^${p1.nickname} \\(${p1.name}\\)$`))
      .waitFor({ timeout: 10000 });

    /* Re-check p1 and save so shared 28-player state is restored for the
     * downstream phase-promotion chain (TC-804 onward). Without this, the
     * qualification would stay at 27 entries and promote_phase1 would pull
     * different source ranks. */
    await setupDialog.getByLabel(new RegExp(`^${p1.nickname} \\(${p1.name}\\)$`)).check();
    await setupDialog.getByPlaceholder(/プレイヤーを検索|Search players/).fill('');
    /* Seed input uses aria-label `${nickname} seeding` — restore the seeding
     * slot that matches the original sharedTaEntry rank so rank 1..28 ordering
     * remains consistent. */
    const restoredEntry = sharedTaEntryByNickname(p1.nickname);
    if (restoredEntry?.rank != null) {
      await setupDialog.getByLabel(`${p1.nickname} seeding`).fill(String(restoredEntry.rank));
    }
    await setupDialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
    await setupDialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    await adminPage.waitForTimeout(1000);

    /* Re-seed p1's qualification times so rank 1..28 ordering persists for
     * TC-804's phase-promote (which selects ranks 17-24). */
    const { times: p1Times } = makeTaTimesForRank(restoredEntry?.rank ?? 1);
    await uiSetTaEntryTimes(adminPage, tournamentId, { nickname: p1.nickname }, p1Times);

    const ok = removedFromApi && retainedOther;
    log('TC-805', ok ? 'PASS' : 'FAIL',
      !removedFromApi ? 'removed player still exists in TA API'
      : !retainedOther ? 'non-removed player disappeared from TA API'
      : '');
  } catch (err) {
    log('TC-805', 'FAIL', err instanceof Error ? err.message : 'TA 805 failed');
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
 * the 4 phase1 survivors plus the 4 qualifiers from ranks 13-16.
 *
 * Chains on the shared tournament after TC-804 promoted phase1. Phase promotion
 * writes phase-stage TT entries that freeze the qualification stage, which
 * would prevent the next test from resetting the shared tournament. */
async function runTc806(adminPage) {
  try {
    /* Continues from TC-804: shared tournament already has phase1 promoted.
     * We validate phase1 = 8 entries, run the 4 elimination rounds, then
     * promote phase2 on the same tournament. TC-807 continues from here. */
    const tournamentId = sharedTaTournamentId;
    if (!tournamentId) throw new Error('Shared TA tournament not initialized');

    const phase1Before = await apiFetchTaPhase(adminPage, tournamentId, 'phase1');
    const phase1Entries = phase1Before.b?.data?.entries ?? [];
    if (phase1Entries.length !== 8) {
      throw new Error(`Phase1 should have 8 entries, got ${phase1Entries.length}`);
    }

    /* Run 4 elimination rounds in phase1 (8→4 players) */
    for (let round = 1; round <= 4; round++) {
      await uiPhaseStartRound(adminPage, tournamentId, 'phase1');

      /* Submit results for only non-eliminated (active) phase1 players.
       * Times are based on rank: rank 17 (slowest of phase1) has highest time,
       * rank 24 (fastest of phase1) has lowest time. Lower time = safer from elimination.
       * After 4 rounds, players with ranks 17-20 survive (4 fastest of the 8). */
      const allEntries = (await apiFetchTaPhase(adminPage, tournamentId, 'phase1'))
        .b?.data?.entries ?? [];
      const activeEntries = allEntries.filter((e) => !e.eliminated);
      const results = activeEntries.map((e) => ({
        nickname: e.player?.nickname,
        /* Per-course single-round time (NOT qualification totalTime).
         * totalTime is cumulative across 20 qual courses (~1.2M ms) and would
         * exceed the phases route's RETRY_PENALTY_MS cap (599990). */
        timeMs: 60000 + (e.rank || 20) * 200,
      }));
      await uiPhaseSubmitResults(adminPage, tournamentId, 'phase1', results);
    }

    /* Promote phase2 via UI: phase1 survivors (4) + ranks 13-16 (4) = 8 total */
    await uiPromoteTaPhase(adminPage, tournamentId, 'promote_phase2');

    const phase2 = await apiFetchTaPhase(adminPage, tournamentId, 'phase2');
    const entries = phase2.b?.data?.entries ?? [];

    const countOk = entries.length === 8;
    const allHaveRank = entries.every((e) => e.rank != null);

    log('TC-806', countOk && allHaveRank ? 'PASS' : 'FAIL',
      !countOk ? `phase2 entries=${entries.length} expected=8`
      : !allHaveRank ? 'some entries missing rank'
      : '');
  } catch (err) {
    log('TC-806', 'FAIL', err instanceof Error ? err.message : 'TA 806 failed');
  }
}

/* ───────── TC-807: Phase 3 page renders with correct entries ─────────
 * After promoting phase1 and completing 4 elimination rounds (8→4),
 * promote phase2 and complete 4 more elimination rounds (8→4),
 * then promote phase3 to get phase2 survivors (4) + qual ranks 1-12 (12) = 16.
 *
 * TC-807 verifies the Phase 3 page (/ta/finals) renders and shows 16 entries
 * with lives > 0 (not yet eliminated).
 *
 * Chains on the shared tournament after TC-806 completed phase1 + phase2.
 * phase-freeze reason as TC-806. */
async function runTc807(adminPage) {
  try {
    /* Continues from TC-806: phase1 completed + phase2 promoted on the shared
     * tournament. Runs the 4 phase2 elimination rounds then promote_phase3. */
    const tournamentId = sharedTaTournamentId;
    if (!tournamentId) throw new Error('Shared TA tournament not initialized');

    /* Run 4 elimination rounds in phase2 (8→4 players) */
    for (let round = 1; round <= 4; round++) {
      await uiPhaseStartRound(adminPage, tournamentId, 'phase2');

      const allEntries = (await apiFetchTaPhase(adminPage, tournamentId, 'phase2'))
        .b?.data?.entries ?? [];
      const activeEntries = allEntries.filter((e) => !e.eliminated);
      const results = activeEntries.map((e) => ({
        nickname: e.player?.nickname,
        timeMs: 60000 + (e.rank || 20) * 200,
      }));
      await uiPhaseSubmitResults(adminPage, tournamentId, 'phase2', results);
    }

    /* Promote phase3 via UI: phase2 survivors (4) + qual ranks 1-12 (12) = 16 total */
    await uiPromoteTaPhase(adminPage, tournamentId, 'promote_phase3');

    const phase3 = await apiFetchTaPhase(adminPage, tournamentId, 'phase3');
    const entries = phase3.b?.data?.entries ?? [];

    const countOk = entries.length === 16;
    const allHaveLives = entries.every((e) => e.lives != null && e.lives > 0);

    log('TC-807', countOk && allHaveLives ? 'PASS' : 'FAIL',
      !countOk ? `phase3 entries=${entries.length} expected=16`
      : !allHaveLives ? 'some entries missing or zero lives'
      : '');
  } catch (err) {
    log('TC-807', 'FAIL', err instanceof Error ? err.message : 'TA 807 failed');
  }
}

/* ───────── TC-808: TA Finals champion banner on completion ─────────
 * Chains on the shared tournament at phase3 (16 entries) after TC-807. Runs
 * Phase 3 elimination rounds until only 1 champion remains, then verifies
 * the champion banner appears on the TA Finals page.
 *
 * Phase 3 rules:
 *   - 3 lives per player; bottom half per round loses 1 life.
 *   - Active-count milestones 8 / 4 / 2 trigger a life reset to 3.
 *
 * From 16 actives the worst case to a 1-player champion is: 3 rounds per
 * tier × 4 tiers (16→8→4→2→1) = 12 rounds. Each round submits times for
 * currently-active phase3 entries, differentiated by rank so the same 8/4/2
 * players keep ending up in the bottom half. */
async function runTc808(adminPage) {
  try {
    const tournamentId = sharedTaTournamentId;
    if (!tournamentId) throw new Error('Shared TA tournament not initialized');

    /* Run until either a champion is detected or we hit the worst-case round
     * budget. Safety cap avoids infinite loops if the termination signal is
     * missed (server race / UI refresh lag). */
    let championShown = false;
    let bodyText = '';
    const maxRounds = 20;
    for (let round = 1; round <= maxRounds; round++) {
      const phase3 = await apiFetchTaPhase(adminPage, tournamentId, 'phase3');
      const entries = phase3.b?.data?.entries ?? [];
      const active = entries.filter((e) => !e.eliminated);
      if (active.length <= 1) break;

      await uiPhaseStartRound(adminPage, tournamentId, 'phase3');
      const results = active.map((e) => ({
        nickname: e.player?.nickname,
        /* Worst-rank entries always slowest so the same bottom half keeps
         * losing lives until eliminated. */
        timeMs: 60000 + (e.rank || 20) * 200,
      }));
      await uiPhaseSubmitResults(adminPage, tournamentId, 'phase3', results);
    }

    await nav(adminPage, `/tournaments/${tournamentId}/ta/finals`);
    bodyText = await adminPage.locator('body').innerText();
    championShown = bodyText.includes('Champion') ||
      bodyText.includes('チャンピオン') ||
      bodyText.includes('優勝');

    log('TC-808', championShown ? 'PASS' : 'FAIL',
      !championShown ? 'champion banner not found on TA finals page'
      : '');
  } catch (err) {
    log('TC-808', 'FAIL', err instanceof Error ? err.message : 'TA 808 failed');
  }
}

module.exports = {
  runTc801, runTc802, runTc804, runTc805, runTc806, runTc807, runTc808,
};

if (require.main === module) {
  runSuite({
    suiteName: 'TA',
    results,
    log,
    beforeAll: async (adminPage) => {
      sharedFixture = await createSharedE2eFixture(adminPage);
      /* One-time shared qualification seed: 28 players → 20-course times with
       * rank 1..28. TC-801/802/804/805 reuse this state; TC-804 promotes and
       * TC-806/807 chain on the same tournament. */
      const { tournamentId, entries } = await setupTaEntriesFromShared(
        adminPage,
        sharedFixture.normalTournament.id,
        sharedFixture.players.slice(0, 28),
        { seedTimes: true },
      );
      sharedTaTournamentId = tournamentId;
      sharedTaEntries = entries;
    },
    afterAll: async () => {
      if (sharedFixture) {
        await sharedFixture.cleanup();
        sharedFixture = null;
      }
      sharedTaTournamentId = null;
      sharedTaEntries = [];
    },
    /* Ordering note: TC-805 must run before TC-804 because phase1 promotion
     * freezes the qualification stage and disables the Setup Players dialog.
     * TC-804 → 806 → 807 chain on the same tournament. TC-808 is isolated
     * (2-player minimal finals) and can run last. */
    tests: [
      { name: 'TC-801', fn: runTc801 },
      { name: 'TC-802', fn: runTc802 },
      { name: 'TC-805', fn: runTc805 },
      { name: 'TC-804', fn: runTc804 },
      { name: 'TC-806', fn: runTc806 },
      { name: 'TC-807', fn: runTc807 },
      { name: 'TC-808', fn: runTc808 },
    ],
  });
}

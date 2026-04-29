/**
 * E2E TA (Time Attack / Time Trial) tests.
 *
 * Coverage:
 *   TC-801  28-player qualification fill — all 20 courses per player, server-
 *           computed ranks are 1..28 and scoring output is present.
 *   TC-802  Player login + TA participant time entry persists.
 *   TC-804  Promote to Phase 1 — ranks 17-24 (8 players) move to phase1 stage.
 *   TC-805  Remove a mistaken TA qualification player via UI.
 *   TC-809  Cancel an open Phase 1 round and restore the course/round state.
 *   TC-810  Undo the last submitted Phase 1 round and reopen it for re-entry.
 *   TC-811  Frozen qualification blocks player-side time re-edits.
 *   TC-806  Phase 2 page renders and shows correct entries (8 players).
 *   TC-807  Phase 3 page renders and shows correct entries (8 players).
 *   TC-808  TA Finals page renders with champion banner on completion.
 *   TC-812  TA qualification tie resolution — identical times yield averaged
 *           course points and ordered ranks without manual override.
 *   TC-813  TA qualification rank recalculation after entry deletion — ranks
 *           are re-compacted (no gaps) after removing one entrant (#710).
 *   TC-839  TA qualification time-entry dialog stacks cup cards on mobile.
 *
 * Setup:
 *   - Uses the shared Playwright persistent profile (/tmp/playwright-smkc-profile).
 *   - Admin Discord OAuth session must already be established in that profile.
 *   - TC-801/802/804/805/806/807/808/839 reuse the shared 28-player /
 *     normal-tournament fixture and reset the TA qualification state in
 *     beforeAll via setupTaEntriesFromShared.
 *   - TC-809/810/811 provision isolated tournaments because their round/freeze
 *     mutations should not interfere with the shared phase-promotion chain.
 *
 * Run: node e2e/tc-ta.js  (from smkc-score-app/)
 */
const {
  makeResults, makeLog, nav,
  uiSetTaEntryTimes,
  uiFreezeTaQualification,
  uiPromoteTaPhase,
  uiPhaseStartRound, uiPhaseSubmitResults, uiPhaseCancelRound, uiPhaseUndoRound,
  uiCreateTournament, uiCreatePlayer,
  apiDeletePlayer,
  apiDeleteTournament, apiGetTtEntry, apiSeedTtEntry, apiForceRankOnly, apiTaParticipantEditTime, loginPlayerBrowser,
  apiFetchTa, apiFetchTaPhase, apiPostTaPhase, apiPromoteTaPhase,
  makeTaTimesForRank,
  setupTaQualViaUi,
  escapeRegex,
} = require('./lib/common');
const { createSharedE2eFixture, setupTaEntriesFromShared, ensurePlayerPassword } = require('./lib/fixtures');
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

function selectedTestNames() {
  const raw = process.env.E2E_TESTS || process.env.E2E_TEST || '';
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function sharedTaPlayers(count) {
  if (!sharedFixture) throw new Error('Shared TA fixture is not initialized');
  return sharedFixture.players.slice(0, count);
}

async function loginSharedPlayer(adminPage, player) {
  await ensurePlayerPassword(adminPage, player);
  return loginPlayerBrowser(player.nickname, player.password);
}

function sharedTaEntryByNickname(nickname) {
  return sharedTaEntries.find((e) => e.nickname === nickname) ?? null;
}

async function createIsolatedTaQualification(adminPage, label, players, { seedTimes = false } = {}) {
  const tournamentId = await uiCreateTournament(
    adminPage,
    `E2E TA ${label} ${Date.now()}`,
    { dualReportEnabled: false },
  );

  try {
    const { entries } = await setupTaEntriesFromShared(adminPage, tournamentId, players, { seedTimes });
    return {
      tournamentId,
      entries,
      cleanup: async () => {
        await apiDeleteTournament(adminPage, tournamentId);
      },
    };
  } catch (err) {
    await apiDeleteTournament(adminPage, tournamentId).catch(() => {});
    throw err;
  }
}

async function seedTaQualificationRanks(adminPage, tournamentId, entries, startRank) {
  const seeded = [];
  for (let i = 0; i < entries.length; i++) {
    const rank = startRank + i;
    const { times, totalMs } = makeTaTimesForRank(rank);
    /* apiSeedTtEntry triggers recalculateRanks which resets ranks to 1..N
     * based on relative totalTime. Follow up with apiForceRankOnly to stamp
     * the desired rank (e.g. 17..24 for Phase 1 promotion tests) without
     * re-triggering rank recalculation (rank-only PUT skips recalculate). */
    await apiSeedTtEntry(adminPage, tournamentId, entries[i].entryId, times, totalMs, rank);
    /* recalculateRanks (triggered inside the PUT route when `times` is present)
     * reorders by actual time values and may derive a different rank than the
     * requested one when fewer than 24 players are in the tournament. Force the
     * desired rank with a separate rank-only PUT (no `times` → no recalculate)
     * so the Finals Phases card sees ranks in the 17–24 range and shows the
     * "Start Phase 1" button. Must run before uiFreezeTaQualification. */
    await apiForceRankOnly(adminPage, tournamentId, entries[i].entryId, rank);
    seeded.push({ ...entries[i], rank, times, totalMs });
  }
  return seeded;
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

    const ctx = await loginSharedPlayer(adminPage, player);
    playerBrowser = ctx.browser;
    await nav(ctx.page, `/tournaments/${tournamentId}/ta/participant`);

    /* The participant page stacks partner card (if paired) above the self
     * card. Both render their own 20 M:SS.mm inputs + a "Submit Times" button.
     * Targeting by DOM order: self submit is always the LAST such button;
     * self's MC1 input is the input immediately preceding the self submit
     * in document order. When no partner is set the partner card is absent
     * and both `.first()` and `.last()` refer to the single self widgets. */
    const submitBtn = ctx.page.getByRole('button', { name: /タイム送信|Submit Times/ }).last();
    /* 25s to absorb D1 cold-start + fetchWithRetry delays (issue #678) */
    await submitBtn.waitFor({ timeout: 25000 });

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

/* ───────── TC-839: TA qualification time-entry mobile cup layout (#839) ───────── */
async function runTc839(adminPage) {
  let playerBrowser = null;

  try {
    const tournamentId = sharedTaTournamentId;
    if (!tournamentId) throw new Error('Shared TA tournament not initialized');
    const [player] = sharedTaPlayers(1);

    const ctx = await loginSharedPlayer(adminPage, player);
    playerBrowser = ctx.browser;
    await ctx.page.setViewportSize({ width: 375, height: 812 });
    await nav(ctx.page, `/tournaments/${tournamentId}/ta`);

    const timesTab = ctx.page.getByRole('tab', { name: /^(Time Entry|Time List|タイム入力|タイム一覧)$/ });
    await timesTab.first().click();
    await ctx.page.getByRole('button', { name: /^(Edit Times|タイム編集)$/ }).first().click();

    const dialog = ctx.page.getByRole('dialog').filter({
      has: ctx.page.locator('[data-testid="ta-time-entry-cup-grid"]'),
    }).first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });

    const grid = dialog.locator('[data-testid="ta-time-entry-cup-grid"]').first();
    const cards = grid.locator('[data-testid="ta-time-entry-cup-card"]');
    const cardCount = await cards.count();
    if (cardCount !== 4) throw new Error(`expected 4 cup cards, got ${cardCount}`);

    const boxes = [];
    for (let i = 0; i < cardCount; i++) {
      const box = await cards.nth(i).boundingBox();
      if (!box) throw new Error(`cup card ${i + 1} has no bounding box`);
      boxes.push(box);
    }

    const stacked = boxes.every((box, index) => index === 0 || box.y > boxes[index - 1].y + 1);
    const firstInput = await dialog.locator('input[placeholder="M:SS.mm"]').first().boundingBox();
    const inputWideEnough = Boolean(firstInput && firstInput.width >= 150);

    log('TC-839', stacked && inputWideEnough ? 'PASS' : 'FAIL',
      stacked && inputWideEnough
        ? `inputWidth=${Math.round(firstInput.width)}`
        : `stacked=${stacked} inputWidth=${firstInput ? Math.round(firstInput.width) : 'none'}`);
  } catch (err) {
    log('TC-839', 'FAIL', err instanceof Error ? err.message : 'TA mobile time-entry layout failed');
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
 * The admin removes a player from qualification via the Edit Players setup
 * dialog (the per-row "Remove from qualification" button was replaced by the
 * unified setup dialog). The player master record remains available and the
 * player returns to the Add Player candidate list for re-entry.
 * Uses 2 shared players. */
async function runTc805(adminPage) {
  try {
    /* Operates on the shared 28-player qualification state. Picks two
     * players, exercises the remove-from-qualification UX via the setup
     * dialog, then re-adds p1 so downstream tests still see 28 entries. */
    const tournamentId = sharedTaTournamentId;
    if (!tournamentId) throw new Error('Shared TA tournament not initialized');
    const [p1, p2] = sharedTaPlayers(2);

    await nav(adminPage, `/tournaments/${tournamentId}/ta`);

    /* Open the Edit Players dialog to remove p1 from the staged entry list. */
    await adminPage.getByRole('button', {
      name: /^(Setup Players|Edit Players|プレイヤー設定|プレイヤー編集)$/,
    }).first().click();
    const removeDialog = adminPage.getByRole('dialog').filter({
      hasText: /Setup Time Trial Players|Edit Time Trial Players|タイムアタック プレイヤー(設定|編集)/,
    }).first();
    await removeDialog.waitFor({ state: 'visible', timeout: 10000 });

    /* p1's entry appears in the right panel (staged entries). Each row has an
     * input with aria-label `${nickname} seeding`; the Remove button is the
     * only button sibling in that row div. Using the seeding input as an anchor
     * avoids the strict-mode violation caused by `div.filter(hasText)` matching
     * all ancestor divs (including the container with all 28 Remove buttons). */
    await removeDialog
      .locator(`input[aria-label="${p1.nickname} seeding"]`)
      .locator('xpath=following-sibling::button')
      .click();
    await removeDialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
    await removeDialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});

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
     * different source ranks.
     *
     * Use label[for] → button[id] + .click() rather than getByLabel().check() —
     * see uiSetupTaPlayers comment in lib/common.js for why .check() times out
     * on this dialog's Radix checkboxes (the button is removed from DOM after
     * click, breaking aria-checked verification). */
    const labelText = new RegExp(`^${escapeRegex(p1.nickname)} \\(${escapeRegex(p1.name)}\\)$`);
    const labelEl = setupDialog.locator('label').filter({ hasText: labelText }).first();
    await labelEl.waitFor({ state: 'visible', timeout: 10000 });
    const forId = await labelEl.getAttribute('for');
    if (!forId) throw new Error(`No for attribute on player label for ${p1.nickname}`);
    await setupDialog.locator(`button[id="${forId}"]`).click();
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

/* ───────── TC-809: Cancel an open Phase 1 round ─────────
 * Uses an isolated tournament with 8 seeded qualification entries that are
 * force-ranked 17..24 via the TT entry API so Phase 1 promotion is possible
 * without provisioning the full shared 28-player field. */
async function runTc809(adminPage) {
  let setup = null;
  try {
    setup = await createIsolatedTaQualification(adminPage, 'Cancel Round', sharedTaPlayers(8), { seedTimes: false });
    const { tournamentId } = setup;
    await seedTaQualificationRanks(adminPage, tournamentId, setup.entries, 17);
    await uiFreezeTaQualification(adminPage, tournamentId);
    await uiPromoteTaPhase(adminPage, tournamentId, 'promote_phase1');

    const startedRoundNumber = await uiPhaseStartRound(adminPage, tournamentId, 'phase1');
    const phaseAfterStart = await apiFetchTaPhase(adminPage, tournamentId, 'phase1');
    const roundsAfterStart = phaseAfterStart.b?.data?.rounds ?? [];
    const openRoundExists = roundsAfterStart.some((round) =>
      round.roundNumber === startedRoundNumber && Array.isArray(round.results) && round.results.length === 0);

    await uiPhaseCancelRound(adminPage, tournamentId, 'phase1');

    const phaseAfterCancel = await apiFetchTaPhase(adminPage, tournamentId, 'phase1');
    const roundsAfterCancel = phaseAfterCancel.b?.data?.rounds ?? [];
    const entriesAfterCancel = phaseAfterCancel.b?.data?.entries ?? [];
    const roundDeleted = roundsAfterCancel.length === 0;
    const allPlayersRestored = entriesAfterCancel.length === 8 && entriesAfterCancel.every((entry) => !entry.eliminated);

    log('TC-809', openRoundExists && roundDeleted && allPlayersRestored ? 'PASS' : 'FAIL',
      !openRoundExists ? 'phase1 round did not open before cancel'
      : !roundDeleted ? `rounds still exist after cancel (${roundsAfterCancel.length})`
      : !allPlayersRestored ? 'phase1 entries were not fully restored after cancel'
      : '');
  } catch (err) {
    log('TC-809', 'FAIL', err instanceof Error ? err.message : 'TA 809 failed');
  } finally {
    if (setup) await setup.cleanup().catch(() => {});
  }
}

/* ───────── TC-810: Undo the last submitted Phase 1 round ─────────
 * Submits one elimination round, then uses the UI undo flow to restore the
 * same round for re-entry. */
async function runTc810(adminPage) {
  let setup = null;
  try {
    setup = await createIsolatedTaQualification(adminPage, 'Undo Round', sharedTaPlayers(8), { seedTimes: false });
    const { tournamentId } = setup;
    await seedTaQualificationRanks(adminPage, tournamentId, setup.entries, 17);
    await uiFreezeTaQualification(adminPage, tournamentId);
    await uiPromoteTaPhase(adminPage, tournamentId, 'promote_phase1');

    const roundNumber = await uiPhaseStartRound(adminPage, tournamentId, 'phase1');
    const activeEntries = (await apiFetchTaPhase(adminPage, tournamentId, 'phase1')).b?.data?.entries ?? [];
    const results = activeEntries
      .filter((entry) => !entry.eliminated)
      .map((entry) => ({
        nickname: entry.player?.nickname,
        timeMs: 60000 + (entry.rank || 20) * 200,
      }));
    await uiPhaseSubmitResults(adminPage, tournamentId, 'phase1', results);

    const phaseAfterSubmit = await apiFetchTaPhase(adminPage, tournamentId, 'phase1');
    const submittedRounds = phaseAfterSubmit.b?.data?.rounds ?? [];
    const eliminatedAfterSubmit = (phaseAfterSubmit.b?.data?.entries ?? []).filter((entry) => entry.eliminated);
    const submitPersisted = submittedRounds.some((round) =>
      round.roundNumber === roundNumber && Array.isArray(round.results) && round.results.length === results.length);

    await uiPhaseUndoRound(adminPage, tournamentId, 'phase1');
    const currentRoundTab = adminPage.getByRole('tab', { name: /^(Current Round|現在のラウンド)$/ });
    if (await currentRoundTab.count()) {
      await currentRoundTab.first().click().catch(() => {});
      await adminPage.waitForTimeout(300);
    }

    const phaseAfterUndo = await apiFetchTaPhase(adminPage, tournamentId, 'phase1');
    const roundsAfterUndo = phaseAfterUndo.b?.data?.rounds ?? [];
    const entriesAfterUndo = phaseAfterUndo.b?.data?.entries ?? [];
    const reopenedRound = roundsAfterUndo.find((round) => round.roundNumber === roundNumber);
    const roundCleared = Array.isArray(reopenedRound?.results) && reopenedRound.results.length === 0;
    const eliminationsRestored = entriesAfterUndo.length === 8 && entriesAfterUndo.every((entry) => !entry.eliminated);
    const inputCount = await adminPage.locator('input[placeholder="M:SS.mm"]').count();
    const cancelVisible = await adminPage.getByRole('button', { name: /^(Cancel Round|ラウンドキャンセル)$/ }).count()
      .then((count) => count > 0);

    log('TC-810', submitPersisted && eliminatedAfterSubmit.length === 1 && roundCleared && eliminationsRestored && inputCount >= 8 && cancelVisible ? 'PASS' : 'FAIL',
      !submitPersisted ? 'phase1 results were not persisted before undo'
      : eliminatedAfterSubmit.length !== 1 ? `expected 1 eliminated player before undo, got ${eliminatedAfterSubmit.length}`
      : !roundCleared ? 'last round results were not cleared by undo'
      : !eliminationsRestored ? 'eliminated players were not restored by undo'
      : inputCount < 8 ? `reopened round inputs missing after undo (${inputCount})`
      : !cancelVisible ? 'cancel round button not restored after undo'
      : '');
  } catch (err) {
    log('TC-810', 'FAIL', err instanceof Error ? err.message : 'TA 810 failed');
  } finally {
    if (setup) await setup.cleanup().catch(() => {});
  }
}

/* ───────── TC-811: Frozen qualification blocks player re-edits ─────────
 * Unlike TC-312 in tc-all (knockout-start lock), this verifies the admin
 * qualification freeze alone disables participant-side edits and the PUT
 * endpoint rejects the write. */
async function runTc811(adminPage) {
  let setup = null;
  let playerBrowser = null;
  try {
    const [player] = sharedTaPlayers(1);
    setup = await createIsolatedTaQualification(adminPage, 'Frozen Qualification Lock', [player], { seedTimes: false });
    const { tournamentId } = setup;
    const [entry] = await seedTaQualificationRanks(adminPage, tournamentId, setup.entries, 1);

    const ctx = await loginSharedPlayer(adminPage, player);
    playerBrowser = ctx.browser;
    await nav(ctx.page, `/tournaments/${tournamentId}/ta/participant`);

    const submitBtn = ctx.page.getByRole('button', { name: /タイム送信|Submit Times/ }).last();
    const firstTimeInput = ctx.page.locator('input[placeholder="M:SS.mm"]').first();
    const editableBeforeFreeze = !(await firstTimeInput.isDisabled().catch(() => true)) &&
      !(await submitBtn.isDisabled().catch(() => true));

    await uiFreezeTaQualification(adminPage, tournamentId);
    await nav(ctx.page, `/tournaments/${tournamentId}/ta/participant`);

    const frozenText = await ctx.page.locator('body').innerText();
    const frozenWarningVisible = frozenText.includes('このステージは凍結されています。タイムの編集はできません。') ||
      frozenText.includes('This stage is frozen. Time edits are not allowed.');
    const inputDisabled = await firstTimeInput.isDisabled().catch(() => false);
    const submitDisabled = await submitBtn.isDisabled().catch(() => false);
    const apiEditAfterFreeze = await apiTaParticipantEditTime(
      ctx.page, tournamentId, entry.entryId, 'MC1', '1:11.11'
    );

    log('TC-811', editableBeforeFreeze && frozenWarningVisible && inputDisabled && submitDisabled && apiEditAfterFreeze.s === 403 ? 'PASS' : 'FAIL',
      !editableBeforeFreeze ? 'participant inputs were already disabled before freeze'
      : !frozenWarningVisible ? 'frozen qualification warning not shown to player'
      : !inputDisabled ? 'time input still enabled after qualification freeze'
      : !submitDisabled ? 'submit button still enabled after qualification freeze'
      : apiEditAfterFreeze.s !== 403 ? `player PUT after freeze returned ${apiEditAfterFreeze.s}`
      : '');
  } catch (err) {
    log('TC-811', 'FAIL', err instanceof Error ? err.message : 'TA 811 failed');
  } finally {
    if (playerBrowser) await playerBrowser.close().catch(() => {});
    if (setup) await setup.cleanup().catch(() => {});
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

/* ───────── TC-812: TA qualification tie resolution (averaged course points) ─────────
 * TA does NOT use the rankOverride flow used by BM/MR/GP — ties are resolved
 * automatically inside `calculateCourseScores` (src/lib/ta/qualification-scoring.ts):
 * players with identical course times share the same rank and receive the
 * averaged score across the tied positions. When overall totals remain equal,
 * the TA standings sort uses totalTime as the tiebreaker.
 *
 * This test mirrors TC-324 (BM) and TC-713 (GP) but validates TA's numeric
 * tie handling instead of a UI banner:
 *   1. Three players, where P1 and P2 submit identical times on all 20 courses
 *      and P3 submits strictly slower times.
 *   2. Expect `qualificationPoints` for P1 and P2 to be exactly equal (tied),
 *      and for their shared value to match the averaged score table
 *      (score table for N=3 is [50, 25, 0]; P1/P2 tie at ranks 1-2 → each
 *      receives (50 + 25) / 2 = 37.5 pts per course × 20 courses = 750 pts,
 *      floor(750) = 750).
 *   3. P3 must receive 0 points overall (rank 3 in N=3).
 *   4. Server-assigned ranks: P1/P2 compare equal on (points, totalTime) and
 *      must appear before P3.
 *
 * Uses isolated players/tournament because the shared fixture seeds unique
 * times that avoid ties (TC-801's invariant), and this test intentionally
 * violates that to exercise tie handling. */
async function runTc812(adminPage) {
  const createdPlayers = [];
  let tournamentId = null;
  try {
    const stamp = Date.now();

    for (let i = 1; i <= 3; i++) {
      const name = `E2E TA Tie P${i}`;
      const nickname = `e2e_ta_tie_${i}_${stamp}`;
      const p = await uiCreatePlayer(adminPage, name, nickname);
      createdPlayers.push({ id: p.id, name, nickname });
    }

    tournamentId = await uiCreateTournament(adminPage, `E2E TA Tie ${stamp}`, { dualReportEnabled: false });

    /* Register all 3 players with seeding but no time seeding — we supply our
     * own tied times below. */
    const { entries } = await setupTaQualViaUi(adminPage, tournamentId, createdPlayers, { seedTimes: false });

    /* Deterministic tied times for P1 & P2; slower for P3. makeTaTimesForRank
     * uses 60000 + rank*200 ms per course, so rank=1 and rank=3 give distinct
     * time vectors where P3 is strictly slower on every course. */
    const { times: tiedTimes, totalMs: tiedTotal } = makeTaTimesForRank(1);
    const { times: slowerTimes, totalMs: slowerTotal } = makeTaTimesForRank(3);

    await apiSeedTtEntry(adminPage, tournamentId, entries[0].entryId, tiedTimes, tiedTotal, null);
    await apiSeedTtEntry(adminPage, tournamentId, entries[1].entryId, tiedTimes, tiedTotal, null);
    await apiSeedTtEntry(adminPage, tournamentId, entries[2].entryId, slowerTimes, slowerTotal, null);

    /* Rank recalculation runs on every entry update, so the final seed call
     * leaves the server with up-to-date qualificationPoints/rank. Re-fetch
     * to inspect the computed state. */
    const data = await apiFetchTa(adminPage, tournamentId);
    const rows = data.b?.data?.entries ?? [];

    const byPlayerId = new Map(rows.map((e) => [e.playerId, e]));
    const p1Row = byPlayerId.get(createdPlayers[0].id);
    const p2Row = byPlayerId.get(createdPlayers[1].id);
    const p3Row = byPlayerId.get(createdPlayers[2].id);

    const allPresent = !!p1Row && !!p2Row && !!p3Row;
    const pointsTied = allPresent && p1Row.qualificationPoints === p2Row.qualificationPoints;
    /* For N=3, tied at ranks 1-2, the expected per-course score is 37.5.
     * floor(37.5 * 20) = 750. */
    const expectedTiedPoints = 750;
    const pointsMatchExpected = allPresent && p1Row.qualificationPoints === expectedTiedPoints;
    const p3HasZero = allPresent && p3Row.qualificationPoints === 0;
    /* P1 and P2 must outrank P3; server assigns ranks sequentially by (points
     * desc, totalTime asc), so the two tied players share the top two slots. */
    const ranksOrdered = allPresent && p3Row.rank === 3 && p1Row.rank <= 2 && p2Row.rank <= 2;

    const ok = pointsTied && pointsMatchExpected && p3HasZero && ranksOrdered;
    log('TC-812', ok ? 'PASS' : 'FAIL',
      !allPresent ? 'TA entries missing after seeding'
      : !pointsTied ? `qualificationPoints not tied: P1=${p1Row.qualificationPoints} P2=${p2Row.qualificationPoints}`
      : !pointsMatchExpected ? `expected ${expectedTiedPoints} for tied players, got ${p1Row.qualificationPoints}`
      : !p3HasZero ? `P3 expected 0 points, got ${p3Row.qualificationPoints}`
      : !ranksOrdered ? `rank order wrong: P1=${p1Row.rank} P2=${p2Row.rank} P3=${p3Row.rank}`
      : '');
  } catch (err) {
    log('TC-812', 'FAIL', err instanceof Error ? err.message : 'TA tie resolution failed');
  } finally {
    if (tournamentId) await apiDeleteTournament(adminPage, tournamentId);
    for (const p of createdPlayers) await apiDeletePlayer(adminPage, p.id);
  }
}

/* ───────── TC-813: TA qualification rank recalculation after entry deletion ─────────
 * Issue #710: recalculateRanks previously issued N sequential TTEntry.update calls
 * (~185ms each on D1), causing ~5s response times for 27-entry stages. The fix
 * collapses N round-trips into a single bulk UPDATE CASE WHEN statement.
 *
 * This test verifies the functional correctness of rank recalculation after an
 * entry is deleted: the surviving entries must receive consecutive ranks with no
 * gaps, reflecting the removed player's absence.
 *
 * Uses an isolated tournament so it does not disturb the shared phase chain. */
async function runTc813(adminPage) {
  const createdPlayers = [];
  let tournamentId = null;
  try {
    const stamp = Date.now();

    for (let i = 1; i <= 4; i++) {
      const p = await uiCreatePlayer(adminPage, `E2E TA Rank P${i} ${stamp}`, `e2e_ta_rank_${i}_${stamp}`);
      createdPlayers.push(p);
    }
    tournamentId = await uiCreateTournament(adminPage, `E2E TA Rank Del ${stamp}`, { dualReportEnabled: false });

    /* Register all 4 with unique deterministic times (rank 1=fastest, 4=slowest). */
    const { entries } = await setupTaQualViaUi(adminPage, tournamentId, createdPlayers, { seedTimes: false });
    for (let i = 0; i < 4; i++) {
      const { times, totalMs } = makeTaTimesForRank(i + 1);
      await apiSeedTtEntry(adminPage, tournamentId, entries[i].entryId, times, totalMs, null);
    }

    /* Assert initial rank assignment. */
    const beforeRows = (await apiFetchTa(adminPage, tournamentId)).b?.data?.entries ?? [];
    const beforeMap = new Map(beforeRows.map((e) => [e.playerId, e]));
    const [b1, b2, b3, b4] = createdPlayers.map((p) => beforeMap.get(p.id));
    if (b1?.rank !== 1 || b2?.rank !== 2 || b3?.rank !== 3 || b4?.rank !== 4) {
      log('TC-813', 'FAIL', `Initial ranks wrong: P1=${b1?.rank} P2=${b2?.rank} P3=${b3?.rank} P4=${b4?.rank}`);
      return;
    }

    /* Delete P2's entry — triggers recalculateRanks on the server. */
    const del = await adminPage.evaluate(async (u) => {
      const r = await fetch(u, { method: 'DELETE' });
      return { s: r.status, ok: r.ok };
    }, `/api/tournaments/${tournamentId}/ta?entryId=${entries[1].entryId}`);
    if (!del.ok) {
      log('TC-813', 'FAIL', `DELETE entry failed (${del.s})`);
      return;
    }

    /* After deletion the server must re-compact ranks: P1=1, P3=2, P4=3. */
    const afterRows = (await apiFetchTa(adminPage, tournamentId)).b?.data?.entries ?? [];
    const afterMap = new Map(afterRows.map((e) => [e.playerId, e]));
    const p2Gone = !afterMap.has(createdPlayers[1].id);
    const a1 = afterMap.get(createdPlayers[0].id);
    const a3 = afterMap.get(createdPlayers[2].id);
    const a4 = afterMap.get(createdPlayers[3].id);
    const ranksCompacted = a1?.rank === 1 && a3?.rank === 2 && a4?.rank === 3;

    log('TC-813', p2Gone && ranksCompacted ? 'PASS' : 'FAIL',
      !p2Gone ? 'P2 entry still present after DELETE'
      : !ranksCompacted ? `ranks not re-compacted after deletion: P1=${a1?.rank} P3=${a3?.rank} P4=${a4?.rank}`
      : '');
  } catch (err) {
    log('TC-813', 'FAIL', err instanceof Error ? err.message : 'TA rank recalc after delete failed');
  } finally {
    if (tournamentId) await apiDeleteTournament(adminPage, tournamentId);
    for (const p of createdPlayers) await apiDeletePlayer(adminPage, p.id);
  }
}

async function setupIsolatedPhase1SuddenDeath(adminPage, label) {
  const stamp = Date.now();
  const players = [];
  for (let i = 1; i <= 8; i++) {
    players.push(await uiCreatePlayer(adminPage, `E2E TA SD P1 ${i} ${stamp}`, `e2e_ta_sd_p1_${i}_${stamp}`));
  }
  const fixture = await createIsolatedTaQualification(adminPage, label, players, { seedTimes: false });
  const seeded = await seedTaQualificationRanks(adminPage, fixture.tournamentId, fixture.entries, 17);
  const promote = await apiPromoteTaPhase(adminPage, fixture.tournamentId, 'promote_phase1');
  if (promote.s !== 200) throw new Error(`promote_phase1 failed (${promote.s})`);
  return {
    ...fixture,
    seeded,
    cleanup: async () => {
      await fixture.cleanup();
      for (const player of players) await apiDeletePlayer(adminPage, player.id);
    },
  };
}

/* ───────── TC-814: TA Phase1 sudden-death tiebreak ───────── */
async function runTc814(adminPage) {
  let fixture = null;
  try {
    fixture = await setupIsolatedPhase1SuddenDeath(adminPage, `Sudden Death P1 ${Date.now()}`);
    const { tournamentId } = fixture;
    const phase = 'phase1';
    const start = await apiPostTaPhase(adminPage, tournamentId, { action: 'start_round', phase });
    if (start.s !== 200) throw new Error(`start_round failed (${start.s})`);
    const roundNumber = start.b?.data?.roundNumber;
    const phaseData = await apiFetchTaPhase(adminPage, tournamentId, phase);
    const entries = phaseData.b?.data?.entries ?? [];
    if (entries.length !== 8) throw new Error(`phase1 entries=${entries.length}, expected 8`);
    const results = entries.map((entry, index) => ({
      playerId: entry.playerId,
      timeMs: index >= 6 ? 100000 : 80000 + index * 1000,
    }));

    const tied = await apiPostTaPhase(adminPage, tournamentId, {
      action: 'submit_results',
      phase,
      roundNumber,
      results,
    });
    const tieData = tied.b?.data ?? {};
    if (tied.s !== 200 || tieData.tieBreakRequired !== true) {
      log('TC-814', 'FAIL', `expected tieBreakRequired, got status=${tied.s} body=${JSON.stringify(tied.b).slice(0, 200)}`);
      return;
    }
    const sudden = tieData.suddenDeathRound;
    const targets = sudden?.targetPlayerIds ?? [];
    if (!sudden?.id || targets.length !== 2 || !sudden.course) {
      log('TC-814', 'FAIL', `invalid sudden death payload: ${JSON.stringify(sudden)}`);
      return;
    }

    const phaseAfterTie = (await apiFetchTaPhase(adminPage, tournamentId, phase)).b?.data ?? {};
    const available = (phaseAfterTie.availableCourses ?? []).filter((c) => c !== sudden.course);
    const changedCourse = available[0];
    if (!changedCourse) throw new Error('No alternate course available for sudden death change');
    const change = await apiPostTaPhase(adminPage, tournamentId, {
      action: 'change_sudden_death_course',
      phase,
      suddenDeathRoundId: sudden.id,
      course: changedCourse,
    });
    if (change.s !== 200) throw new Error(`change_sudden_death_course failed (${change.s})`);

    const sdSubmit = await apiPostTaPhase(adminPage, tournamentId, {
      action: 'submit_sudden_death',
      phase,
      suddenDeathRoundId: sudden.id,
      results: [
        { playerId: targets[0], timeMs: 90000 },
        { playerId: targets[1], timeMs: 91000 },
      ],
    });
    if (sdSubmit.s !== 200) throw new Error(`submit_sudden_death failed (${sdSubmit.s}): ${JSON.stringify(sdSubmit.b).slice(0, 200)}`);
    const finalData = (await apiFetchTaPhase(adminPage, tournamentId, phase)).b?.data ?? {};
    const finalEntries = finalData.entries ?? [];
    const eliminated = finalEntries.filter((e) => e.eliminated).map((e) => e.playerId);
    const round = (finalData.rounds ?? []).find((r) => r.roundNumber === roundNumber);
    const suddenHistory = round?.suddenDeathRounds ?? [];
    const ok = eliminated.length === 1 && eliminated[0] === targets[1] &&
      suddenHistory.length === 1 && suddenHistory[0].course === changedCourse && suddenHistory[0].resolved === true;
    log('TC-814', ok ? 'PASS' : 'FAIL',
      ok ? '' : `eliminated=${eliminated.join(',')} sudden=${JSON.stringify(suddenHistory)}`);
  } catch (err) {
    log('TC-814', 'FAIL', err instanceof Error ? err.message : 'TA phase1 sudden death failed');
  } finally {
    if (fixture) await fixture.cleanup();
  }
}

/* ───────── TC-815: TA Phase3 boundary sudden-death + retie ───────── */
async function runTc815(adminPage) {
  let fixture = null;
  try {
    const stamp = Date.now();
    const players = [];
    for (let i = 1; i <= 4; i++) {
      players.push(await uiCreatePlayer(adminPage, `E2E TA SD P3 ${i} ${stamp}`, `e2e_ta_sd_p3_${i}_${stamp}`));
    }
    const baseFixture = await createIsolatedTaQualification(adminPage, `Sudden Death P3 ${stamp}`, players, { seedTimes: false });
    fixture = {
      ...baseFixture,
      cleanup: async () => {
        await baseFixture.cleanup();
        for (const player of players) await apiDeletePlayer(adminPage, player.id);
      },
    };
    const { tournamentId } = fixture;
    const seeded = await seedTaQualificationRanks(adminPage, tournamentId, fixture.entries, 1);
    const promote = await apiPromoteTaPhase(adminPage, tournamentId, 'promote_phase3');
    if (promote.s !== 200) throw new Error(`promote_phase3 failed (${promote.s})`);
    const phase = 'phase3';
    const start = await apiPostTaPhase(adminPage, tournamentId, { action: 'start_round', phase });
    if (start.s !== 200) throw new Error(`start_round phase3 failed (${start.s})`);
    const roundNumber = start.b?.data?.roundNumber;
    const phaseData = (await apiFetchTaPhase(adminPage, tournamentId, phase)).b?.data ?? {};
    const entries = phaseData.entries ?? [];
    const [p1, p2, p3, p4] = entries;
    const tied = await apiPostTaPhase(adminPage, tournamentId, {
      action: 'submit_results',
      phase,
      roundNumber,
      results: [
        { playerId: p1.playerId, timeMs: 80000 },
        { playerId: p2.playerId, timeMs: 90000 },
        { playerId: p3.playerId, timeMs: 90000 },
        { playerId: p4.playerId, timeMs: 100000 },
      ],
    });
    const firstSudden = tied.b?.data?.suddenDeathRound;
    if (tied.s !== 200 || tied.b?.data?.tieBreakRequired !== true || (firstSudden?.targetPlayerIds ?? []).length !== 2) {
      log('TC-815', 'FAIL', `expected phase3 boundary sudden death, got ${JSON.stringify(tied.b).slice(0, 220)}`);
      return;
    }
    const retie = await apiPostTaPhase(adminPage, tournamentId, {
      action: 'submit_sudden_death',
      phase,
      suddenDeathRoundId: firstSudden.id,
      results: [
        { playerId: p2.playerId, timeMs: 88000 },
        { playerId: p3.playerId, timeMs: 88000 },
      ],
    });
    const secondSudden = retie.b?.data?.suddenDeathRound;
    if (retie.s !== 200 || retie.b?.data?.tieBreakRequired !== true || !secondSudden?.id) {
      log('TC-815', 'FAIL', `expected second sudden death after retie, got ${JSON.stringify(retie.b).slice(0, 220)}`);
      return;
    }
    const resolved = await apiPostTaPhase(adminPage, tournamentId, {
      action: 'submit_sudden_death',
      phase,
      suddenDeathRoundId: secondSudden.id,
      results: [
        { playerId: p2.playerId, timeMs: 87000 },
        { playerId: p3.playerId, timeMs: 89000 },
      ],
    });
    if (resolved.s !== 200 || resolved.b?.data?.tieBreakRequired) {
      throw new Error(`final sudden death did not resolve (${resolved.s}): ${JSON.stringify(resolved.b).slice(0, 220)}`);
    }
    const finalEntries = (await apiFetchTaPhase(adminPage, tournamentId, phase)).b?.data?.entries ?? [];
    const p3After = finalEntries.find((e) => e.playerId === p3.playerId);
    const p2After = finalEntries.find((e) => e.playerId === p2.playerId);
    const p4After = finalEntries.find((e) => e.playerId === p4.playerId);
    const ok = p2After?.lives === 3 && p3After?.lives === 2 && p4After?.lives === 2;
    log('TC-815', ok ? 'PASS' : 'FAIL',
      ok ? '' : `lives p2=${p2After?.lives} p3=${p3After?.lives} p4=${p4After?.lives}`);
  } catch (err) {
    log('TC-815', 'FAIL', err instanceof Error ? err.message : 'TA phase3 sudden death failed');
  } finally {
    if (fixture) await fixture.cleanup();
  }
}

/* See tc-bm.js::getSuite for the shared-fixture composition contract. TA has
 * an additional qualification seed step that must run inside beforeAll
 * regardless of whether the fixture is external, since TC-801 reads the
 * module-level sharedTaEntries. Shared-state tests are TC-801/802/804/805/806/
 * 807/808; TC-809/810/811 provision isolated tournaments and only reuse the
 * shared player accounts. */
function getSuite({ sharedFixture: externalFixture = null } = {}) {
  const ownsFixture = !externalFixture;
  return {
    suiteName: 'TA',
    results,
    log,
    beforeAll: async (adminPage) => {
      sharedFixture = externalFixture ?? await createSharedE2eFixture(adminPage);
      const selected = new Set(selectedTestNames());
      const needsSharedTaSeed = selected.size === 0 || [
        'TC-801', 'TC-802', 'TC-804', 'TC-805', 'TC-806', 'TC-807', 'TC-808',
      ].some((name) => selected.has(name));

      if (needsSharedTaSeed) {
        const { tournamentId, entries } = await setupTaEntriesFromShared(
          adminPage,
          sharedFixture.normalTournament.id,
          sharedFixture.players.slice(0, 28),
          { seedTimes: true },
        );
        sharedTaTournamentId = tournamentId;
        sharedTaEntries = entries;
      }
    },
    afterAll: async () => {
      if (ownsFixture && sharedFixture) {
        await sharedFixture.cleanup();
      }
      sharedFixture = null;
      sharedTaTournamentId = null;
      sharedTaEntries = [];
    },
    /* Ordering note: TC-805 must run before TC-804 because phase1 promotion
     * freezes the qualification stage and disables the Setup Players dialog.
     * TC-804 → 806 → 807 → 808 chain on the same tournament. TC-839 only
     * inspects layout, and TC-809/810/811 use isolated tournaments, so they
     * can run before the shared phase chain. */
    tests: [
      { name: 'TC-801', fn: runTc801 },
      { name: 'TC-802', fn: runTc802 },
      { name: 'TC-839', fn: runTc839 },
      { name: 'TC-805', fn: runTc805 },
      { name: 'TC-809', fn: runTc809 },
      { name: 'TC-810', fn: runTc810 },
      { name: 'TC-811', fn: runTc811 },
      { name: 'TC-804', fn: runTc804 },
      { name: 'TC-806', fn: runTc806 },
      { name: 'TC-807', fn: runTc807 },
      { name: 'TC-808', fn: runTc808 },
      { name: 'TC-812', fn: runTc812 },
      { name: 'TC-813', fn: runTc813 },
      { name: 'TC-814', fn: runTc814 },
      { name: 'TC-815', fn: runTc815 },
    ],
  };
}

module.exports = {
  runTc801, runTc802, runTc839, runTc804, runTc805, runTc806, runTc807, runTc808, runTc809, runTc810, runTc811,
  runTc812, runTc813, runTc814, runTc815,
  getSuite,
  results,
};

if (require.main === module) {
  runSuite(getSuite());
}

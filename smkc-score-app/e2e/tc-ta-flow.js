/**
 * E2E TA full-flow test (24 players).
 *
 * Coverage:
 *   TC-TA-FLOW-24  Full Time Attack lifecycle on a fresh, isolated tournament:
 *                  qualification (24 players, deterministic ranks 1..24)
 *                  → freeze → promote phase1 (ranks 17-24, 8 → 4)
 *                  → promote phase2 (4 survivors + ranks 13-16, 8 → 4)
 *                  → promote phase3 (4 survivors + ranks 1-12, 16 → 1 champion)
 *                  → champion banner visible on /ta/finals.
 *
 * Why standalone:
 *   tc-ta.js verifies individual TC-80x states on the shared 28-player tournament,
 *   each test asserting one transition. This file exercises the same machinery
 *   end-to-end with the documented P=24 player-count tier (3 active phases) so
 *   regressions in cross-phase glue (rank settling, life resets, finals banner)
 *   surface as a single PASS/FAIL.
 *
 * Run: node e2e/tc-ta-flow.js  (from smkc-score-app/)
 */
const {
  makeResults, makeLog, nav,
  uiCreateTournament,
  uiFreezeTaQualification,
  uiPromoteTaPhase,
  uiPhaseStartRound,
  uiPhaseSubmitResults,
  apiDeleteTournament,
  apiSeedTtEntry,
  apiFetchTa,
  apiFetchTaPhase,
  makeTaTimesForRank,
  setupTaQualViaUi,
  ensureTaQualificationRanksSettled,
} = require('./lib/common');
const { createSharedE2eFixture } = require('./lib/fixtures');
const { runSuite } = require('./lib/runner');

const PLAYER_COUNT = 24;
const PHASE1_ROUNDS = 4;
const PHASE2_ROUNDS = 4;
/* Phase 3 uses a 3-lives system with milestone resets at 8/4/2 actives.
 * From 16 entries down to 1 survivor takes more rounds than a clean
 * single-elimination tree, so we cap at a generous safety budget rather
 * than computing the exact upper bound. */
const PHASE3_MAX_ROUNDS = 25;

const results = makeResults();
const log = makeLog(results);

let sharedFixture = null;
let tournamentId = null;
let entries = [];

/* Per-round time used in phase elimination submissions. The phases route
 * caps individual round times at RETRY_PENALTY_MS (599_990 ms), so we use
 * the same `60_000 + rank*200` formula as TC-806/807/808 — well under the
 * cap and rank-monotonic so the slowest entries keep losing lives. */
function phaseRoundTimeMs(rank) {
  return 60_000 + (rank ?? PLAYER_COUNT) * 200;
}

async function runEliminationRound(adminPage, phase) {
  await uiPhaseStartRound(adminPage, tournamentId, phase);
  const phaseData = await apiFetchTaPhase(adminPage, tournamentId, phase);
  const active = (phaseData.b?.data?.entries ?? []).filter((e) => !e.eliminated);
  const submissions = active.map((e) => ({
    nickname: e.player?.nickname,
    timeMs: phaseRoundTimeMs(e.rank),
  }));
  await uiPhaseSubmitResults(adminPage, tournamentId, phase, submissions);
}

async function runFullFlow(adminPage) {
  try {
    /* Phase 1 sanity: 8 entries (qual ranks 17-24) before any rounds. */
    const phase1Initial = await apiFetchTaPhase(adminPage, tournamentId, 'phase1');
    const phase1InitialEntries = phase1Initial.b?.data?.entries ?? [];
    if (phase1InitialEntries.length !== 8) {
      throw new Error(`phase1 expected 8 entries, got ${phase1InitialEntries.length}`);
    }

    for (let r = 1; r <= PHASE1_ROUNDS; r++) {
      await runEliminationRound(adminPage, 'phase1');
    }

    const phase1Final = await apiFetchTaPhase(adminPage, tournamentId, 'phase1');
    const phase1Survivors = (phase1Final.b?.data?.entries ?? []).filter((e) => !e.eliminated);
    if (phase1Survivors.length !== 4) {
      throw new Error(`phase1 expected 4 survivors, got ${phase1Survivors.length}`);
    }

    await uiPromoteTaPhase(adminPage, tournamentId, 'promote_phase2');

    /* Phase 2 sanity: 4 phase1 survivors + 4 qual ranks 13-16 = 8. */
    const phase2Initial = await apiFetchTaPhase(adminPage, tournamentId, 'phase2');
    const phase2InitialEntries = phase2Initial.b?.data?.entries ?? [];
    if (phase2InitialEntries.length !== 8) {
      throw new Error(`phase2 expected 8 entries, got ${phase2InitialEntries.length}`);
    }

    for (let r = 1; r <= PHASE2_ROUNDS; r++) {
      await runEliminationRound(adminPage, 'phase2');
    }

    const phase2Final = await apiFetchTaPhase(adminPage, tournamentId, 'phase2');
    const phase2Survivors = (phase2Final.b?.data?.entries ?? []).filter((e) => !e.eliminated);
    if (phase2Survivors.length !== 4) {
      throw new Error(`phase2 expected 4 survivors, got ${phase2Survivors.length}`);
    }

    await uiPromoteTaPhase(adminPage, tournamentId, 'promote_phase3');

    /* Phase 3 sanity: 4 phase2 survivors + 12 qual ranks 1-12 = 16. */
    const phase3Initial = await apiFetchTaPhase(adminPage, tournamentId, 'phase3');
    const phase3InitialEntries = phase3Initial.b?.data?.entries ?? [];
    if (phase3InitialEntries.length !== 16) {
      throw new Error(`phase3 expected 16 entries, got ${phase3InitialEntries.length}`);
    }

    /* Run phase3 rounds until a single active player remains. The lives
     * system + milestone resets mean the round count varies with rank
     * distribution, so loop until termination or budget cap. */
    let lastActiveCount = 16;
    for (let r = 1; r <= PHASE3_MAX_ROUNDS; r++) {
      const snapshot = await apiFetchTaPhase(adminPage, tournamentId, 'phase3');
      const active = (snapshot.b?.data?.entries ?? []).filter((e) => !e.eliminated);
      lastActiveCount = active.length;
      if (active.length <= 1) break;

      await uiPhaseStartRound(adminPage, tournamentId, 'phase3');
      const submissions = active.map((e) => ({
        nickname: e.player?.nickname,
        timeMs: phaseRoundTimeMs(e.rank),
      }));
      await uiPhaseSubmitResults(adminPage, tournamentId, 'phase3', submissions);
    }

    if (lastActiveCount > 1) {
      throw new Error(`phase3 did not reach a champion within ${PHASE3_MAX_ROUNDS} rounds (${lastActiveCount} actives left)`);
    }

    await nav(adminPage, `/tournaments/${tournamentId}/ta/finals`);
    const bodyText = await adminPage.locator('body').innerText();
    const championShown = bodyText.includes('Champion') ||
      bodyText.includes('チャンピオン') ||
      bodyText.includes('優勝');

    log('TC-TA-FLOW-24', championShown ? 'PASS' : 'FAIL',
      championShown ? '' : 'champion banner not found on TA finals page');
  } catch (err) {
    log('TC-TA-FLOW-24', 'FAIL', err instanceof Error ? err.message : 'TA flow failed');
  }
}

function getSuite({ sharedFixture: externalFixture = null } = {}) {
  const ownsFixture = !externalFixture;
  return {
    suiteName: 'TA-FLOW-24',
    results,
    log,
    beforeAll: async (adminPage) => {
      sharedFixture = externalFixture ?? await createSharedE2eFixture(adminPage);
      const players = sharedFixture.players.slice(0, PLAYER_COUNT);
      if (players.length !== PLAYER_COUNT) {
        throw new Error(`shared fixture provided ${players.length} players, need ${PLAYER_COUNT}`);
      }

      tournamentId = await uiCreateTournament(
        adminPage,
        `E2E TA Flow 24 ${Date.now()}`,
        { dualReportEnabled: false },
      );

      /* Register all 24 players with seeding 1..24 but skip the slow UI-driven
       * time entry — we'll seed times via the admin TT entry PUT, which is
       * one HTTP round-trip per player versus 20 UI fills + a save click. */
      const setup = await setupTaQualViaUi(adminPage, tournamentId, players, { seedTimes: false });
      entries = setup.entries;

      for (const e of entries) {
        const { times, totalMs } = makeTaTimesForRank(e.rank);
        await apiSeedTtEntry(adminPage, tournamentId, e.entryId, times, totalMs, e.rank);
      }

      /* Server recalculates ranks on every entry update, so the final rank
       * map can briefly disagree with the seeding column. Block until the
       * standings settle to 1..24 before freezing — promote_phase1 below
       * filters by qualification rank and silently underfills if ranks 17-24
       * are not all present. */
      await ensureTaQualificationRanksSettled(adminPage, tournamentId, players, entries);

      await uiFreezeTaQualification(adminPage, tournamentId);
      await uiPromoteTaPhase(adminPage, tournamentId, 'promote_phase1');
    },
    afterAll: async (adminPage) => {
      if (tournamentId && adminPage) {
        await apiDeleteTournament(adminPage, tournamentId).catch(() => {});
      }
      if (ownsFixture && sharedFixture) {
        await sharedFixture.cleanup().catch(() => {});
      }
      sharedFixture = null;
      tournamentId = null;
      entries = [];
    },
    tests: [
      { name: 'TC-TA-FLOW-24', fn: runFullFlow },
    ],
  };
}

module.exports = {
  runFullFlow,
  getSuite,
  results,
};

if (require.main === module) {
  runSuite(getSuite());
}

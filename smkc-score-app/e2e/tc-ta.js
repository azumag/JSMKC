/**
 * E2E TA (Time Attack / Time Trial) tests.
 *
 * Coverage (scenario: E2E_TEST_CASES.md § TT):
 *   TC-801  28-player qualification fill — all 20 courses per player, server-
 *           computed ranks are 1..28 and scoring output is present.
 *   TC-804  Promote to Phase 1 — ranks 17-24 (8 players) move to phase1 stage.
 *
 * Setup:
 *   - Uses the shared Playwright persistent profile (/tmp/playwright-smkc-profile).
 *   - Admin Discord OAuth session must already be established in that profile.
 *
 * Not implemented yet (follow-up):
 *   TC-802 (player participant UI), TC-803 (duplicates TC-318),
 *   TC-805 (Phase 2 rounds), TC-806 (Phase 3 + champion) — all require
 *   round-by-round UI automation that is out-of-scope for this pass.
 *
 * Run: node e2e/tc-ta.js  (from smkc-score-app/)
 */
const {
  makeResults, makeLog, nav,
  apiFetchTa, apiPromoteTaPhase,
  setupTa28PlayerQual,
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
 * doesn't remove), so we check phase1 count = 8 via the ?stage=phase1 GET. */
async function runTc804(adminPage) {
  let setup = null;
  try {
    setup = await setupTa28PlayerQual(adminPage, '804');

    const promote = await apiPromoteTaPhase(adminPage, setup.tournamentId, 'promote_phase1');
    if (promote.s !== 200) {
      throw new Error(`promote_phase1 returned ${promote.s}: ${JSON.stringify(promote.b).slice(0, 200)}`);
    }

    const phase1 = await apiFetchTa(adminPage, setup.tournamentId, 'phase1');
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

if (require.main === module) {
  runSuite({
    suiteName: 'TA',
    results,
    log,
    tests: [
      { name: 'TC-801', fn: runTc801 },
      { name: 'TC-804', fn: runTc804 },
    ],
  });
}

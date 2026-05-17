import * as gpFinalsValidatorExports from '../../e2e/lib/gp-finals-validators';
import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

function readE2eScript(script: string) {
  return readRepoFile('smkc-score-app', 'e2e', script);
}

function readE2eLib(script: string) {
  return readRepoFile('smkc-score-app', 'e2e', 'lib', script);
}

describe('E2E case drift coverage', () => {
  const tcAll = readE2eScript('tc-all.js');
  const tcBm = readE2eScript('tc-bm.js');
  const tcMr = readE2eScript('tc-mr.js');
  const tcGp = readE2eScript('tc-gp.js');
  const tcOverlay = readE2eScript('tc-overlay.js');
  const tcDebugFill = readE2eScript('tc-debug-fill.js');
  const tcTa = readE2eScript('tc-ta.js');
  const tcTaFlow = readE2eScript('tc-ta-flow.js');
  const taFlowRankAssertionsTypes = readE2eLib('ta-flow-rank-assertions.d.ts');
  const gpFinalsValidators = readE2eLib('gp-finals-validators.js');
  const bmFinalsPage = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'bm', 'finals', 'page.tsx');
  const tc1073Lr2Slots = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'tc-1073-16p-lr2-slots.test.ts');
  const prismaMigrationsTest = readRepoFile('smkc-score-app', '__tests__', 'docs', 'prisma-migrations.test.ts');
  const taPhasesRouteTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'app',
    'api',
    'tournaments',
    '[id]',
    'ta',
    'phases',
    'route.test.ts',
  );
  const taFinalsPhaseManagerTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'ta',
    'finals-phase-manager.test.ts',
  );
  const taCourseSelection = readRepoFile('smkc-score-app', 'src', 'lib', 'ta', 'course-selection.ts');
  const taCourseSelectionTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'lib',
    'ta',
    'course-selection.test.ts',
  );
  const taFinalsPage = readRepoFile(
    'smkc-score-app',
    'src',
    'app',
    'tournaments',
    '[id]',
    'ta',
    'finals',
    'page.tsx',
  );
  const taEliminationPhase = readRepoFile(
    'smkc-score-app',
    'src',
    'components',
    'tournament',
    'ta-elimination-phase.tsx',
  );
  const taSuddenDeathPanel = readRepoFile(
    'smkc-score-app',
    'src',
    'components',
    'tournament',
    'ta-sudden-death-panel.tsx',
  );
  const taSuddenDeathPanelTest = readRepoFile(
    'smkc-score-app',
    '__tests__',
    'components',
    'tournament',
    'ta-sudden-death-panel.test.tsx',
  );
  const enMessages = readRepoFile('smkc-score-app', 'messages', 'en.json');
  const jaMessages = readRepoFile('smkc-score-app', 'messages', 'ja.json');

  it.each([
    ['TC-352', tcAll],
    ['TC-357', tcAll],
    ['TC-702', tcGp],
    ['TC-717', tcGp],
    ['TC-722', tcGp],
    ['TC-1103', tcGp],
    ['TC-1109', tcGp],
    ['TC-1098', tcGp],
    ['TC-1106', tcGp],
    ['TC-725', tcGp],
    ['TC-1087', tcGp],
    ['TC-1083', tcMr],
    ['TC-729', tcGp],
    ['TC-926', tcOverlay],
    ['TC-817', tcTa],
    ['TC-1032', tcTa],
    ['TC-1033', tcTa],
    ['TC-939', tcAll],
    ['TC-1010', tcBm],
    ['TC-TA-FLOW-24', tcTaFlow],
  ])('keeps %s documented and registered in its runnable E2E script', (tc, scriptSource) => {
    const section = e2eCaseSection(tc);

    expect(section).toContain('**手順**');
    expect(section).toContain('**期待結果**');
    expect(section).toContain(`**スクリプト**:`);
    expect(scriptSource).toContain(`log('${tc}'`);
  });

  it('documents why GP TC-831 stays before TC-832 in the suite order', () => {
    // Allow whitespace/quote formatting drift while requiring comment -> TC-831 -> TC-832 adjacency.
    expect(tcGp).toMatch(
      /\/\/\s*TC-831 stays before TC-832[^\n]*\n\s*\{\s*name:\s*['"]TC-831['"]\s*,\s*fn:\s*runTc831\s*\}\s*,\s*\n\s*\{\s*name:\s*['"]TC-832['"]\s*,\s*fn:\s*runTc832\s*\}/,
    );
  });

  it('keeps TC-830 aligned with runtime unit and bracket component coverage', () => {
    const section = e2eCaseSection('TC-830');
    const pageWiringTest = readRepoFile('smkc-score-app', '__tests__', 'app', 'tournaments', 'gp-finals-page-wiring.test.tsx');
    const winnerHelperTest = readRepoFile('smkc-score-app', '__tests__', 'lib', 'gp-finals-match-winner.test.ts');
    const doubleBracketTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'components',
      'tournament',
      'double-elimination-bracket.test.tsx',
    );
    const playoffBracketTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'components',
      'tournament',
      'playoff-bracket.test.tsx',
    );

    expect(section).toContain('issue #830');
    expect(section).toContain('gp-finals-page-wiring.test.tsx');
    expect(section).toContain('gp-finals-match-winner.test.ts');
    expect(section).toContain('double-elimination-bracket.test.tsx');
    expect(section).toContain('playoff-bracket.test.tsx');
    expect(pageWiringTest).toContain('passes the GP legacy winner resolver into the finals bracket');
    expect(winnerHelperTest).toContain('falls back to suddenDeathWinnerId for completed legacy tied rows');
    expect(doubleBracketTest).toContain('uses getWinnerId for completed tied matches');
    expect(playoffBracketTest).toContain('uses getWinnerId for completed tied matches');
    expect(tcGp).not.toMatch(/\{\s*name:\s*['"]TC-830['"]/);
  });

  it('keeps TC-1010 aligned with the BM 16-player finals regression coverage', () => {
    const section = e2eCaseSection('TC-1010');
    const finalsRouteTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'api-factories',
      'finals-route.test.ts',
    );
    const overallRankingTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'points',
      'overall-ranking.test.ts',
    );

    expect(section).toContain('issue #1010');
    expect(section).toContain('rankOverride');
    expect(section).toContain('losers_r4');
    expect(section).toContain('losers_r3');
    expect(section).toContain('E2E_TESTS=TC-1010 node e2e/tc-bm.js');
    expect(tcBm).toContain("{ name: 'TC-1010', fn: runTc1010 }");
    expect(finalsRouteTest).toContain('uses finalized qualification ranks when seeding the bracket');
    expect(overallRankingTest).toContain('maps 16-player finals and Top24 playoff losses to standard point bands');
  });

  it('keeps TC-1007 aligned with the GroupSetupDialog static guard', () => {
    const section = e2eCaseSection('TC-1007');
    const followupSection = e2eCaseSection('TC-1678');
    const disabledButtonSection = e2eCaseSection('TC-1680');
    const outlineButtonSection = e2eCaseSection('TC-1682');
    const guard = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1007-group-setup-dialog-prop-contract.test.ts',
    );

    expect(section).toContain('issue #1007');
    expect(section).toContain('GroupSetupDialog');
    expect(section).toContain('tc-1007-group-setup-dialog-prop-contract.test.ts');
    expect(followupSection).toContain('issue #1678');
    expect(followupSection).toContain('setGroupCount');
    expect(disabledButtonSection).toContain('issue #1680');
    expect(disabledButtonSection).toContain('disabled');
    expect(outlineButtonSection).toContain('issue #1682');
    expect(outlineButtonSection).toContain('variant="outline"');
    expect(guard).toContain("e2eCaseSection('TC-1007')");
    expect(guard).toContain("e2eCaseSection('TC-1678')");
    expect(guard).toContain("not.toContain('groupCount={groupCount}')");
    expect(guard).toContain("not.toContain('setGroupCount={setGroupCount}')");
    expect(guard).toContain("expect(groupCountButton).toContain('disabled')");
    expect(guard).toContain('expect(groupCountButton).toContain(\'variant="outline"\')');
  });

  it('keeps TC-1004 aligned with the CourseCycleStatus YAGNI guard', () => {
    const section = e2eCaseSection('TC-1004');
    const guard = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1004-course-cycle-status-contract.test.ts',
    );
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'ta',
      'course-cycle-status.test.ts',
    );

    expect(section).toContain('issue #1004');
    expect(section).toContain('availableCourses.length');
    expect(section).toContain('availableCoursesCount');
    expect(section).toContain('tc-1004-course-cycle-status-contract.test.ts');
    expect(guard).toContain("e2eCaseSection('TC-1004')");
    expect(guard).toContain("expect(helperSource).not.toContain('availableCount')");
    expect(guard).toContain('availableCoursesCount={availableCourses.length}');
    expect(unitTest).not.toContain('availableCount');
  });

  it('keeps TC-1005 aligned with the shared TA course-cycle panel guard', () => {
    const section = e2eCaseSection('TC-1005');
    const guard = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1005-course-cycle-panel-contract.test.ts',
    );
    const componentTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'components',
      'tournament',
      'course-cycle-status-panel.test.tsx',
    );

    expect(section).toContain('issue #1005');
    expect(section).toContain('CourseCycleStatusPanel');
    expect(section).toContain('E2E_TESTS=TC-1005 node e2e/tc-ta.js');
    expect(section).toContain('tc-1005-course-cycle-panel-contract.test.ts');
    expect(guard).toContain("e2eCaseSection('TC-1005')");
    expect(guard).toContain("expect(finalsPageSource).toContain('<CourseCycleStatusPanel')");
    expect(componentTest).toContain('availableCoursesCount={13}');
    expect(tcTa).toContain("{ name: 'TC-1005', fn: runTc1005 }");
    expect(tcTa).toContain("log('TC-1005'");
  });

  it('keeps TC-702 aligned with direct driver-points JsonNull reporting coverage', () => {
    const section = e2eCaseSection('TC-702');

    expect(section).toContain('issue #1099/#1437');
    expect(section).toContain('`Prisma.JsonNull`');
    expect(section).toContain('`null`');
    expect(tcGp).toContain("{ name: 'TC-702', fn: runTc702 }");
    expect(tcGp).toContain('updated?.player1ReportedRaces === null');
  });

  it('keeps TC-TA-FLOW-24 documented as the parent runnable for rank sub-coverage', () => {
    const section = e2eCaseSection('TC-TA-FLOW-24');

    expect(section).toContain('24名 TA');
    expect(section).toContain('TC-TA-FLOW-24-RANK');
    expect(section).toContain('npm run e2e:preview:ta-flow');
    expect(tcTaFlow).toContain("{ name: 'TC-TA-FLOW-24', fn: runFullFlow }");
  });

  it('keeps TC-TA-FLOW-24-RANK aligned with direct helper and TypeScript contract coverage', () => {
    const section = e2eCaseSection('TC-TA-FLOW-24-RANK');
    const unitTest = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'ta-flow-rank-assertions.test.ts');

    expect(section).toContain('collectEliminationOrder');
    expect(section).toContain('ta-flow-rank-assertions.d.ts');
    expect(unitTest).toContain('collects no eliminations from missing phase3 rounds');
    expect(unitTest).toContain('ignores missing eliminatedIds and invalid player ids');
    expect(taFlowRankAssertionsTypes).toContain('export function collectEliminationOrder');
    expect(taFlowRankAssertionsTypes).toContain('export function evaluateTaFlowRankAssertion');
  });

  it('keeps TC-1060 aligned with complete TA finals position unit coverage', () => {
    const section = e2eCaseSection('TC-1060');
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'points',
      'overall-ranking.test.ts',
    );
    const testCase = sectionBetween(
      unitTest,
      "it('assigns TA finals bonus positions through 24th from phase eliminations'",
      '  });\n\n  // =========================================================================',
    );

    expect(section).toContain('issue #1060');
    expect(section).toContain('18・19・22・23');
    expect(section).toContain('smkc-score-app/__tests__/lib/points/overall-ranking.test.ts');
    expect(testCase).toContain("expect(positions).toEqual([");
    for (const [playerId, position] of [
      ['p17', 17],
      ['p18', 18],
      ['p19', 19],
      ['p20', 20],
      ['p21', 21],
      ['p22', 22],
      ['p23', 23],
      ['p24', 24],
    ] as const) {
      expect(testCase).toContain(`{ playerId: '${playerId}', position: ${position} }`);
    }
    expect(testCase).not.toContain('expect.arrayContaining');
  });

  it('keeps TC-1059 aligned with the TA phase position floor guard', () => {
    const section = e2eCaseSection('TC-1059');
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'points',
      'overall-ranking.test.ts',
    );

    expect(section).toContain('issue #1059');
    expect(section).toContain('17〜20位');
    expect(section).toContain('21〜24位');
    expect(section).toContain('順位帯を越えず');
    expect(section).toContain('e2e-cases-drift.test.ts');
    expect(unitTest).toContain("does not assign excess phase1/2 eliminations outside their position ranges");
    expect(unitTest).toContain('p16-overflow');
    expect(unitTest).toContain('p20-overflow');
  });

  it('keeps qualification points header tooltip coverage documented and scripted', () => {
    const helper = readE2eLib('common.js');

    for (const tc of ['TC-532', 'TC-622', 'TC-723'] as const) {
      const section = e2eCaseSection(tc);

      expect(section).toContain('title に 0-1000 正規化の説明');
      expect(section).toContain('説明 title');
    }

    expect(helper).toContain('getQualificationPointsTooltipTitles');
    expect(helper).toContain("require('../../messages/ja.json').common");
    expect(helper).toContain("require('../../messages/en.json').common");
    expect(helper).toContain('qualification points header missing tooltip title');
  });

  it('keeps TC-521 aligned with BM finals score-dialog long-name truncation', () => {
    const section = e2eCaseSection('TC-521');
    const classTokenSets = Array.from(bmFinalsPage.matchAll(/className="([^"]+)"/g))
      .map((match) => new Set(match[1].split(/\s+/).filter(Boolean)));
    const hasClassSet = (tokens: string[]) =>
      classTokenSets.some((classSet) => tokens.every((token) => classSet.has(token)));

    expect(section).toContain('長いプレイヤー名');
    expect(tcBm).toContain('labelsStayCapped');
    expect(hasClassSet(['flex', 'min-w-0', 'max-w-full', 'flex-wrap', 'items-center'])).toBe(true);
    expect(hasClassSet(['min-w-0', 'max-w-[180px]', 'truncate', 'sm:max-w-[240px]'])).toBe(true);
    expect(hasClassSet(['block', 'max-w-[140px]', 'truncate'])).toBe(true);
    expect(hasClassSet(['min-w-0', 'text-center'])).toBe(true);
  });

  it('keeps TC-519 waiting for the specific BM losers_r1 TBD cards', () => {
    const section = e2eCaseSection('TC-519');

    expect(section).toContain('TBD');
    expect(tcBm).toContain('matchCardTitle(8)');
    expect(tcBm).toContain('matchCardTitle(9)');
    expect(tcBm).toContain('await Promise.all([');
    expect(tcBm).toContain("m8Card.waitFor({ state: 'visible', timeout: 40000 })");
    expect(tcBm).toContain("m9Card.waitFor({ state: 'visible', timeout: 40000 })");
    expect(tcBm).toContain('M8 does not show both players as TBD (text: ${m8Text.slice(0, 120)}; cards=${JSON.stringify(cardTexts)})');
    expect(tcBm).toContain('M9 does not show both players as TBD (text: ${m9Text.slice(0, 120)}; cards=${JSON.stringify(cardTexts)})');
    expect(tcBm).not.toContain('const hasM8 = await m8Card.count() > 0');
    expect(tcBm).not.toContain('const hasM9 = await m9Card.count() > 0');
  });

  it('keeps TC-513 session-guidance waits diagnostic and unsuppressed', () => {
    const section = e2eCaseSection('TC-513');
    const tc513Source = sectionBetween(
      tcBm,
      'async function runTc513',
      '/* ───────── TC-503',
    );

    expect(section).toContain('未認証/管理者/プレイヤー');
    expect(tcBm).toContain('BM_MATCH_GUIDANCE_TIMEOUT_MS');
    expect(tcBm).toContain('async function waitForBmMatchGuidance');
    expect(tcBm).not.toContain('function bmMatchGuidanceRegex');
    expect(tcBm).not.toContain('function compactBodyText');
    expect(tc513Source).toMatch(/waitForBmMatchGuidance\(\s*anonPage/);
    expect(tc513Source).toMatch(/waitForBmMatchGuidance\(\s*adminPage/);
    expect(tc513Source).toMatch(/waitForBmMatchGuidance\(\s*playerPage/);
    expect(tcBm).toContain('guidance did not appear within');
    expect(tcBm).toContain('readyState=');
    expect(tc513Source).toContain('if (anonContext) await anonContext.close().catch(() => {})');
    expect(tc513Source).toContain('if (anonBrowser) await anonBrowser.close().catch(() => {})');
    expect(tc513Source).toContain('if (playerBrowser) await playerBrowser.close().catch(() => {})');
    expect(tc513Source).not.toContain('waitForFunction(');
  });

  it('keeps TC-531 BM finals navigation routed through the BASE-aware nav helper', () => {
    const section = e2eCaseSection('TC-531');
    const tc531Source = sectionBetween(
      tcBm,
      'async function runTc531',
      '/**\n * Builds the BM suite spec',
    );

    expect(section).toContain('issue #889');
    expect(section).toContain('`nav`');
    expect(tc531Source).toContain('await nav(adminPage, `/tournaments/${tournamentId}/bm/finals`)');
    expect(tc531Source).not.toMatch(/\.goto\(\s*`?\/tournaments/);
  });

  it('keeps TC-858 MR Top-24 generation protected by an explicit reset cycle', () => {
    const section = e2eCaseSection('TC-858');
    const tc858Source = sectionBetween(
      tcMr,
      'async function runTc858',
      '/* END TC-858 */',
    );
    const unlockIdx = tc858Source.indexOf('apiUpdateTournament(adminPage, tournamentId, { mrQualificationConfirmed: false })');
    const resetIdx = tc858Source.indexOf('body: JSON.stringify({ reset: true })');
    const reconfirmIdx = tc858Source.indexOf('apiUpdateTournament(adminPage, tournamentId, { mrQualificationConfirmed: true })');
    const generateIdx = tc858Source.indexOf('generateMrFinalsBracket(adminPage, tournamentId, 24)');

    expect(section).toContain('issue #888');
    expect(section).toContain('409');
    expect(section).toContain('reset');
    expect(section).toContain('mrQualificationConfirmed');
    expect(section).toContain('tc-all.js');
    expect(tcAll).toContain("const mrModule = require('./tc-mr')");
    expect(tcAll).toContain("{ label: 'MR Tests', mod: mrModule }");
    expect(tcMr).toContain("{ name: 'TC-858', fn: runTc858 }");
    expect(unlockIdx).toBeGreaterThanOrEqual(0);
    expect(resetIdx).toBeGreaterThan(unlockIdx);
    expect(reconfirmIdx).toBeGreaterThan(resetIdx);
    expect(generateIdx).toBeGreaterThan(reconfirmIdx);
  });

  it('keeps TC-1063 aligned with the combined standings memoization guard', () => {
    const section = e2eCaseSection('TC-1063');
    const tc1555 = e2eCaseSection('TC-1555');
    const tc1556 = e2eCaseSection('TC-1556');
    const tc1558 = e2eCaseSection('TC-1558');
    const guard = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1063-combined-rankings-usememo.test.ts',
    );

    expect(section).toContain('issue #1063');
    expect(section).toContain('issue #1555/#1556');
    expect(section).toContain('BM/MR/GP');
    expect(section).toContain('useMemo');
    expect(section).toContain('computeCombinedRanks');
    expect(section).toContain('tc-1063-combined-rankings-usememo.test.ts');
    expect(tc1555).toContain('issue #1555');
    expect(tc1555).toContain('ranking-utils.test.ts');
    expect(tc1555).toContain('comparator');
    expect(tc1556).toContain('issue #1556');
    expect(tc1556).toContain('import 順');
    expect(tc1556).toContain('tc-1063-combined-rankings-usememo.test.ts');
    expect(tc1558).toContain('issue #1558');
    expect(tc1558).toContain('ScorePointsEntry');
    expect(tc1558).toContain('ranking-utils.test.ts');
    expect(guard).toContain('combinedRankings');
    expect(guard).toContain('compareByScoreThenPoints');
    expect(guard).toContain('toMatch(/import');
  });

  it('keeps TC-1068 aligned with orphan eliminated-entry ordering coverage', () => {
    const section = e2eCaseSection('TC-1068');

    // Keep the doc assertions intentionally narrow: TC prose can change as long as
    // it still links the issue to the executable API route coverage.
    expect(section).toContain('issue #1068');
    expect(section).toContain('smkc-score-app/__tests__/app/api/tournaments/[id]/ta/phases/route.test.ts');
    const routeCase = sectionBetween(
      taPhasesRouteTest,
      "it('keeps orphaned eliminated entries after round-backed eliminations'",
      "it('should query rounds with correct phase filter'",
    );
    expect(routeCase).toContain('player-orphan-eliminated');
    const anchorIdx = routeCase.indexOf('expect(call.data.entries.map');
    expect(anchorIdx).toBeGreaterThanOrEqual(0);
    const orderAssertion = routeCase.slice(anchorIdx);
    const expectedOrder = [
      "'player-active'",
      "'player-eliminated-late'",
      "'player-eliminated-early'",
      "'player-orphan-eliminated'",
    ];
    const orderIndexes = expectedOrder.map((playerId) => orderAssertion.indexOf(playerId));
    expect(orderIndexes.every((index) => index >= 0)).toBe(true);
    expect(orderIndexes).toEqual([...orderIndexes].sort((a, b) => a - b));
  });

  it('keeps TC-1067 aligned with eliminatedIds index tiebreak coverage', () => {
    const section = e2eCaseSection('TC-1067');

    expect(section).toContain('issue #1067');
    expect(section).toContain('同一ラウンド');
    expect(section).toContain('同じ `timeMs`');
    expect(section).toContain('eliminatedIds');
    expect(section).toContain('totalTime');
    expect(section).toContain('rank');
    expect(section).toContain('fallback の qualification fields ではなく `eliminatedIds` index');
    expect(section).toContain('smkc-score-app/__tests__/app/api/tournaments/[id]/ta/phases/route.test.ts');

    const routeCase = sectionBetween(
      taPhasesRouteTest,
      "it('uses eliminatedIds order as the tiebreaker for same-round same-time eliminations'",
      "it('keeps orphaned eliminated entries after round-backed eliminations'",
    );
    expect(routeCase).toContain('player-eliminated-first');
    expect(routeCase).toContain('player-eliminated-second');
    expect(routeCase).toContain('Keep totalTime/rank intentionally opposite to eliminatedIds order');
    expect(routeCase).toContain("eliminatedIds: ['player-eliminated-first', 'player-eliminated-second']");
    expect(routeCase).toContain('timeMs: 88000');
    const anchorIdx = routeCase.indexOf('expect(call.data.entries.map');
    expect(anchorIdx).toBeGreaterThanOrEqual(0);
    const orderAssertion = routeCase.slice(anchorIdx);
    const expectedOrder = [
      "'player-active'",
      "'player-eliminated-first'",
      "'player-eliminated-second'",
    ];
    const orderIndexes = expectedOrder.map((playerId) => orderAssertion.indexOf(playerId));
    expect(orderIndexes.every((index) => index >= 0)).toBe(true);
    expect(orderIndexes).toEqual([...orderIndexes].sort((a, b) => a - b));
  });

  it('keeps TC-717 aligned with the assignedCups scenario', () => {
    const section = e2eCaseSection('TC-717');

    expect(section).toContain('assignedCups');
    expect(section).toContain('FT2 相当');
    expect(section).toContain('FT3 相当');
    expect(section).toContain('first-seen');
    expect(section).toContain('round-scoped `updateMany()`');
    expect(section).toContain('O(rounds)');
    expect(section).toContain('id IN (...)');
    expect(section).toContain('一部失敗しても閲覧レスポンスを継続');
    expect(section).toContain('失敗件数と理由を警告ログ');
    expect(section).toContain('gp/finals/route.test.ts');
    expect(tcGp).toContain("require('./lib/gp-finals-validators')");
    expect(tcGp).toContain('validateGpFinalsAssignedCupSequences');
    expect(gpFinalsValidators).toContain('validateGpFinalsAssignedCupSequences');
    expect(gpFinalsValidators).toContain('isGpFinalsFt3Round');
    expect(gpFinalsValidatorExports).toEqual(expect.objectContaining({
      isGpFinalsFt3Round: expect.any(Function),
      validateGpFinalsAssignedCupSequences: expect.any(Function),
    }));
  });

  it('keeps TC-1087 aligned with finite positive round-number guards', () => {
    const section = e2eCaseSection('TC-1087');

    expect(section).toContain('有限な正の1始まり整数');
    expect(section).toContain('NaN');
    expect(section).toContain('Infinity');
    expect(tcGp).toContain('Keep the finite check explicit to cover NaN/Infinity edge cases tested in TC-1087.');
    expect(tcGp).toContain('Number.isFinite(match.roundNumber)');
    expect(tcGp).toContain('Number.isInteger(match.roundNumber)');
  });

  it('keeps TC-1079 aligned with MR finite positive round-number guards', () => {
    const section = e2eCaseSection('TC-1079');

    expect(section).toContain('MR 予選コース選択');
    expect(section).toContain('NaN');
    expect(section).toContain('Infinity');
    expect(section).toContain('tc-mr.js TC-601 内で検証');
    expect(tcMr).toContain('Number.isInteger(match.roundNumber)');
    expect(tcMr).toContain('match.roundNumber < 1');
    expect(tcMr).not.toContain('Number.isFinite(match.roundNumber)');
  });

  it('keeps TC-1083 aligned with MR participant correction coverage', () => {
    const section = e2eCaseSection('TC-1083');
    const tc1083 = sectionBetween(tcMr, 'async function runTc1083', '/**\n * TC-603');

    expect(section).toContain('issue #1083');
    expect(section).toContain('issue #1463/#1464/#1466');
    expect(section).toContain('ドキュメント確認は drift test に一本化');
    expect(section).toContain('Correct Score');
    expect(section).toContain('Submit Correction');
    expect(section).toContain('player1ReportedPoints');
    expect(section).toContain('MrScoreEditor');
    expect(tc1083).toContain("log('TC-1083'");
    expect(tc1083).toContain('Previous Reports');
    expect(tc1083).toContain('apiFetchMr');
    expect(tc1083).not.toContain('waitForTimeout(3000)');
  });

  it('keeps TC-1082 aligned with shared BM/MR participant score input coverage', () => {
    const section = e2eCaseSection('TC-1082');
    const bmPage = readRepoFile(
      'smkc-score-app',
      'src',
      'app',
      'tournaments',
      '[id]',
      'bm',
      'participant',
      'page.tsx',
    );
    const mrPage = readRepoFile(
      'smkc-score-app',
      'src',
      'app',
      'tournaments',
      '[id]',
      'mr',
      'participant',
      'page.tsx',
    );

    expect(section).toContain('issue #1082');
    expect(section).toContain('issue #1469/#1470');
    expect(section).toContain('issue #1472/#1473');
    expect(section).toContain('issue #1475/#1476/#1478');
    expect(section).toContain('issue #1480');
    expect(section).toContain('issue #1482');
    expect(section).toContain('issue #1484');
    expect(section).toContain('TypeScript AST');
    expect(section).toContain('useParticipantScoreInput');
    expect(section).toContain('requiredTotalScore');
    expect(section).toContain('maxScorePerSide');
    expect(section).toContain('TC-322');
    expect(section).toContain('TC-1083');
    expect(bmPage).toContain('useParticipantScoreInput<BMMatch>');
    expect(mrPage).toContain('useParticipantScoreInput<MRMatch>');
  });

  it('keeps TC-1072 aligned with direct LR2 loserGoesTo coverage', () => {
    const section = e2eCaseSection('TC-1072');

    expect(section).toContain('issue #1072');
    expect(section).toContain('`loserGoesTo`');
    expect(section).toContain('[23, 22, 21, 20]');
    expect(section).toContain('tc-1073-16p-lr2-slots.test.ts');
    expect(tc1073Lr2Slots).toContain('TC-1072 keeps LR2 pairing coverage on direct loserGoesTo values');
    expect(tc1073Lr2Slots).toContain('.map((match) => match.loserGoesTo)');
    expect(tc1073Lr2Slots).toContain(').toEqual([23, 22, 21, 20])');
  });

  it('keeps TC-1534-1535 aligned with direct LR2 source route coverage', () => {
    const section = e2eCaseSection('TC-1534-1535');

    expect(section).toContain('issues #1534, #1535, #1537');
    expect(section).toContain('`winnerGoesTo`');
    expect(section).toContain('`position`');
    expect(section).toContain('tc-1073-16p-lr2-slots.test.ts');
    expect(tc1073Lr2Slots).toContain('TC-1535 keeps LR2 source routes explicit on both bracket sides');
    expect(tc1073Lr2Slots).toContain(".filter((match) => match.round === 'losers_r1')");
    expect(tc1073Lr2Slots).toContain('winnerGoesTo: match.winnerGoesTo');
    expect(tc1073Lr2Slots).not.toContain('new Map(');
    expect(tc1073Lr2Slots).not.toContain('.find(');
  });

  it('keeps TC-722 from duplicating GP finals target-wins logic in E2E', () => {
    const section = e2eCaseSection('TC-722');

    expect(section).toContain('completed=true');
    expect(section).toContain('FT数を再計算せず');
    expect(section).toContain('PUTレスポンスの更新済みmatch');
    expect(section).toContain('FT3の最大3勝に対応する3カップ');
    expect(tcGp).toContain('completeGpFinalsMatchByCompletedFlag');
    expect(tcGp).toContain('gpFinalsUpdatedMatchFromPutResult');
    expect(tcGp).toContain('updated?.completed === true');
    expect(tcGp).not.toContain('gpFinalsTargetWinsForRound');
  });

  it('keeps TC-1109 aligned with direct GP max-cups usage', () => {
    const section = e2eCaseSection('TC-1109');

    expect(section).toContain('getGpFinalsMaxCups');
    expect(section).toContain('getLockedCupCountForMatch');
    expect(section).toContain('match-shaped identifier');
    expect(section).toContain('FT2は3カップ');
    expect(section).toContain('FT3は5カップ');
    expect(tcGp).toContain("log('TC-1109'");
    expect(tcGp).toContain('getGpFinalsMaxCups');
    expect(tcGp).toContain('getLockedCupCountForMatch');
    expect(tcGp).toContain('/getGpFinalsMaxCups\\([A-Za-z_][A-Za-z0-9_]*\\)/g');
    expect(tcGp).toContain('directMatchCalls.length >= 2');
  });

  it('keeps TC-1098 aligned with shared GP driver-points max usage', () => {
    const section = e2eCaseSection('TC-1098');

    expect(section).toContain('MAX_GP_DRIVER_POINTS');
    expect(section).toContain('src/lib/constants.ts');
    expect(section).toContain('gp/participant/page.tsx');
    expect(section).toContain('gp/match/[matchId]/report/route.ts');
    expect(section).toContain('page-local / route-local');
    expect(tcGp).toContain("log('TC-1098'");
    expect(tcGp).toContain('importsMaxGpDriverPointsFromConstants');
    expect(tcGp).toContain(".split(';')");
    expect(tcGp).toContain('^\\s*import\\s');
    expect(tcGp).toContain("statement.includes('MAX_GP_DRIVER_POINTS')");
    expect(tcGp).toContain('participant page does not import MAX_GP_DRIVER_POINTS from constants');
    expect(tcGp).toContain('report route does not import MAX_GP_DRIVER_POINTS from constants');
    expect(tcGp).toContain('page-local or route-local MAX_GP_DRIVER_POINTS definition remains');
  });

  it('keeps TC-1106 aligned with GP manual driver-points input bounds', () => {
    const section = e2eCaseSection('TC-1106');

    expect(section).toContain('parseGpDriverPointsInput');
    expect(section).toContain('MAX_GP_DRIVER_POINTS');
    expect(section).toContain('gp/page-client.tsx');
    expect(section).toContain('gp/finals/page.tsx');
    expect(section).toContain('type="text"');
    expect(section).toContain('inputMode="numeric"');
    expect(section).toContain('pattern="[0-9]*"');
    expect(tcGp).toContain("log('TC-1106'");
    expect(tcGp).toContain('parseGpDriverPointsInput(manualPoints1)');
    expect(tcGp).toContain('parseGpDriverPointsInput(cup.manualPoints1)');
    expect(tcGp).toContain('value <= MAX_GP_DRIVER_POINTS');
  });

  it.each(['TC-DBG-01', 'TC-DBG-02', 'TC-DBG-03', 'TC-DBG-04'])(
    'keeps %s documented as runnable focused debug-fill coverage',
    (tc) => {
      const section = e2eCaseSection(tc);

      expect(section).toContain(`tc-debug-fill.js ${tc}`);
      expect(section).toContain('npm run e2e:preview:debug-fill');
      expect(tcDebugFill).toContain(`log('${tc}'`);
    },
  );

  it('keeps debug-fill wired into the all-suite dispatcher', () => {
    expect(tcAll).toContain("require('./tc-debug-fill')");
    expect(tcAll).toContain('runDebugFillTests');
    expect(tcAll).toContain('for (const { label, mod, run } of suites)');
  });

  it('keeps PR template Jest coverage out of the E2E case catalog', () => {
    const e2eCases = readRepoFile('E2E_TEST_CASES.md');

    expect(e2eCases).not.toContain('TC-943');
    expect(e2eCases).not.toContain('__tests__/docs/pr-template.test.ts');
  });

  it.each([
    ['TC-109', 'n/a (runner command)', 'smkc-score-app/__tests__/e2e/run-preview.test.ts'],
    ['TC-111', 'n/a (runner command)', 'smkc-score-app/__tests__/e2e/preview-schema-preflight.test.ts'],
    ['TC-726', 'n/a (unit coverage)', 'smkc-score-app/__tests__/lib/gp-finals-assigned-cups.test.ts'],
    ['TC-728', 'n/a (unit coverage)', 'smkc-score-app/__tests__/lib/gp-ranking.test.ts'],
    ['TC-1009', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/static/tc-1009-overall-ranking-bracket-threshold-comments.test.ts'],
    ['TC-1080', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/static/tc-1080-qualification-route-comment.test.ts'],
    ['TC-1088', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/static/tc-1088-qualification-route-comment.test.ts'],
    ['TC-1090-1091', 'n/a (static/unit coverage)', 'smkc-score-app/__tests__/static/tc-1090-1091-overall-ranking.test.ts'],
    ['TC-1451-1452', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/helpers/e2e-cases.ts'],
    ['TC-1454-1455', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/helpers/e2e-cases.ts'],
    ['TC-1457', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/helpers/e2e-cases.ts'],
    ['TC-1528', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/e2e/ta-phase-submit-helper.test.ts'],
    ['TC-1669', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/static/tc-1009-overall-ranking-bracket-threshold-comments.test.ts'],
    ['TC-1671', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts'],
    ['TC-803', 'TC-318 でカバー済み', 'TC-318'],
  ])('keeps %s explicitly classified outside standalone browser runner registration', (tc, marker, coverage) => {
    const section = e2eCaseSection(tc);

    expect(section).toContain(marker);
    expect(section).toContain(coverage);
  });

  it('keeps late static-only TC classifications ordered within their local block', () => {
    const source = readRepoFile('smkc-score-app', '__tests__', 'docs', 'e2e-cases-drift.test.ts');
    const block = sectionBetween(
      source,
      "['TC-1451-1452', 'n/a (static/doc coverage)'",
      "['TC-803', 'TC-318 でカバー済み'",
    );

    const orderedTcs = ['TC-1451-1452', 'TC-1454-1455', 'TC-1457', 'TC-1528', 'TC-1669', 'TC-1671'];
    const indexes = orderedTcs.map((tc) => block.indexOf(`['${tc}'`));

    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('keeps TC-1090-1091 aligned with overall-ranking static and unit coverage', () => {
    const section = e2eCaseSection('TC-1090-1091');

    expect(section).toContain('issue #1090/#1091');
    expect(section).toContain('Record<MatchQualificationModel');
    expect(section).toContain('BREAK-like');
    expect(section).toContain('__tests__/lib/points/overall-ranking.test.ts');
  });

  it('keeps TC-1451-1452 aligned with the shared E2E case helper coverage', () => {
    const section = e2eCaseSection('TC-1451-1452');

    expect(section).toContain('issue #1451/#1452');
    expect(section).toContain('__tests__/helpers/e2e-cases.ts');
    expect(section).toContain('個別 finder の実装文字列には依存しない');
  });

  it('keeps TC-1454-1455 aligned with helper cache and error coverage', () => {
    const section = e2eCaseSection('TC-1454-1455');

    expect(section).toContain('issue #1454/#1455');
    expect(section).toContain('module-level cache');
    expect(section).toContain('helper 内で `expect()` を呼ばず');
  });

  it('keeps TC-1457 aligned with the readRepoFile/cache declaration order', () => {
    const section = e2eCaseSection('TC-1457');

    expect(section).toContain('issue #1457');
    expect(section).toContain('readRepoFile` 定義が `const e2eCases');
    expect(section).toContain('__tests__/helpers/e2e-cases.ts');
  });

  it('keeps TC-1528 aligned with TA phase helper unit coverage', () => {
    const section = e2eCaseSection('TC-1528');

    expect(section).toContain('issue #1528/#1530/#1531');
    expect(section).toContain('自動コース選択経路');
    expect(section).toContain('コース明示経路');
    expect(section).toContain('同じ内部 start/submit 実装');
    expect(section).toContain('内部 `submitTaPhaseRound` は公開しない');
    expect(section).toContain('__tests__/e2e/ta-phase-submit-helper.test.ts');
    expect(tcTa).toContain('submitTaPhaseRoundByApi');
    expect(tcTa).toContain('submitTaPhaseRoundWithCourseByApi');
    expect(tcTa).toContain('submitTaPhaseRound(adminPage, tournamentId, phase, course, results)');
    expect(tcTa).not.toContain('function phaseCourseLabel');
    expect(tcTa).not.toContain('submitTaPhaseRound,');
  });

  it('keeps TC-111 aligned with the preview D1 columns that fail GP finals before browser launch', () => {
    const section = e2eCaseSection('TC-111');

    expect(section).toContain('Tournament.publicModes');
    expect(section).toContain('GPMatch.assignedCups');
    expect(section).toContain('GPMatch.suddenDeathWinnerId');
    expect(section).toContain('WRANGLER_LOG_PATH');
    expect(section).toContain('wrangler login');
  });

  it('documents TC-825 as a full Prisma migration JSON type guard for D1', () => {
    const section = e2eCaseSection('TC-825');

    expect(section).toContain('issue #825/#1838');
    expect(section).toContain('全 Prisma migration');
    expect(section).toContain('`prisma/migrations/**/migration.sql`');
    expect(section).toContain('__tests__/docs/prisma-migrations.test.ts');
    expect(prismaMigrationsTest).toContain('migrationSqlFiles');
    expect(prismaMigrationsTest).toContain('expect(jsonbMigrations).toEqual([])');
  });

  it('documents TC-824 as Phase3 sudden-death explicit order coverage', () => {
    const section = e2eCaseSection('TC-824');

    expect(section).toContain('issue #824');
    expect(section).toContain('rank offset');
    expect(section).toContain('明示順序 map');
    expect(section).toContain('__tests__/lib/ta/finals-phase-manager.test.ts');
    expect(taFinalsPhaseManagerTest).toContain('uses resolved sudden-death order');
    expect(taFinalsPhaseManagerTest).toContain('resolvedOrder');
  });

  it('documents TC-823 as intentional immediate-repeat avoidance for TA course selection', () => {
    const section = e2eCaseSection('TC-823A');

    expect(section).toContain('issue #823');
    expect(section).toContain('back-to-back repeat');
    expect(section).toContain('selectRandomAvailableCourse');
    expect(section).toContain('__tests__/lib/ta/course-selection.test.ts');
    expect(taCourseSelection).toContain('do not immediately repeat');
    expect(taCourseSelectionTest).toContain('avoids the immediately previous course');
    expect(taCourseSelectionTest).toContain('only available course');
  });

  it('documents TC-822A as TA sudden-death UI i18n coverage', () => {
    const section = e2eCaseSection('TC-822A');

    expect(section).toContain('issue #822');
    expect(section).toContain('suddenDeathTiebreak');
    expect(enMessages).toContain('"taSuddenDeath"');
    expect(jaMessages).toContain('"taSuddenDeath"');
    expect(taSuddenDeathPanel).toContain('useTranslations("taSuddenDeath")');
    for (const key of ['suddenDeathTiebreak', 'suddenDeathRoundDesc', 'suddenDeathCourse', 'submitSuddenDeath']) {
      expect(enMessages).toContain(`"${key}"`);
      expect(jaMessages).toContain(`"${key}"`);
      expect(taSuddenDeathPanel).toContain(`"${key}"`);
    }
    expect(taFinalsPage).toContain("'invalidTimeFor'");
    expect(taEliminationPhase).toContain("'invalidTimeFor'");
    expect(taFinalsPage).not.toContain('Submit sudden death');
    expect(taFinalsPage).not.toContain('Sudden-death tiebreak');
    expect(taFinalsPage).not.toContain('Sudden-death course');
    expect(taFinalsPage).not.toContain('Enter M:SS.mm format.');
    expect(taEliminationPhase).not.toContain('Submit sudden death');
    expect(taEliminationPhase).not.toContain('Sudden-death tiebreak');
    expect(taEliminationPhase).not.toContain('Sudden-death course');
    expect(taEliminationPhase).not.toContain('Enter M:SS.mm format.');
  });

  it('documents TC-821A as shared TA sudden-death UI and logic coverage', () => {
    const section = e2eCaseSection('TC-821A');

    expect(section).toContain('issue #821');
    expect(section).toContain('TASuddenDeathPanel');
    expect(section).toContain('useTaSuddenDeath');
    expect(taSuddenDeathPanel).toContain('export function useTaSuddenDeath');
    expect(taSuddenDeathPanel).toContain('export function TASuddenDeathPanel');
    expect(taSuddenDeathPanel).toContain('change_sudden_death_course');
    expect(taSuddenDeathPanel).toContain('submit_sudden_death');
    expect(taFinalsPage).toContain('<TASuddenDeathPanel');
    expect(taFinalsPage).toContain('useTaSuddenDeath({');
    expect(taEliminationPhase).toContain('<TASuddenDeathPanel');
    expect(taEliminationPhase).toContain('useTaSuddenDeath({');
    expect(taFinalsPage).not.toContain('change_sudden_death_course');
    expect(taFinalsPage).not.toContain('submit_sudden_death');
    expect(taEliminationPhase).not.toContain('change_sudden_death_course');
    expect(taEliminationPhase).not.toContain('submit_sudden_death');
  });

  it('documents TC-1864A as shared TA sudden-death hook fetch coverage', () => {
    const section = e2eCaseSection('TC-1864A');

    expect(section).toContain('issue #1864');
    expect(section).toContain('handleSubmitSuddenDeath');
    expect(section).toContain('handleSuddenDeathCourseChange');
    expect(section).toContain('ta-sudden-death-panel.test.tsx');
    expect(taSuddenDeathPanelTest).toContain('submits sudden-death results');
    expect(taSuddenDeathPanelTest).toContain('reports submit API errors');
    expect(taSuddenDeathPanelTest).toContain('changes sudden-death course');
    expect(taSuddenDeathPanelTest).toContain('reports course-change API errors');
    expect(taSuddenDeathPanelTest).toContain('submit_sudden_death');
    expect(taSuddenDeathPanelTest).toContain('change_sudden_death_course');
  });

  it('documents TC-1865A as shared TA sudden-death empty-blur coverage', () => {
    const section = e2eCaseSection('TC-1865A');

    expect(section).toContain('issue #1865');
    expect(section).toContain('空入力');
    expect(section).toContain('if (!raw || raw.trim() === "") return;');
    expect(section).toContain('ta-sudden-death-panel.test.tsx');
    expect(taSuddenDeathPanel).toContain('if (!raw || raw.trim() === "") return;');
    expect(taSuddenDeathPanelTest).toContain('keeps empty blur as a no-op');
    expect(taSuddenDeathPanelTest).toContain('handleSuddenDeathTimeBlur');
    expect(taSuddenDeathPanelTest).toContain('suddenDeathTimes).toEqual({})');
  });

  it('documents TC-1867A as restore-safe fetch mocking coverage', () => {
    const section = e2eCaseSection('TC-1867A');

    expect(section).toContain('issue #1867');
    expect(section).toContain("jest.spyOn(global, 'fetch')");
    expect(section).toContain('global.fetch =');
    expect(section).toContain('jest.restoreAllMocks()');
    expect(taSuddenDeathPanelTest).toContain("jest.spyOn(global, 'fetch')");
    expect(taSuddenDeathPanelTest).not.toContain('global.fetch =');
    expect(taSuddenDeathPanelTest).toContain('jest.restoreAllMocks()');
  });

  it('documents TC-1868A as shared TA sudden-death blur auto-format coverage', () => {
    const section = e2eCaseSection('TC-1868A');

    expect(section).toContain('issue #1868');
    expect(section).toContain('autoFormatTime');
    expect(section).toContain('1:00.00');
    expect(section).toContain('ta-sudden-death-panel.test.tsx');
    expect(taSuddenDeathPanelTest).toContain('auto-formats a valid time string on blur');
    expect(taSuddenDeathPanelTest).toContain("setSuddenDeathTime('player-1', '10000')");
    expect(taSuddenDeathPanelTest).toContain("handleSuddenDeathTimeBlur('player-1')");
    expect(taSuddenDeathPanelTest).toContain("toBe('1:00.00')");
  });

  it('documents TC-534 as BM Top-24 unresolved winner warning coverage', () => {
    const section = e2eCaseSection('TC-534');

    expect(section).toContain('playoff_r2');
    expect(section).toContain('winner 不定');
    expect(section).toContain('warning');
    expect(section).toContain('matchNumber');
    expect(section).toContain('advancesToUpperSeed');
    expect(section).toContain('finals-route.test.ts');
    expect(section).toContain('server-side warning');
  });

  it('documents TC-535 as BM Top-24 qualification label coverage', () => {
    const section = e2eCaseSection('TC-535');

    expect(section).toContain('qualificationRankLabel');
    expect(section).toContain('buildQualificationRankLabelMap');
    expect(section).toContain('tc-bm.js TC-510');
    expect(section).toContain('playoff-bracket.test.tsx');
    expect(tcBm).toContain('qualificationRankLabel');
    expect(tcBm).toContain('playoffSeedLabelsOk');
    expect(tcBm).toContain('directSeedLabelsOk');
  });

  it('documents TC-1051 as the Top-24 directSeeds-only contract', () => {
    const section = e2eCaseSection('TC-1051');
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'finals-group-selection.test.ts',
    );
    const runTc510OkBlock = sectionBetween(
      tcBm,
      'const ok = playoffCreated',
      "log('TC-510'",
    );

    expect(section).toContain('issue #1051');
    expect(section).toContain('legacy `direct[]`');
    expect(section).toContain('`directSeeds`');
    expect(section).toContain('tc-bm.js TC-510');
    expect(tcBm).toContain("log('TC-1051'");
    expect(tcBm).toContain('legacyDirectPayloadAbsent');
    expect(runTc510OkBlock).toContain('legacyDirectPayloadAbsent');
    expect(unitTest).toContain("does not expose the redundant direct[] projection for 2 groups");
    expect(unitTest).toContain("expect('direct' in result).toBe(false)");
  });

  it('keeps TC-1048 aligned with the shared Top-24 Phase-2 action card', () => {
    const section = e2eCaseSection('TC-1048');
    const component = readRepoFile(
      'smkc-score-app',
      'src',
      'components',
      'tournament',
      'playoff-complete-card.tsx',
    );
    const componentTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'components',
      'tournament',
      'playoff-complete-card.test.tsx',
    );

    expect(section).toContain('issue #1048');
    expect(section).toContain('tc-bm.js TC-515');
    expect(section).toContain('tc-mr.js TC-615');
    expect(section).toContain('tc-gp.js TC-715');
    expect(component).toContain('export function PlayoffCompleteCard');
    expect(componentTest).toContain('Create Upper Bracket');
    for (const script of [tcBm, tcMr, tcGp]) {
      expect(script).toContain('phase2ActionVisible');
      expect(script).toContain('Create Upper Bracket action missing after playoff completion');
    }
  });

  it('keeps TC-1046 aligned with the Top-24 qualifier-count guard', () => {
    const section = e2eCaseSection('TC-1046');
    const routeFactory = readRepoFile(
      'smkc-score-app',
      'src',
      'lib',
      'api-factories',
      'finals-route.ts',
    );
    const unitTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'api-factories',
      'finals-route.test.ts',
    );

    expect(section).toContain('issue #1046');
    expect(section).toContain('TOP24_QUALIFIER_COUNT');
    expect(section).toContain('PLAYOFF_ENTRANT_COUNT');
    expect(section).toContain('tc-bm.js TC-1046');
    expect(tcBm).toContain("log('TC-1046'");
    expect(routeFactory).toContain('const TOP24_QUALIFIER_COUNT = 24');
    expect(unitTest).toContain('does not build a Top-16 preview when a Top-24 playoff has fewer than 24 qualifiers');
  });

  it('keeps TC-1047 aligned with Top-24 preview fallback logging and typing', () => {
    const section = e2eCaseSection('TC-1047');
    const routeFactory = readRepoFile(
      'smkc-score-app',
      'src',
      'lib',
      'api-factories',
      'finals-route.ts',
    );
    const routeTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'lib',
      'api-factories',
      'finals-route.test.ts',
    );
    const staticTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1047-top24-preview-logging.test.ts',
    );

    expect(section).toContain('issue #1047/#1045/#1628/#1630');
    expect(section).toContain('errorName・errorCode・tournamentId・eventTypeCode');
    expect(section).toContain('Error オブジェクト全体をログに渡さず');
    expect(section).toContain('コメント文言ではなくログ helper 呼び出し');
    expect(section).toContain('`any[]` / `unknown`');
    expect(routeFactory).toContain('Failed to build Top-24 finals preview');
    expect(routeFactory).toContain('getSafeErrorLogFields');
    expect(routeFactory).toContain('playoffMatches: Top24FinalsPreviewMatch[]');
    expect(staticTest).not.toContain('Do not log Error objects or messages here');
    expect(routeTest).toContain('logs and falls back when Top-24 preview construction fails');
    expect(staticTest).toContain('playoffMatches: Top24FinalsPreviewMatch[]');
  });

  it('keeps TC-1622 aligned with the BM 28-to-23 reseed guard', () => {
    const section = e2eCaseSection('TC-1622');

    expect(section).toContain('issue #1622');
    expect(section).toContain('23名に置換');
    expect(section).toContain('tc-bm.js TC-1046');
    expect(section).toContain('finals-route.test.ts');
    expect(tcBm).toContain('TC-1622');
    expect(tcBm).toContain('TC-1622 qualification count after 23-player reseed');
  });

  it('keeps TC-1612 aligned with the PlayoffCompleteCard className merge contract', () => {
    const section = e2eCaseSection('TC-1612');
    const componentTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'components',
      'tournament',
      'playoff-complete-card.test.tsx',
    );

    expect(section).toContain('issue #1612');
    expect(section).toContain('border-green-500/50');
    expect(section).toContain('bg-green-500/10');
    expect(componentTest).toContain('callers provide only additional layout classes');
    expect(componentTest).toContain('className is empty');
  });

  it('keeps TC-1614 aligned with implementation-detail-free TC-1612 drift coverage', () => {
    const section = e2eCaseSection('TC-1614');
    const driftTestSource = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'docs',
      'e2e-cases-drift.test.ts',
    );
    const tc1612DriftTest = sectionBetween(
      driftTestSource,
      "it('keeps TC-1612 aligned with the PlayoffCompleteCard className merge contract'",
      "it('keeps TC-1614 aligned",
    );
    // Current TC-1612 guard body is substantially longer than this threshold;
    // the named lower bound catches empty/truncated extraction while allowing
    // harmless wording edits in the test body.
    const TC1612_DRIFT_MIN_BODY_LENGTH = 300;

    expect(section).toContain('issue #1614');
    expect(section).toContain('コンポーネントソースファイルの文字列詳細を検査していない');
    // Positive anchors keep the negative string checks from passing against an
    // empty extraction if the surrounding test names are refactored later.
    expect(tc1612DriftTest.length).toBeGreaterThan(TC1612_DRIFT_MIN_BODY_LENGTH);
    expect(tc1612DriftTest).toContain("const section = e2eCaseSection('TC-1612');");
    expect(tc1612DriftTest).not.toContain("'src'");
    expect(tc1612DriftTest).not.toContain("'playoff-complete-card.tsx'");
    expect(tc1612DriftTest).not.toContain('import { cn }');
    expect(tc1612DriftTest).not.toContain('className={cn(');
  });

  it('keeps TC-1616 aligned with positive extraction assertions for the TC-1614 guard', () => {
    const section = e2eCaseSection('TC-1616');
    const driftTestSource = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'docs',
      'e2e-cases-drift.test.ts',
    );
    const tc1614DriftTest = sectionBetween(
      driftTestSource,
      "it('keeps TC-1614 aligned with implementation-detail-free TC-1612 drift coverage'",
      "it('keeps TC-1616 aligned",
    );

    expect(section).toContain('issue #1616');
    expect(section).toContain('陽性アサーション');
    expect(tc1614DriftTest).toContain('toBeGreaterThan');
    expect(tc1614DriftTest).toContain('e2eCaseSection');
    expect(tc1614DriftTest.indexOf('toBeGreaterThan')).toBeLessThan(
      tc1614DriftTest.indexOf("not.toContain(\"'src'\")"),
    );
  });

  it('keeps TC-1618 and TC-1619 aligned with stable TC-1614 extraction anchors', () => {
    const tc1618 = e2eCaseSection('TC-1618');
    const tc1619 = e2eCaseSection('TC-1619');
    const driftTestSource = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'docs',
      'e2e-cases-drift.test.ts',
    );
    const tc1614DriftTest = sectionBetween(
      driftTestSource,
      "it('keeps TC-1614 aligned with implementation-detail-free TC-1612 drift coverage'",
      "it('keeps TC-1616 aligned",
    );

    expect(tc1618).toContain('issue #1618');
    expect(tc1618).toContain('先頭スペースに依存していない');
    expect(tc1619).toContain('issue #1619');
    expect(tc1619).toContain('名前付き定数');
    expect(tc1614DriftTest).not.toContain('"  it(');
    expect(tc1614DriftTest).toContain('TC1612_DRIFT_MIN_BODY_LENGTH');
    expect(tc1614DriftTest).toContain('Current TC-1612 guard body is substantially longer');
  });

  it('does not leave retired TC identifiers in runnable E2E scripts as false drift signals', () => {
    expect(tcAll).not.toContain('TC-403');
  });
});

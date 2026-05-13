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
  const gpFinalsValidators = readE2eLib('gp-finals-validators.js');
  const tc1073Lr2Slots = readRepoFile('smkc-score-app', '__tests__', 'e2e', 'tc-1073-16p-lr2-slots.test.ts');
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
    ['TC-TA-FLOW-24', tcTaFlow],
  ])('keeps %s documented and registered in its runnable E2E script', (tc, scriptSource) => {
    const section = e2eCaseSection(tc);

    expect(section).toContain('**手順**');
    expect(section).toContain('**期待結果**');
    expect(section).toContain(`**スクリプト**:`);
    expect(scriptSource).toContain(`log('${tc}'`);
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

  it('keeps TC-1063 aligned with the combined standings memoization guard', () => {
    const section = e2eCaseSection('TC-1063');
    const guard = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'static',
      'tc-1063-combined-rankings-usememo.test.ts',
    );

    expect(section).toContain('issue #1063');
    expect(section).toContain('BM/MR/GP');
    expect(section).toContain('useMemo');
    expect(section).toContain('computeCombinedRanks');
    expect(section).toContain('tc-1063-combined-rankings-usememo.test.ts');
    expect(guard).toContain('combinedRankings');
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

  it.each([
    ['TC-109', 'n/a (runner command)', 'smkc-score-app/__tests__/e2e/run-preview.test.ts'],
    ['TC-111', 'n/a (runner command)', 'smkc-score-app/__tests__/e2e/preview-schema-preflight.test.ts'],
    ['TC-726', 'n/a (unit coverage)', 'smkc-score-app/__tests__/lib/gp-finals-assigned-cups.test.ts'],
    ['TC-728', 'n/a (unit coverage)', 'smkc-score-app/__tests__/lib/gp-ranking.test.ts'],
    ['TC-1080', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/static/tc-1080-qualification-route-comment.test.ts'],
    ['TC-1088', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/static/tc-1088-qualification-route-comment.test.ts'],
    ['TC-1090-1091', 'n/a (static/unit coverage)', 'smkc-score-app/__tests__/static/tc-1090-1091-overall-ranking.test.ts'],
    ['TC-1451-1452', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/helpers/e2e-cases.ts'],
    ['TC-1454-1455', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/helpers/e2e-cases.ts'],
    ['TC-1457', 'n/a (static/doc coverage)', 'smkc-score-app/__tests__/helpers/e2e-cases.ts'],
    ['TC-1528', 'n/a (unit/static coverage)', 'smkc-score-app/__tests__/e2e/ta-phase-submit-helper.test.ts'],
    ['TC-803', 'TC-318 でカバー済み', 'TC-318'],
    ['TC-943', '.github/pull_request_template.md', '__tests__/docs/pr-template.test.ts'],
  ])('keeps %s explicitly classified outside standalone browser runner registration', (tc, marker, coverage) => {
    const section = e2eCaseSection(tc);

    expect(section).toContain(marker);
    expect(section).toContain(coverage);
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

  it('does not leave retired TC identifiers in runnable E2E scripts as false drift signals', () => {
    expect(tcAll).not.toContain('TC-403');
  });
});

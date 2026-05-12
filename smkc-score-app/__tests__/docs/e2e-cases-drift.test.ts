import fs from 'fs';
import path from 'path';
import * as gpFinalsValidatorExports from '../../e2e/lib/gp-finals-validators';

const root = path.join(process.cwd(), '..');
const casesPath = path.join(root, 'E2E_TEST_CASES.md');
const cases = fs.readFileSync(casesPath, 'utf8');

function readE2eScript(script: string) {
  return fs.readFileSync(path.join(process.cwd(), 'e2e', script), 'utf8');
}

function readE2eLib(script: string) {
  return fs.readFileSync(path.join(process.cwd(), 'e2e', 'lib', script), 'utf8');
}

function sectionFor(tc: string) {
  const heading = new RegExp(`^#{2,3} ${tc}:`, 'm');
  const match = heading.exec(cases);
  const start = match?.index ?? -1;
  if (start === -1) throw new Error(`${tc} section not found`);
  const next = cases.slice(start + 1).search(/\n#{2,3} TC-/);
  const end = next === -1 ? cases.length : start + 1 + next;
  return cases.slice(start, end);
}

describe('E2E case drift coverage', () => {
  const tcAll = readE2eScript('tc-all.js');
  const tcBm = readE2eScript('tc-bm.js');
  const tcGp = readE2eScript('tc-gp.js');
  const tcOverlay = readE2eScript('tc-overlay.js');
  const tcDebugFill = readE2eScript('tc-debug-fill.js');
  const tcTaFlow = readE2eScript('tc-ta-flow.js');
  const gpFinalsValidators = readE2eLib('gp-finals-validators.js');

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
    ['TC-1417', tcAll],
    ['TC-725', tcGp],
    ['TC-1087', tcGp],
    ['TC-729', tcGp],
    ['TC-926', tcOverlay],
    ['TC-TA-FLOW-24', tcTaFlow],
  ])('keeps %s documented and registered in its runnable E2E script', (tc, scriptSource) => {
    const section = sectionFor(tc);

    expect(section).toContain('**手順**');
    expect(section).toContain('**期待結果**');
    expect(section).toContain(`**スクリプト**:`);
    expect(scriptSource).toContain(`log('${tc}'`);
  });

  it('keeps TC-702 aligned with direct driver-points JsonNull reporting coverage', () => {
    const section = sectionFor('TC-702');

    expect(section).toContain('issue #1099/#1437');
    expect(section).toContain('`Prisma.JsonNull`');
    expect(section).toContain('`null`');
    expect(tcGp).toContain("{ name: 'TC-702', fn: runTc702 }");
    expect(tcGp).toContain('updated?.player1ReportedRaces === null');
  });

  it('keeps TC-TA-FLOW-24 documented as the parent runnable for rank sub-coverage', () => {
    const section = sectionFor('TC-TA-FLOW-24');

    expect(section).toContain('24名 TA');
    expect(section).toContain('TC-TA-FLOW-24-RANK');
    expect(section).toContain('npm run e2e:preview:ta-flow');
    expect(tcTaFlow).toContain("{ name: 'TC-TA-FLOW-24', fn: runFullFlow }");
  });

  it('keeps TC-717 aligned with the assignedCups scenario', () => {
    const section = sectionFor('TC-717');

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
    const section = sectionFor('TC-1087');

    expect(section).toContain('有限な正の1始まり整数');
    expect(section).toContain('NaN');
    expect(section).toContain('Infinity');
    expect(tcGp).toContain('Keep the finite check explicit to cover NaN/Infinity edge cases tested in TC-1087.');
    expect(tcGp).toContain('Number.isFinite(match.roundNumber)');
    expect(tcGp).toContain('Number.isInteger(match.roundNumber)');
  });

  it('keeps TC-722 from duplicating GP finals target-wins logic in E2E', () => {
    const section = sectionFor('TC-722');

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
    const section = sectionFor('TC-1109');

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
    const section = sectionFor('TC-1098');

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
    const section = sectionFor('TC-1106');

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
      const section = sectionFor(tc);

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
    ['TC-803', 'TC-318 でカバー済み', 'TC-318'],
    ['TC-943', '.github/pull_request_template.md', '__tests__/docs/pr-template.test.ts'],
  ])('keeps %s explicitly classified outside standalone browser runner registration', (tc, marker, coverage) => {
    const section = sectionFor(tc);

    expect(section).toContain(marker);
    expect(section).toContain(coverage);
  });

  it('keeps TC-111 aligned with the preview D1 columns that fail GP finals before browser launch', () => {
    const section = sectionFor('TC-111');

    expect(section).toContain('Tournament.publicModes');
    expect(section).toContain('GPMatch.assignedCups');
    expect(section).toContain('GPMatch.suddenDeathWinnerId');
    expect(section).toContain('WRANGLER_LOG_PATH');
    expect(section).toContain('wrangler login');
  });

  it('documents TC-534 as BM Top-24 unresolved winner warning coverage', () => {
    const section = sectionFor('TC-534');

    expect(section).toContain('playoff_r2');
    expect(section).toContain('winner 不定');
    expect(section).toContain('warning');
    expect(section).toContain('matchNumber');
    expect(section).toContain('advancesToUpperSeed');
    expect(section).toContain('finals-route.test.ts');
    expect(section).toContain('server-side warning');
  });

  it('documents TC-535 as BM Top-24 qualification label coverage', () => {
    const section = sectionFor('TC-535');

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

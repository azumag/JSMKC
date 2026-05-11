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
  const tcGp = readE2eScript('tc-gp.js');
  const tcOverlay = readE2eScript('tc-overlay.js');
  const tcDebugFill = readE2eScript('tc-debug-fill.js');
  const gpFinalsValidators = readE2eLib('gp-finals-validators.js');

  it.each([
    ['TC-352', tcAll],
    ['TC-357', tcAll],
    ['TC-717', tcGp],
    ['TC-722', tcGp],
    ['TC-1103', tcGp],
    ['TC-725', tcGp],
    ['TC-926', tcOverlay],
  ])('keeps %s documented and registered in its runnable E2E script', (tc, scriptSource) => {
    const section = sectionFor(tc);

    expect(section).toContain('**手順**');
    expect(section).toContain('**期待結果**');
    expect(section).toContain(`**スクリプト**:`);
    expect(scriptSource).toContain(`log('${tc}'`);
  });

  it('keeps TC-717 aligned with the assignedCups scenario', () => {
    const section = sectionFor('TC-717');

    expect(section).toContain('assignedCups');
    expect(section).toContain('FT2 相当');
    expect(section).toContain('FT3 相当');
    expect(tcGp).toContain("require('./lib/gp-finals-validators')");
    expect(tcGp).toContain('validateGpFinalsAssignedCupSequences');
    expect(gpFinalsValidators).toContain('validateGpFinalsAssignedCupSequences');
    expect(gpFinalsValidators).toContain('isGpFinalsFt3Round');
    expect(gpFinalsValidatorExports).toEqual(expect.objectContaining({
      isGpFinalsFt3Round: expect.any(Function),
      validateGpFinalsAssignedCupSequences: expect.any(Function),
    }));
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

  it('does not leave retired TC identifiers in runnable E2E scripts as false drift signals', () => {
    expect(tcAll).not.toContain('TC-403');
  });
});

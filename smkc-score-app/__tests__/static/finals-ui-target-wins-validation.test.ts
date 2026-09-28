import { readRepoFile } from '../helpers/e2e-cases';

describe('finals UI persisted targetWins validation contract', () => {
  const bmSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'bm', 'finals', 'page.tsx');
  const mrSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'mr', 'finals', 'page.tsx');
  const gpSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'gp', 'finals', 'page.tsx');

  it('does not bypass shared targetWins validation with direct persisted-value fallbacks', () => {
    for (const source of [bmSource, mrSource, gpSource]) {
      expect(source).not.toContain('selectedMatch?.targetWins ??');
      expect(source).not.toContain('match?.targetWins ??');
    }
  });

  it('routes BM persisted targetWins through getBmFinalsTargetWins', () => {
    expect(bmSource).toContain('getBmFinalsTargetWins(selectedMatch)');
    expect(bmSource).toContain('getBmFinalsTargetWins({');
    expect(bmSource).toContain('targetWins: match?.targetWins');
  });

  it('routes MR persisted targetWins through getMrFinalsTargetWins', () => {
    expect(mrSource).toContain('getMrFinalsTargetWins(selectedMatch)');
    expect(mrSource).toContain('targetWins: match?.targetWins');
  });

  it('routes GP persisted targetWins through getGpFinalsTargetWins', () => {
    expect(gpSource).toContain('getGpFinalsTargetWins({');
    expect(gpSource).toContain('targetWins: match?.targetWins');
  });
});

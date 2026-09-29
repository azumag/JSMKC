import { readRepoFile } from '../helpers/e2e-cases';

describe('finals UI persisted targetWins validation contract', () => {
  const bmSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'bm', 'finals', 'page.tsx');
  const mrSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'mr', 'finals', 'page.tsx');
  const gpSource = readRepoFile('smkc-score-app', 'src', 'app', 'tournaments', '[id]', 'gp', 'finals', 'page.tsx');

  it('does not bypass shared targetWins validation with direct persisted-value fallbacks', () => {
    for (const source of [bmSource, mrSource, gpSource]) {
      expect(source).not.toMatch(/selectedMatch\?\.targetWins\s*\?\?/);
      expect(source).not.toMatch(/match\?\.targetWins\s*\?\?/);
    }
  });

  it('routes BM persisted targetWins through getBmFinalsTargetWins', () => {
    expect(bmSource).toMatch(/getBmFinalsTargetWins\(\s*selectedMatch\s*\)/);
    expect(bmSource).toMatch(/getBmFinalsTargetWins\(\s*\{/);
    expect(bmSource).toMatch(/targetWins:\s*match\?\.targetWins/);
  });

  it('routes MR persisted targetWins through getMrFinalsTargetWins', () => {
    expect(mrSource).toMatch(/getMrFinalsTargetWins\(\s*selectedMatch\s*\)/);
    expect(mrSource).toMatch(/targetWins:\s*match\?\.targetWins/);
  });

  it('routes GP persisted targetWins through getGpFinalsTargetWins', () => {
    expect(gpSource).toMatch(/getGpFinalsTargetWins\(\s*\{/);
    expect(gpSource).toMatch(/targetWins:\s*match\?\.targetWins/);
  });
});

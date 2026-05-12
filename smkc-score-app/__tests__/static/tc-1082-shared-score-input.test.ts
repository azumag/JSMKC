import { readRepoFile } from '../helpers/e2e-cases';

describe('TC-1082 shared BM/MR participant score input guards', () => {
  it('keeps BM and MR participant pages on the shared score input hook', () => {
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
    const hook = readRepoFile('smkc-score-app', 'src', 'lib', 'hooks', 'useParticipantScoreInput.ts');

    expect(bmPage).toContain('useParticipantScoreInput<BMMatch>');
    expect(mrPage).toContain('useParticipantScoreInput<MRMatch>');
    expect(bmPage).not.toContain('const getInitialScores =');
    expect(mrPage).not.toContain('const getInitialScores =');
    expect(hook).toContain('const getInitialScores = useCallback');
    expect(hook).toContain('const handleSubmitScore = useCallback');
    expect(hook).toContain('maxScorePerSide = requiredTotalScore');
    expect(hook).toContain('requiredTotalScore = 4');
    expect(hook).toContain('requiredTotalScore,');
    expect(hook).not.toContain('    maxScorePerSide,');
    expect(bmPage).toContain('scores.score1 + scores.score2 === requiredTotalScore');
    expect(mrPage).toContain('scores.score1 + scores.score2 === requiredTotalScore');
  });

  it('documents TC-1082 as the BM/MR shared participant score-input scenario', () => {
    const cases = readRepoFile('E2E_TEST_CASES.md');
    const driftTest = readRepoFile(
      'smkc-score-app',
      '__tests__',
      'docs',
      'e2e-cases-drift.test.ts',
    );

    expect(cases).toContain('## TC-1082: BM/MR participant スコア入力ロジック共通化');
    expect(cases).toContain('issue #1082');
    expect(cases).toContain('useParticipantScoreInput');
    expect(driftTest).toContain("e2eCaseSection('TC-1082')");
  });
});

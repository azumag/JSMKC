import {
  functionReturnObjectLiteral,
  readRepoFile,
} from '../helpers/e2e-cases';

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
    const hookReturnObject = functionReturnObjectLiteral(hook, 'useParticipantScoreInput');

    expect(bmPage).toContain('useParticipantScoreInput<BMMatch>');
    expect(mrPage).toContain('useParticipantScoreInput<MRMatch>');
    expect(bmPage).not.toContain('const getInitialScores =');
    expect(mrPage).not.toContain('const getInitialScores =');
    expect(hook).toContain('const getInitialScores = useCallback');
    expect(hook).toContain('const handleSubmitScore = useCallback');
    expect(hook).toContain('maxScorePerSide = requiredTotalScore');
    expect(hook).toContain('requiredTotalScore = 4');
    expect(hookReturnObject).toContain('requiredTotalScore');
    expect(hookReturnObject).not.toContain('maxScorePerSide');
    expect(bmPage).toContain('scores.score1 + scores.score2 === requiredTotalScore');
    expect(mrPage).toContain('scores.score1 + scores.score2 === requiredTotalScore');
  });

  it('keeps the return-object guard stable when nested object literals appear first', () => {
    const returnObject = functionReturnObjectLiteral(`
      export function useParticipantScoreInput() {
        const nested = true;
        return {
          diagnostics: { nested },
          requiredTotalScore: 4,
          maxScorePerSide: 4,
        };
      }
    `, 'useParticipantScoreInput');

    expect(returnObject).toContain('diagnostics: { nested }');
    expect(returnObject).toContain('maxScorePerSide');
  });

  it('can inspect arrow-function and function-expression hook forms', () => {
    const arrowReturnObject = functionReturnObjectLiteral(`
      export const useParticipantScoreInput = () => {
        return {
          diagnostics: { source: 'arrow' },
          requiredTotalScore: 4,
        };
      };
    `, 'useParticipantScoreInput');
    const functionExpressionReturnObject = functionReturnObjectLiteral(`
      export const useParticipantScoreInput = function() {
        return {
          diagnostics: { source: 'function expression' },
          requiredTotalScore: 4,
        };
      };
    `, 'useParticipantScoreInput');

    expect(arrowReturnObject).toContain("source: 'arrow'");
    expect(functionExpressionReturnObject).toContain("source: 'function expression'");
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
    expect(cases).toContain('issue #1480');
    expect(cases).toContain('issue #1482');
    expect(cases).toContain('useParticipantScoreInput');
    expect(driftTest).toContain("e2eCaseSection('TC-1082')");
  });
});

/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { useParticipantScoreInput, type ParticipantScoreInputMatch } from '@/lib/hooks/useParticipantScoreInput';

interface TestMatch extends ParticipantScoreInputMatch {
  player1ReportedScore1?: number | null;
  player1ReportedScore2?: number | null;
  player2ReportedScore1?: number | null;
  player2ReportedScore2?: number | null;
}

const makeMatch = (overrides: Partial<TestMatch> = {}): TestMatch => ({
  id: 'match-1',
  matchNumber: 1,
  stage: 'qualification',
  player1: { id: 'player-1', name: 'Player 1', nickname: 'P1' },
  player1Side: 1,
  player2: { id: 'player-2', name: 'Player 2', nickname: 'P2' },
  player2Side: 2,
  completed: false,
  score1: 0,
  score2: 0,
  ...overrides,
});

function renderScoreInput(options: {
  playerId?: string;
  submitReport?: jest.Mock;
  setError?: jest.Mock;
  onSubmitSuccess?: jest.Mock;
} = {}) {
  const submitReport = options.submitReport ?? jest.fn().mockResolvedValue({ ok: true });
  const setError = options.setError ?? jest.fn();
  const onSubmitSuccess = options.onSubmitSuccess ?? jest.fn();

  const hook = renderHook(() =>
    useParticipantScoreInput<TestMatch>({
      playerId: options.playerId ?? 'player-1',
      getReportedScores: (match, isPlayer1) => ({
        score1: isPlayer1 ? match.player1ReportedScore1 : match.player2ReportedScore1,
        score2: isPlayer1 ? match.player1ReportedScore2 : match.player2ReportedScore2,
      }),
      submitReport,
      setError,
      totalMustEqualMessage: 'total must equal 4',
      onSubmitSuccess,
    })
  );

  return { ...hook, submitReport, setError, onSubmitSuccess };
}

describe('useParticipantScoreInput', () => {
  it('uses the current player report before completed match scores', () => {
    const { result } = renderScoreInput();
    const match = makeMatch({
      completed: true,
      score1: 4,
      score2: 0,
      player1ReportedScore1: 3,
      player1ReportedScore2: 1,
    });

    expect(result.current.getInitialScores(match)).toEqual({ score1: 3, score2: 1 });
    expect(result.current.hasOwnReport(match)).toBe(true);
  });

  it('uses completed scores as the shared submit fallback', async () => {
    const { result, submitReport, setError, onSubmitSuccess } = renderScoreInput();
    const match = makeMatch({ completed: true, score1: 3, score2: 1 });

    await act(async () => {
      await result.current.handleSubmitScore(match);
    });

    expect(setError).toHaveBeenCalledWith(null);
    expect(submitReport).toHaveBeenCalledWith('match-1', {
      reportingPlayer: 1,
      score1: 3,
      score2: 1,
    });
    expect(onSubmitSuccess).toHaveBeenCalledWith({ ok: true }, match);
  });

  it('clamps adjusted scores and blocks invalid totals', async () => {
    const { result, submitReport, setError } = renderScoreInput();
    const match = makeMatch();

    act(() => {
      result.current.adjustScore(match, 'score1', 5);
      result.current.adjustScore(match, 'score2', -1);
    });

    expect(result.current.reportingScores[match.id]).toEqual({ score1: 4, score2: 0 });

    act(() => {
      result.current.adjustScore(match, 'score1', -2);
    });

    await act(async () => {
      await result.current.handleSubmitScore(match);
    });

    expect(setError).toHaveBeenCalledWith('total must equal 4');
    expect(submitReport).not.toHaveBeenCalled();
  });

  it('submits as player2 when the logged-in player owns player2', async () => {
    const { result, submitReport } = renderScoreInput({ playerId: 'player-2' });
    const match = makeMatch({
      player2ReportedScore1: 1,
      player2ReportedScore2: 3,
    });

    await act(async () => {
      await result.current.handleSubmitScore(match);
    });

    expect(result.current.hasOwnReport(match)).toBe(true);
    expect(submitReport).toHaveBeenCalledWith('match-1', {
      reportingPlayer: 2,
      score1: 1,
      score2: 3,
    });
  });
});

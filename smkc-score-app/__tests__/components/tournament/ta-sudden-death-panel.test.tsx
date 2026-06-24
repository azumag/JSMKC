/**
 * @jest-environment jsdom
 */
import { act, render, renderHook, screen } from '@testing-library/react';
import { TASuddenDeathSection, useTaSuddenDeath } from '@/components/tournament/ta-sudden-death-panel';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(':')}` : key,
}));

const entries = [
  { id: 'entry-1', playerId: 'player-1', player: { nickname: 'Mario' } },
  { id: 'entry-2', playerId: 'player-2', player: { nickname: 'Luigi' } },
];

const rounds = [
  {
    id: 'round-1',
    roundNumber: 3,
    suddenDeathRounds: [
      {
        id: 'sd-1',
        sequence: 1,
        course: 'GV1',
        targetPlayerIds: ['player-1', 'player-2'],
        resolved: false,
      },
    ],
  },
];

const pendingSuddenDeath = {
  ...rounds[0].suddenDeathRounds[0],
  round: rounds[0],
};

function mockJsonResponse(ok: boolean, body: Record<string, unknown> = {}) {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function renderSuddenDeathHook(options: {
  fetchData?: jest.Mock;
  setSaveError?: jest.Mock;
} = {}) {
  const fetchData = options.fetchData ?? jest.fn();
  const setSaveError = options.setSaveError ?? jest.fn();

  const hook = renderHook(() =>
    useTaSuddenDeath({
      tournamentId: 'tournament-1',
      phase: 'phase3',
      entries,
      rounds,
      fetchData,
      setSaveError,
      invalidTimeMessage: (name) => `Invalid time for ${name}`,
    })
  );

  return { ...hook, fetchData, setSaveError };
}

describe('useTaSuddenDeath', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps empty blur as a no-op instead of adding a blank time entry', () => {
    const { result } = renderSuddenDeathHook();

    act(() => {
      result.current.handleSuddenDeathTimeBlur('player-1');
    });

    expect(result.current.suddenDeathTimes).toEqual({});
  });

  it('auto-formats a valid time string on blur', () => {
    const { result } = renderSuddenDeathHook();

    act(() => {
      result.current.setSuddenDeathTime('player-1', '10000');
    });
    act(() => {
      result.current.handleSuddenDeathTimeBlur('player-1');
    });

    expect(result.current.suddenDeathTimes['player-1']).toBe('1:00.00');
  });

  it('submits sudden-death results, resets input state, and refreshes data', async () => {
    const fetchData = jest.fn();
    const setSaveError = jest.fn();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(mockJsonResponse(true));
    const { result } = renderSuddenDeathHook({ fetchData, setSaveError });

    act(() => {
      result.current.setSuddenDeathTime('player-1', '1:00.00');
      result.current.setSuddenDeathTime('player-2', '1:01.00');
    });

    await act(async () => {
      await result.current.handleSubmitSuddenDeath();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments/tournament-1/ta/phases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit_sudden_death',
        phase: 'phase3',
        suddenDeathRoundId: 'sd-1',
        results: [
          { playerId: 'player-1', timeMs: 60000 },
          { playerId: 'player-2', timeMs: 61000 },
        ],
      }),
    });
    expect(setSaveError).toHaveBeenCalledWith(null);
    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(result.current.suddenDeathTimes).toEqual({});
    expect(result.current.submittingSuddenDeath).toBe(false);
  });

  it('reports submit API errors and does not refresh data', async () => {
    const fetchData = jest.fn();
    const setSaveError = jest.fn();
    jest.spyOn(global, 'fetch').mockResolvedValue(mockJsonResponse(false, { error: 'submit failed' }));
    const { result } = renderSuddenDeathHook({ fetchData, setSaveError });

    act(() => {
      result.current.setSuddenDeathTime('player-1', '1:00.00');
      result.current.setSuddenDeathTime('player-2', '1:01.00');
    });

    await act(async () => {
      await result.current.handleSubmitSuddenDeath();
    });

    expect(setSaveError).toHaveBeenLastCalledWith('submit failed');
    expect(fetchData).not.toHaveBeenCalled();
    expect(result.current.submittingSuddenDeath).toBe(false);
  });

  it('changes sudden-death course and refreshes data on success', async () => {
    const fetchData = jest.fn();
    const setSaveError = jest.fn();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(mockJsonResponse(true));
    const { result } = renderSuddenDeathHook({ fetchData, setSaveError });

    await act(async () => {
      await result.current.handleSuddenDeathCourseChange('MC1');
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments/tournament-1/ta/phases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'change_sudden_death_course',
        phase: 'phase3',
        suddenDeathRoundId: 'sd-1',
        course: 'MC1',
      }),
    });
    expect(setSaveError).toHaveBeenCalledWith(null);
    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(result.current.changingSuddenDeathCourse).toBe(false);
  });

  it('reports course-change API errors and does not refresh data', async () => {
    const fetchData = jest.fn();
    const setSaveError = jest.fn();
    jest.spyOn(global, 'fetch').mockResolvedValue(mockJsonResponse(false, { error: 'course failed' }));
    const { result } = renderSuddenDeathHook({ fetchData, setSaveError });

    await act(async () => {
      await result.current.handleSuddenDeathCourseChange('MC1');
    });

    expect(setSaveError).toHaveBeenLastCalledWith('course failed');
    expect(fetchData).not.toHaveBeenCalled();
    expect(result.current.changingSuddenDeathCourse).toBe(false);
  });

  it('TC-2937: 全ラウンドが resolved=true のとき pendingSuddenDeath が undefined になる', () => {
    const resolvedRounds = [
      {
        id: 'round-1',
        roundNumber: 3,
        suddenDeathRounds: [
          { id: 'sd-1', sequence: 1, course: 'GV1', targetPlayerIds: ['player-1'], resolved: true },
        ],
      },
    ];
    const hook = renderHook(() =>
      useTaSuddenDeath({
        tournamentId: 'tournament-1',
        phase: 'phase3',
        entries,
        rounds: resolvedRounds,
        fetchData: jest.fn(),
        setSaveError: jest.fn(),
        invalidTimeMessage: (name) => `Invalid time for ${name}`,
      })
    );

    expect(hook.result.current.pendingSuddenDeath).toBeUndefined();
  });

  it('TC-2938: pendingSuddenDeathEntries が targetPlayerIds でフィルタリングされる', () => {
    const partialRounds = [
      {
        id: 'round-1',
        roundNumber: 3,
        suddenDeathRounds: [
          { id: 'sd-1', sequence: 1, course: 'GV1', targetPlayerIds: ['player-1'], resolved: false },
        ],
      },
    ];
    const hook = renderHook(() =>
      useTaSuddenDeath({
        tournamentId: 'tournament-1',
        phase: 'phase3',
        entries,
        rounds: partialRounds,
        fetchData: jest.fn(),
        setSaveError: jest.fn(),
        invalidTimeMessage: (name) => `Invalid time for ${name}`,
      })
    );

    expect(hook.result.current.pendingSuddenDeathEntries).toHaveLength(1);
    expect(hook.result.current.pendingSuddenDeathEntries[0].playerId).toBe('player-1');
  });

  it('TC-2939: setSuddenDeathTime が times ステートを更新する', () => {
    const { result } = renderSuddenDeathHook();

    act(() => {
      result.current.setSuddenDeathTime('player-1', '1:23.45');
    });

    expect(result.current.suddenDeathTimes['player-1']).toBe('1:23.45');
  });

  it('TC-2940: 無効な時間で handleSubmitSuddenDeath を呼ぶと setSaveError が呼ばれ fetchData は呼ばれない', async () => {
    const fetchData = jest.fn();
    const setSaveError = jest.fn();
    const { result } = renderSuddenDeathHook({ fetchData, setSaveError });

    act(() => {
      result.current.setSuddenDeathTime('player-1', 'invalid');
      result.current.setSuddenDeathTime('player-2', '1:01.00');
    });

    await act(async () => {
      await result.current.handleSubmitSuddenDeath();
    });

    expect(setSaveError).toHaveBeenCalledWith('Invalid time for Mario');
    expect(fetchData).not.toHaveBeenCalled();
  });

  it('TC-2941: pendingSuddenDeath が undefined のとき handleSubmitSuddenDeath は早期リターンする', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const hook = renderHook(() =>
      useTaSuddenDeath({
        tournamentId: 'tournament-1',
        phase: 'phase3',
        entries,
        rounds: [],
        fetchData: jest.fn(),
        setSaveError: jest.fn(),
        invalidTimeMessage: (name) => `Invalid time for ${name}`,
      })
    );

    await act(async () => {
      await hook.result.current.handleSubmitSuddenDeath();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('TC-2942: pendingSuddenDeath が undefined のとき handleSuddenDeathCourseChange は早期リターンする', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const hook = renderHook(() =>
      useTaSuddenDeath({
        tournamentId: 'tournament-1',
        phase: 'phase3',
        entries,
        rounds: [],
        fetchData: jest.fn(),
        setSaveError: jest.fn(),
        invalidTimeMessage: (name) => `Invalid time for ${name}`,
      })
    );

    await act(async () => {
      await hook.result.current.handleSuddenDeathCourseChange('MC1');
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('TASuddenDeathSection', () => {
  const defaultSectionProps = {
    isAdmin: true,
    isComplete: false,
    pendingSuddenDeath: pendingSuddenDeath,
    pendingSuddenDeathEntries: entries,
    availableCourses: ['MC1'],
    saveError: null,
    suddenDeathTimes: { 'player-1': '1:00.00', 'player-2': '1:01.00' },
    changingSuddenDeathCourse: false,
    submittingSuddenDeath: false,
    timeInputProps: {},
    timeInputHelp: 'Enter M:SS.mm format.',
    timePlaceholder: '1:23.45',
    submittingLabel: 'Saving...',
    onCourseChange: jest.fn(),
    onTimeChange: jest.fn(),
    onTimeBlur: jest.fn(),
    onSubmit: jest.fn(),
  };

  it('passes pending entries and submitting state through with matching prop names', () => {
    render(
      <TASuddenDeathSection
        {...defaultSectionProps}
        submittingSuddenDeath
        timeInputProps={{ 'aria-label': 'Sudden-death time' }}
        submittingLabel="Saving..."
      />,
    );

    expect(screen.getByTestId('ta-sudden-death-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ta-sudden-death-course-select')).toBeInTheDocument();
    expect(screen.getByTestId('ta-sudden-death-time-player-1')).toBeInTheDocument();
    expect(screen.getByTestId('ta-sudden-death-time-player-2')).toBeInTheDocument();
    expect(screen.getByTestId('ta-sudden-death-submit')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1:00.00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1:01.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });

  it('TC-2933: isAdmin=false のとき何も描画しない', () => {
    const { container } = render(
      <TASuddenDeathSection {...defaultSectionProps} isAdmin={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('TC-2934: isComplete=true のとき何も描画しない', () => {
    const { container } = render(
      <TASuddenDeathSection {...defaultSectionProps} isComplete />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('TC-2935: pendingSuddenDeath=null のとき何も描画しない', () => {
    const { container } = render(
      <TASuddenDeathSection {...defaultSectionProps} pendingSuddenDeath={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('TC-2936: saveError があるときエラーメッセージが表示される', () => {
    render(
      <TASuddenDeathSection {...defaultSectionProps} saveError="API error" />,
    );

    expect(screen.getByText('API error')).toBeInTheDocument();
  });
});

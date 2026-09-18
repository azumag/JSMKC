/**
 * @jest-environment jsdom
 *
 * Regression coverage for issue #3824: course changes and result submission
 * mutate the same sudden-death round and must never overlap.
 */
import { act, render, renderHook, screen } from '@testing-library/react';
import { TASuddenDeathSection, useTaSuddenDeath } from '@/components/tournament/ta-sudden-death-panel';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
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

interface DeferredResponse {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
}

function deferredResponse(): DeferredResponse {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function okResponse(): Response {
  return { ok: true, json: jest.fn().mockResolvedValue({}) } as unknown as Response;
}

function renderHookUnderTest() {
  return renderHook(() =>
    useTaSuddenDeath({
      tournamentId: 'tournament-1',
      phase: 'phase3',
      entries,
      rounds,
      fetchData: jest.fn(),
      setSaveError: jest.fn(),
      invalidTimeMessage: (name) => `Invalid time for ${name}`,
    }),
  );
}

function setValidTimes(result: ReturnType<typeof renderHookUnderTest>['result']) {
  act(() => {
    result.current.setSuddenDeathTime('player-1', '1:00.00');
    result.current.setSuddenDeathTime('player-2', '1:01.00');
  });
}

function postedAction(fetchMock: jest.Mock, callIndex: number): string {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)).action;
}

describe('TA sudden-death mutation serialization', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('blocks submit while a course change is in flight and unlocks after it settles', async () => {
    const { result } = renderHookUnderTest();
    setValidTimes(result);
    const courseResponse = deferredResponse();
    fetchMock.mockImplementationOnce(() => courseResponse.promise);

    let coursePromise!: Promise<void>;
    await act(async () => {
      coursePromise = result.current.handleSuddenDeathCourseChange('MC1');
      await result.current.handleSubmitSuddenDeath();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postedAction(fetchMock, 0)).toBe('change_sudden_death_course');

    await act(async () => {
      courseResponse.resolve(okResponse());
      await coursePromise;
    });

    fetchMock.mockResolvedValueOnce(okResponse());
    await act(async () => {
      await result.current.handleSubmitSuddenDeath();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(postedAction(fetchMock, 1)).toBe('submit_sudden_death');
  });

  it('starts only one submit request when the handler re-enters before React commits state', async () => {
    const { result } = renderHookUnderTest();
    setValidTimes(result);
    const submitResponse = deferredResponse();
    fetchMock.mockImplementationOnce(() => submitResponse.promise);

    let firstSubmit!: Promise<void>;
    await act(async () => {
      firstSubmit = result.current.handleSubmitSuddenDeath();
      await result.current.handleSubmitSuddenDeath();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postedAction(fetchMock, 0)).toBe('submit_sudden_death');

    await act(async () => {
      submitResponse.resolve(okResponse());
      await firstSubmit;
    });
  });

  it('disables the submit control while the course mutation is in progress', () => {
    const pendingSuddenDeath = {
      ...rounds[0].suddenDeathRounds[0],
      round: rounds[0],
    };

    render(
      <TASuddenDeathSection
        isAdmin
        isComplete={false}
        pendingSuddenDeath={pendingSuddenDeath}
        pendingSuddenDeathEntries={entries}
        availableCourses={['MC1']}
        saveError={null}
        suddenDeathTimes={{ 'player-1': '1:00.00', 'player-2': '1:01.00' }}
        changingSuddenDeathCourse
        submittingSuddenDeath={false}
        timeInputProps={{}}
        timeInputHelp="Enter time"
        timePlaceholder="1:23.45"
        submittingLabel="Saving..."
        onCourseChange={jest.fn()}
        onTimeChange={jest.fn()}
        onTimeBlur={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByTestId('ta-sudden-death-submit')).toBeDisabled();
  });
});

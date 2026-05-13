type EvaluateCall = {
  action: string;
  phase: string;
  course?: string;
  roundNumber?: number;
  results?: Array<{ playerId: string; timeMs: number }>;
};

function createMockAdminPage(roundNumber = 7) {
  const calls: EvaluateCall[] = [];
  const adminPage = {
    evaluate: jest.fn(async (_fn: unknown, [_tournamentId, body]: [string, EvaluateCall]) => {
      calls.push(body);
      if (body.action === 'start_round') {
        return { s: 200, b: { data: { roundNumber } } };
      }
      if (body.action === 'submit_results') {
        return { s: 200, b: { data: { submitted: true, phase: body.phase } } };
      }
      return { s: 400, b: { error: 'unexpected action' } };
    }),
  };

  return { adminPage, calls };
}

describe('TA E2E phase round submission helper', () => {
  it('only exposes public helper paths through test hooks', async () => {
    const { __testHooks } = await import('../../e2e/tc-ta.js') as {
      __testHooks: Record<string, unknown>;
    };

    expect(Object.keys(__testHooks).sort()).toEqual([
      'submitTaPhaseRoundByApi',
      'submitTaPhaseRoundWithCourseByApi',
    ]);
  });

  it('keeps automatic-course phase submissions on the shared start/submit helper', async () => {
    const { __testHooks } = await import('../../e2e/tc-ta.js') as {
      __testHooks: {
        submitTaPhaseRoundByApi: (
          adminPage: unknown,
          tournamentId: string,
          phase: string,
          activeEntries: Array<{ playerId: string; rank?: number }>,
        ) => Promise<{ submitted: boolean; phase: string }>;
      };
    };
    const { adminPage, calls } = createMockAdminPage(3);

    const data = await __testHooks.submitTaPhaseRoundByApi(
      adminPage,
      'tournament-1',
      'phase2',
      [
        { playerId: 'p1', rank: 1 },
        { playerId: 'p2' },
      ],
    );

    expect(data).toEqual({ submitted: true, phase: 'phase2' });
    expect(calls).toEqual([
      { action: 'start_round', phase: 'phase2' },
      {
        action: 'submit_results',
        phase: 'phase2',
        roundNumber: 3,
        results: [
          { playerId: 'p1', timeMs: 60200 },
          { playerId: 'p2', timeMs: 64000 },
        ],
      },
    ]);
  });

  it('keeps explicit-course phase submissions on the same shared helper', async () => {
    const { __testHooks } = await import('../../e2e/tc-ta.js') as {
      __testHooks: {
        submitTaPhaseRoundWithCourseByApi: (
          adminPage: unknown,
          tournamentId: string,
          phase: string,
          course: string,
          results: Array<{ playerId: string; timeMs: number }>,
        ) => Promise<{ roundNumber: number; data: { submitted: boolean; phase: string } }>;
      };
    };
    const { adminPage, calls } = createMockAdminPage(4);
    const results = [{ playerId: 'p1', timeMs: 61000 }];

    const submission = await __testHooks.submitTaPhaseRoundWithCourseByApi(
      adminPage,
      'tournament-1',
      'phase1',
      'KB1',
      results,
    );

    expect(submission).toEqual({ roundNumber: 4, data: { submitted: true, phase: 'phase1' } });
    expect(calls).toEqual([
      { action: 'start_round', phase: 'phase1', course: 'KB1' },
      { action: 'submit_results', phase: 'phase1', roundNumber: 4, results },
    ]);
  });
});

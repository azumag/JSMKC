import {
  cdmE2eFinalsMatches,
  cdmE2eFinalsReadinessDetails,
  cdmE2eFinalsReadinessSummary,
  ensureCdmE2eFinalsFixture,
} from '../../e2e/tc-all';

describe('TC-816A CDM finals fixture readiness', () => {
  it('counts slot-mappable playoff and finals matches by mode', () => {
    const readiness = cdmE2eFinalsReadinessDetails([
      {
        mode: 'BM',
        state: {
          playoffMatches: [{ round: 'playoff_r1', bracketPosition: 'P1' }],
          matches: [{ round: 'winners_r1', bracketPosition: 'W1' }],
        },
      },
      { mode: 'MR', state: { playoffMatches: [], matches: [] } },
      {
        mode: 'GP',
        state: {
          matches: [
            { round: 'gf', bracketPosition: 'GF' },
            { round: 'ignored_round', bracketPosition: 'table-only' },
          ],
        },
      },
    ]);

    expect(readiness).toEqual([
      { mode: 'BM', count: 2, rounds: ['playoff_r1', 'winners_r1'] },
      { mode: 'MR', count: 0, rounds: [] },
      { mode: 'GP', count: 1, rounds: ['grand_final'] },
    ]);
  });

  it('prints actionable per-mode readiness diagnostics', () => {
    expect(cdmE2eFinalsReadinessSummary([
      { mode: 'BM', count: 2, rounds: ['playoff_r1', 'winners_r1'] },
      { mode: 'MR', count: 0, rounds: [] },
    ])).toBe('BM=2 rounds=playoff_r1/winners_r1; MR=0 rounds=<none>');
  });

  it('keeps reset and grand final matches mappable for workbook checks', () => {
    expect(cdmE2eFinalsMatches({
      matches: [
        { round: 'grand_final_reset', bracketPosition: 'Reset' },
        { round: 'gf', bracketPosition: 'GF' },
        { round: 'not_exported', bracketPosition: 'table-only' },
      ],
    })).toHaveLength(2);
  });

  it('fetches mode readiness states in parallel before checking missing modes', async () => {
    const state = { matches: [{ round: 'winners_r1', bracketPosition: 'winners_r1' }] };
    const starts: string[] = [];
    let releaseBm: (value: typeof state) => void = () => {};
    const bmPromise = new Promise<typeof state>((resolve) => {
      releaseBm = resolve;
    });
    const api = {
      fetchBmFinalsState: jest.fn(() => {
        starts.push('BM');
        return bmPromise;
      }),
      fetchMrFinalsState: jest.fn(() => {
        starts.push('MR');
        return Promise.resolve(state);
      }),
      fetchGpFinalsState: jest.fn(() => {
        starts.push('GP');
        return Promise.resolve(state);
      }),
      generateBmFinals: jest.fn(),
      generateMrFinals: jest.fn(),
      generateGpFinals: jest.fn(),
    };

    const readinessPromise = ensureCdmE2eFinalsFixture({} as never, 't1', api);
    await Promise.resolve();

    expect(starts).toEqual(['BM', 'MR', 'GP']);
    releaseBm(state);
    await expect(readinessPromise).resolves.toMatchObject({
      readinessDetails: [
        { mode: 'BM', count: 1 },
        { mode: 'MR', count: 1 },
        { mode: 'GP', count: 1 },
      ],
    });
    expect(api.generateBmFinals).not.toHaveBeenCalled();
    expect(api.generateMrFinals).not.toHaveBeenCalled();
    expect(api.generateGpFinals).not.toHaveBeenCalled();
  });

  it('reports failed finals generator status before returning missing-match diagnostics', async () => {
    const emptyState = { playoffMatches: [], matches: [] };
    const api = {
      fetchBmFinalsState: jest.fn(() => Promise.resolve(emptyState)),
      fetchMrFinalsState: jest.fn(() => Promise.resolve(emptyState)),
      fetchGpFinalsState: jest.fn(() => Promise.resolve(emptyState)),
      generateBmFinals: jest.fn(() => Promise.resolve({ s: 500, b: { error: 'BM exploded' } })),
      generateMrFinals: jest.fn(() => Promise.resolve({ s: 201, b: {} })),
      generateGpFinals: jest.fn(() => Promise.resolve({ s: 200, b: {} })),
    };

    await expect(ensureCdmE2eFinalsFixture({} as never, 't1', api)).rejects.toThrow(
      'CDM finals fixture generation failed: BM HTTP 500: BM exploded',
    );
  });
});

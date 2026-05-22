import {
  cdmE2eFinalsMatches,
  cdmE2eFinalsReadinessDetails,
  cdmE2eFinalsReadinessSummary,
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
});

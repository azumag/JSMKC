import { collectEliminationOrder, evaluateTaFlowRankAssertion } from '../../e2e/lib/ta-flow-rank-assertions';

const entries = [
  { playerId: 'champion', rank: 1 },
  { playerId: 'early', rank: 24 },
  { playerId: 'late', rank: 2 },
];

describe('TC-TA-FLOW-24-RANK assertion helper', () => {
  it('collects phase3 eliminations in chronological order', () => {
    expect(collectEliminationOrder([
      { eliminatedIds: ['p24', 'p23'] },
      { eliminatedIds: ['p22'] },
      { eliminatedIds: ['p21', 'p20'] },
    ])).toEqual(['p24', 'p23', 'p22', 'p21', 'p20']);
  });

  it('collects no eliminations from missing phase3 rounds', () => {
    expect(collectEliminationOrder(null)).toEqual([]);
    expect(collectEliminationOrder(undefined)).toEqual([]);
  });

  it('ignores missing eliminatedIds and invalid player ids', () => {
    expect(collectEliminationOrder([
      null,
      {},
      { eliminatedIds: null },
      { eliminatedIds: ['', 42, 'p19', false, 'p18'] },
    ])).toEqual(['p19', 'p18']);
  });

  it('passes when the champion has the highest TA finals points and late eliminations outrank early eliminations', () => {
    expect(evaluateTaFlowRankAssertion({
      entries,
      phase3Rounds: [
        { eliminatedIds: ['early'] },
        { eliminatedIds: ['late'] },
      ],
      recalcStatus: 200,
      recalcBody: {
        data: {
          scores: [
            { playerId: 'champion', taFinalsPoints: 2100 },
            { playerId: 'late', taFinalsPoints: 1600 },
            { playerId: 'early', taFinalsPoints: 1000 },
          ],
        },
      },
    })).toEqual({ status: 'PASS', detail: '' });
  });

  it('does not hard-code the champion point value', () => {
    expect(evaluateTaFlowRankAssertion({
      entries,
      phase3Rounds: [
        { eliminatedIds: ['early'] },
        { eliminatedIds: ['late'] },
      ],
      recalcStatus: 200,
      recalcBody: {
        data: {
          scores: [
            { playerId: 'champion', taFinalsPoints: 2400 },
            { playerId: 'late', taFinalsPoints: 1600 },
            { playerId: 'early', taFinalsPoints: 1000 },
          ],
        },
      },
    })).toEqual({ status: 'PASS', detail: '' });
  });

  it('skips the elimination-order assertion when phase3 produced too little elimination data', () => {
    expect(evaluateTaFlowRankAssertion({
      entries,
      phase3Rounds: [{ eliminatedIds: [] }],
      recalcStatus: 200,
      recalcBody: {
        data: {
          scores: [
            { playerId: 'champion', taFinalsPoints: 2000 },
            { playerId: 'early', taFinalsPoints: 0 },
            { playerId: 'late', taFinalsPoints: 0 },
          ],
        },
      },
    })).toEqual({
      status: 'SKIP',
      detail: 'not enough phase3 elimination data to compare TA finals order',
    });
  });

  it('skips incomplete phase3 data before checking champion points', () => {
    expect(evaluateTaFlowRankAssertion({
      entries,
      phase3Rounds: [],
      recalcStatus: 200,
      recalcBody: {
        data: {
          scores: [
            { playerId: 'champion', taFinalsPoints: 0 },
            { playerId: 'early', taFinalsPoints: 0 },
            { playerId: 'late', taFinalsPoints: 0 },
          ],
        },
      },
    })).toEqual({
      status: 'SKIP',
      detail: 'not enough phase3 elimination data to compare TA finals order',
    });
  });

  it('reports recalculate failures as a local FAIL result', () => {
    expect(evaluateTaFlowRankAssertion({
      entries,
      phase3Rounds: [
        { eliminatedIds: ['early'] },
        { eliminatedIds: ['late'] },
      ],
      recalcStatus: 500,
      recalcBody: {},
    })).toEqual({ status: 'FAIL', detail: 'recalculate failed: 500' });
  });

  it('reports phase3 round fetch failures instead of treating missing rounds as a skip', () => {
    expect(evaluateTaFlowRankAssertion({
      entries,
      phase3Status: 503,
      phase3Rounds: [],
      recalcStatus: 200,
      recalcBody: {
        data: {
          scores: [
            { playerId: 'champion', taFinalsPoints: 2000 },
            { playerId: 'early', taFinalsPoints: 0 },
            { playerId: 'late', taFinalsPoints: 0 },
          ],
        },
      },
    })).toEqual({ status: 'FAIL', detail: 'phase3 rounds fetch failed: 503' });
  });
});

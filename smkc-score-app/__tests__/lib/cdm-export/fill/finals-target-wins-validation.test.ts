import { buildFinalsWrites } from '@/lib/cdm-export/fill/finals';
import type { CdmMatch, CdmPlayer, CdmTournamentData } from '@/lib/cdm-export/types';

const player1: CdmPlayer = { id: 'p1', name: 'Player 1', nickname: 'P1' };
const player2: CdmPlayer = { id: 'p2', name: 'Player 2', nickname: 'P2' };

function match(targetWins: number | null): CdmMatch {
  return {
    matchNumber: 1,
    stage: 'finals',
    round: 'winners_qf',
    player1,
    player2,
    completed: false,
    targetWins,
  };
}

function data(targetWins: number | null, configured?: number | null): CdmTournamentData {
  return {
    name: 'Target wins validation',
    date: new Date('2026-09-22'),
    bmQualifications: [],
    mrQualifications: [],
    gpQualifications: [],
    bmMatches: [match(targetWins)],
    mrMatches: [],
    gpMatches: [],
    ttEntries: [],
    ttPhaseRounds: [],
    finalsRoundSettings:
      configured === undefined
        ? undefined
        : [{ mode: 'bm', stage: 'finals', round: 'winners_qf', targetWins: configured }],
  };
}

function targetWinsWrite(tournament: CdmTournamentData) {
  return buildFinalsWrites(tournament, 'bm').find((write) => write.ref === 'Y3');
}

describe('CDM finals persisted targetWins validation', () => {
  it('writes the upper valid boundary from a persisted match', () => {
    expect(targetWinsWrite(data(99))).toMatchObject({ op: 'number', value: 99 });
  });

  it.each([100, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not export an invalid persisted match value %p',
    (invalid) => {
      expect(targetWinsWrite(data(invalid))).toBeUndefined();
    },
  );

  it('validates configured values with the same parser before falling back to match data', () => {
    expect(targetWinsWrite(data(7, 100))).toMatchObject({ op: 'number', value: 7 });
    expect(targetWinsWrite(data(7, 99))).toMatchObject({ op: 'number', value: 99 });
  });
});

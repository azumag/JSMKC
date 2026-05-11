import { validateGpFinalsAssignedCupSequences } from '../../e2e/lib/gp-finals-validators';
import { gpAssignedCupSequence, gpFinalsUpdatedMatchFromPutResult } from '../../e2e/tc-gp';

describe('TC-717 assigned cup sequence validation', () => {
  it('accepts shared FT2 and FT3 assignedCups sequences', () => {
    const errors = validateGpFinalsAssignedCupSequences([
      { id: 'm1', matchNumber: 1, round: 'winners_qf', cup: 'Mushroom', assignedCups: ['Mushroom', 'Flower', 'Star'] },
      { id: 'm2', matchNumber: 2, round: 'winners_qf', cup: 'Mushroom', assignedCups: ['Mushroom', 'Flower', 'Star'] },
      { id: 'm13', matchNumber: 13, round: 'losers_sf', cup: 'Flower', assignedCups: ['Flower', 'Star', 'Special', 'Mushroom', 'Flower'] },
    ]);

    expect(errors).toEqual([]);
  });

  it('rejects divergent rounds, stale cup fields, and invalid cup counts', () => {
    const errors = validateGpFinalsAssignedCupSequences([
      { id: 'm1', matchNumber: 1, round: 'winners_qf', cup: 'Mushroom', assignedCups: ['Mushroom', 'Flower', 'Star'] },
      { id: 'm2', matchNumber: 2, round: 'winners_qf', cup: 'Flower', assignedCups: ['Flower', 'Star', 'Special'] },
      { id: 'm13', matchNumber: 13, round: 'losers_sf', cup: 'Mushroom', assignedCups: ['Flower', 'Flower', 'Star'] },
    ]);

    expect(errors).toEqual(expect.arrayContaining([
      'winners_qf: divergent assignedCups sequences',
      'M13: cup=Mushroom first=Flower',
      'M13: losers_sf expected 5 assigned cups, got 3',
      'M13: losers_sf repeats within first 4 assigned cups',
    ]));
  });

  it('keeps the legacy TC-722 fallback to the maximum FT3 cup count', () => {
    expect(gpAssignedCupSequence({ cup: 'Special' })).toEqual(['Special', 'Flower', 'Star']);
    expect(gpAssignedCupSequence({})).toEqual(['Mushroom', 'Flower', 'Star']);
  });

  it('uses assignedCups before the legacy fallback', () => {
    expect(gpAssignedCupSequence({
      cup: 'Flower',
      assignedCups: ['Flower', 'Special', 'Mushroom', 'Star'],
    })).toEqual(['Flower', 'Special', 'Mushroom', 'Star']);
  });

  it('reads the updated GP finals match from PUT responses before fetch fallback', () => {
    const updatedMatch = { id: 'm16', matchNumber: 16, completed: true };

    expect(gpFinalsUpdatedMatchFromPutResult(null, 'm16')).toBeNull();
    expect(gpFinalsUpdatedMatchFromPutResult(undefined, 'm16')).toBeNull();
    expect(gpFinalsUpdatedMatchFromPutResult({
      b: { data: { match: updatedMatch } },
    }, 'm16')).toBe(updatedMatch);
    expect(gpFinalsUpdatedMatchFromPutResult({
      b: { match: updatedMatch },
    }, 'm16')).toBe(updatedMatch);
    expect(gpFinalsUpdatedMatchFromPutResult({
      b: { data: { match: false }, match: updatedMatch },
    }, 'm16')).toBeNull();
    expect(gpFinalsUpdatedMatchFromPutResult({
      b: { data: { match: { id: 'm15', completed: true } } },
    }, 'm16')).toBeNull();
  });
});

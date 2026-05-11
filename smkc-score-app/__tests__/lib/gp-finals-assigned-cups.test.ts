import { getAssignedCupLabelsForMatch } from '../../src/lib/gp-finals-assigned-cups';

describe('getAssignedCupLabelsForMatch', () => {
  it('uses assignedCups in order when present', () => {
    expect(getAssignedCupLabelsForMatch({
      cup: 'Mushroom',
      assignedCups: ['Flower', 'Star', 'Special'],
    })).toEqual(['Flower', 'Star', 'Special']);
  });

  it('filters empty assigned cup entries before falling back', () => {
    expect(getAssignedCupLabelsForMatch({
      cup: 'Mushroom',
      assignedCups: [null, '', undefined, 'Star'],
    })).toEqual(['Star']);
  });

  it('falls back to the legacy cup field when assignedCups is empty', () => {
    expect(getAssignedCupLabelsForMatch({
      cup: 'Mushroom',
      assignedCups: [],
    })).toEqual(['Mushroom']);
  });

  it('returns an empty label list when no cup data exists', () => {
    expect(getAssignedCupLabelsForMatch({ assignedCups: null, cup: null })).toEqual([]);
  });
});

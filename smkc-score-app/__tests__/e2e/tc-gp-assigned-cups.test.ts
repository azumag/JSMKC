import { validateGpFinalsAssignedCupSequences } from '../../e2e/lib/gp-finals-validators';
import fs from 'fs';
import path from 'path';

const tcGpSource = fs.readFileSync(path.join(process.cwd(), 'e2e', 'tc-gp.js'), 'utf8');

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
    expect(tcGpSource).toContain('FT3 maximum');
    expect(tcGpSource).toContain("return [match.cup || 'Mushroom', 'Flower', 'Star'];");
    expect(tcGpSource).not.toContain("'Special', 'Mushroom']");
  });
});

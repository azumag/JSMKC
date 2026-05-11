import fs from 'fs';
import path from 'path';

describe('GP finals page source guards', () => {
  const pageSource = fs.readFileSync(
    path.join(process.cwd(), 'src/app/tournaments/[id]/gp/finals/page.tsx'),
    'utf8',
  );

  it('evaluates assigned cup labels once for the selected match render', () => {
    const selectedMatchCalls = pageSource.match(/getAssignedCupLabelsForMatch\(selectedMatch\)/g) ?? [];

    expect(selectedMatchCalls).toHaveLength(1);
    expect(pageSource).toContain(
      'const selectedMatchAssignedCupLabels = selectedMatch ? getAssignedCupLabelsForMatch(selectedMatch) : [];',
    );
    expect(pageSource).toContain('selectedMatchAssignedCupLabels.length > 0');
    expect(pageSource).toContain('selectedMatchAssignedCupLabels.map((cup, index) => (');
  });
});

import fs from 'fs';
import path from 'path';

describe('RankCell input constraint ownership', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/components/tournament/rank-cell.tsx'),
    'utf8',
  );

  it('leaves minimum-rank validation to the API instead of native input validity', () => {
    expect(source).toContain('type="number"');
    expect(source).toContain('step={1}');
    expect(source).toContain('API layer owns minimum-rank validation');
    expect(source).not.toContain('min={1}');
  });
});

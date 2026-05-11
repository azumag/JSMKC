import fs from 'fs';
import path from 'path';
import {
  compareGpQualificationEntries,
  gpQualificationOrderBy,
  gpStandingsOrderBy,
} from '@/lib/gp-ranking';

const srcRoot = path.join(__dirname, '../../src');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');
}

function expectSourceToUse(relativePath: string, symbol: string): void {
  expect(readSource(relativePath)).toContain(symbol);
}

describe('gp-ranking', () => {
  it('defines the GP qualification DB order once for grouped qualification fetches', () => {
    expect(gpQualificationOrderBy()).toEqual([
      { group: 'asc' },
      { score: 'desc' },
      { points: 'desc' },
    ]);
  });

  it('defines the GP standings DB order without group partitioning', () => {
    expect(gpStandingsOrderBy()).toEqual([
      { score: 'desc' },
      { points: 'desc' },
    ]);
  });

  it('returns defensive order-by copies so callers cannot mutate the source definition', () => {
    const orderBy = gpQualificationOrderBy();
    orderBy[0].group = 'desc';

    expect(gpQualificationOrderBy()).toEqual([
      { group: 'asc' },
      { score: 'desc' },
      { points: 'desc' },
    ]);
  });

  it('uses match score before driver points for client-side GP ranking', () => {
    const entries = [
      { id: 'driver-points-leader', score: 4, points: 99 },
      { id: 'match-points-leader', score: 5, points: 1 },
      { id: 'driver-points-tiebreaker', score: 4, points: 100 },
    ];

    expect([...entries].sort(compareGpQualificationEntries).map((entry) => entry.id)).toEqual([
      'match-points-leader',
      'driver-points-tiebreaker',
      'driver-points-leader',
    ]);
  });

  it('keeps GP routes and page-client wired to the shared ranking source', () => {
    expectSourceToUse('lib/event-types/gp-config.ts', 'gpQualificationOrderBy()');
    expectSourceToUse('app/api/tournaments/[id]/gp/finals/route.ts', 'gpQualificationOrderBy()');
    expectSourceToUse('app/api/tournaments/[id]/gp/standings/route.ts', 'gpStandingsOrderBy()');
    expectSourceToUse('app/tournaments/[id]/gp/page-client.tsx', 'compareGpQualificationEntries');
  });
});

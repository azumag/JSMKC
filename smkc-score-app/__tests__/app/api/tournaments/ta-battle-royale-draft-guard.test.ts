import fs from 'fs';
import path from 'path';

const routeSource = fs.readFileSync(
  path.join(process.cwd(), 'src/app/api/tournaments/[id]/ta/battle-royale/route.ts'),
  'utf8',
);

describe('TA battle royale start draft guard', () => {
  it('loads tournament status and rejects non-draft tournaments before parsing the roster', () => {
    expect(routeSource).toContain('status: true');
    expect(routeSource).toContain("if (tournament.status !== 'draft')");
    expect(routeSource).toContain("'TOURNAMENT_NOT_DRAFT'");

    const guardIndex = routeSource.indexOf("if (tournament.status !== 'draft')");
    const parseIndex = routeSource.indexOf('StartBattleRoyaleSchema.safeParse');

    expect(guardIndex).toBeGreaterThan(-1);
    expect(parseIndex).toBeGreaterThan(guardIndex);
  });
});

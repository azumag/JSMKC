import fs from 'node:fs';
import path from 'node:path';

describe('tournament list TA mode badge visibility (issue #2943)', () => {
  const pageSource = fs.readFileSync(path.join(process.cwd(), 'src/app/tournaments/page.tsx'), 'utf8');

  it('guards the badge wrapper with the battle royale condition', () => {
    const badgeBlock = pageSource.match(
      /\{\(tournament\.taMode === 'battle_royale' \|\| tournament\.taBattleRoyaleMode\) && \([\s\S]*?<\/span>\s*\)\}/,
    )?.[0];

    expect(badgeBlock).toBeDefined();
    expect(badgeBlock).toContain('<span className="ml-2 inline-flex">');
    expect(badgeBlock).toContain('<TaModeBadge mode="battle_royale" verbose={false} />');
  });

  it('does not render the badge wrapper outside the guarded block', () => {
    const sourceWithoutGuardedBlock = pageSource.replace(
      /\{\(tournament\.taMode === 'battle_royale' \|\| tournament\.taBattleRoyaleMode\) && \([\s\S]*?<\/span>\s*\)\}/,
      '',
    );

    expect(sourceWithoutGuardedBlock).not.toContain('<span className="ml-2 inline-flex">');
  });
});

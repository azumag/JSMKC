import { e2eCaseSection, readRepoFile, sectionBetween } from '../helpers/e2e-cases';

describe('TC-1062 qualification playoff broadcast label guard', () => {
  it('documents the review follow-up scenario', () => {
    const section = e2eCaseSection('TC-1062');

    expect(section).toContain('issue #1062');
    expect(section).toContain('playoffGroupTitle');
    expect(section).toContain('matchInfo.matchLabel');
    expect(section).toContain('qualification-playoff-manager.test.tsx');
  });

  it('keeps the broadcast match label on the translated playoff title', () => {
    const source = readRepoFile(
      'smkc-score-app',
      'src',
      'components',
      'tournament',
      'qualification-playoff-manager.tsx',
    );
    const broadcastBlock = sectionBetween(
      source,
      'await onBroadcast(group.players[0].nickname, group.players[1].nickname',
      'setBroadcastingGroupId(null);',
    );

    expect(broadcastBlock).toContain('matchLabel: tc("playoffGroupTitle", { rank: group.rank })');
    expect(broadcastBlock).not.toContain('Qualification Playoff Rank');
  });
});

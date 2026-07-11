import { buildPhase3RulesDto } from '@/lib/ta/phase-rules-dto';

describe('buildPhase3RulesDto', () => {
  it('builds standard rules without sharing mutable threshold arrays', () => {
    const first = buildPhase3RulesDto(false);
    const second = buildPhase3RulesDto(false);
    first.phase3Rules.lifeResetThresholds.push(99);
    expect(second).toEqual({
      taMode: 'standard',
      taBattleRoyaleMode: false,
      phase3Rules: {
        initialLives: 3,
        lifeResetThresholds: [8, 4, 2],
        survivorsNeeded: 1,
        handicapEnabled: false,
        retryAppliesHandicap: false,
      },
    });
  });

  it('builds battle royale rules', () => {
    expect(buildPhase3RulesDto(true)).toEqual({
      taMode: 'battle_royale',
      taBattleRoyaleMode: true,
      phase3Rules: {
        initialLives: 10,
        lifeResetThresholds: [],
        survivorsNeeded: 1,
        handicapEnabled: true,
        retryAppliesHandicap: false,
      },
    });
  });
});

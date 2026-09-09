import { analyzeUnsupportedCdmFixtureCandidate } from '@/lib/qualification-cdm-candidate-impact';

describe('analyzeUnsupportedCdmFixtureCandidate', () => {
  it('quantifies the 13-player 16-slot raw fixture candidate without enabling it', () => {
    expect(analyzeUnsupportedCdmFixtureCandidate(13)).toEqual({
      playerCount: 13,
      fixtureCapacity: 16,
      breakSlotCount: 3,
      totalDays: 15,
      realMatchCount: 78,
      playerBreakMatchCount: 39,
      breakOnlyMatchCount: 3,
      minBreaksPerPlayer: 3,
      maxBreaksPerPlayer: 3,
      minPlayersOnBreakPerDay: 1,
      maxPlayersOnBreakPerDay: 3,
    });
  });

  it('keeps fixture accounting internally consistent for the 13-player candidate', () => {
    const impact = analyzeUnsupportedCdmFixtureCandidate(13);

    expect(impact).not.toBeNull();
    expect(impact!.realMatchCount + impact!.playerBreakMatchCount + impact!.breakOnlyMatchCount).toBe(
      (impact!.fixtureCapacity * (impact!.fixtureCapacity - 1)) / 2,
    );
    expect(impact!.playerBreakMatchCount).toBe(impact!.playerCount * impact!.breakSlotCount);
  });

  it('returns null for already-supported, invalid, or fixture-exhausted player counts', () => {
    expect(analyzeUnsupportedCdmFixtureCandidate(12)).toBeNull();
    expect(analyzeUnsupportedCdmFixtureCandidate(14)).toBeNull();
    expect(analyzeUnsupportedCdmFixtureCandidate(21)).toBeNull();
    expect(analyzeUnsupportedCdmFixtureCandidate(0)).toBeNull();
    expect(analyzeUnsupportedCdmFixtureCandidate(13.5)).toBeNull();
  });
});

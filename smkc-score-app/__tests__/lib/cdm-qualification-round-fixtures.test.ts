import {
  CDM_QUALIFICATION_ROUND_FIXTURES,
  getCdmQualificationRoundFixture,
} from '@/lib/cdm-qualification-round-fixtures';

describe('CDM qualification round fixtures', () => {
  it('matches all 20 MR track cards and GP cups from RR 2025 Start.xlsm Tracks', () => {
    expect(CDM_QUALIFICATION_ROUND_FIXTURES.map(({ courses, cup }) => ({ courses, cup }))).toEqual([
      { courses: ['MC2', 'GV1', 'DP3', 'GV3'], cup: 'Star' },
      { courses: ['GV2', 'KB1', 'CI2', 'MC3'], cup: 'Mushroom' },
      { courses: ['KB2', 'MC4', 'VL2', 'BC3'], cup: 'Special' },
      { courses: ['VL1', 'BC2', 'MC1', 'CI1'], cup: 'Flower' },
      { courses: ['DP2', 'DP1', 'RR', 'BC1'], cup: 'Star' },
      { courses: ['CI2', 'DP3', 'DP2', 'GV2'], cup: 'Special' },
      { courses: ['BC1', 'MC3', 'KB2', 'BC2'], cup: 'Mushroom' },
      { courses: ['VL2', 'MC4', 'KB1', 'VL1'], cup: 'Flower' },
      { courses: ['MC2', 'CI1', 'BC3', 'RR'], cup: 'Special' },
      { courses: ['GV1', 'MC1', 'GV3', 'DP1'], cup: 'Star' },
      { courses: ['DP2', 'DP3', 'KB2', 'MC2'], cup: 'Flower' },
      { courses: ['BC1', 'GV2', 'VL1', 'BC2'], cup: 'Mushroom' },
      { courses: ['BC3', 'DP1', 'CI2', 'GV3'], cup: 'Star' },
      { courses: ['GV1', 'MC3', 'RR', 'KB1'], cup: 'Mushroom' },
      { courses: ['MC1', 'VL2', 'MC4', 'CI1'], cup: 'Flower' },
      { courses: ['DP1', 'MC2', 'KB1', 'GV3'], cup: 'Special' },
      { courses: ['BC3', 'KB2', 'MC3', 'BC2'], cup: 'Star' },
      { courses: ['DP2', 'MC4', 'RR', 'CI1'], cup: 'Mushroom' },
      { courses: ['GV2', 'VL1', 'CI2', 'VL2'], cup: 'Flower' },
      { courses: ['BC1', 'MC1', 'DP3', 'GV1'], cup: 'Special' },
    ]);
    expect(CDM_QUALIFICATION_ROUND_FIXTURES.map(({ roundNumber }) => roundNumber)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  it('uses the one-based shared roundNumber without wrapping', () => {
    expect(getCdmQualificationRoundFixture(1)).toBe(CDM_QUALIFICATION_ROUND_FIXTURES[0]);
    expect(getCdmQualificationRoundFixture(20)).toBe(CDM_QUALIFICATION_ROUND_FIXTURES[19]);
    expect(() => getCdmQualificationRoundFixture(21)).toThrow('1-20');
  });
});

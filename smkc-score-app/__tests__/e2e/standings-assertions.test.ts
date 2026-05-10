import { assertGpCombinedStandingsHeaders } from '../../e2e/lib/standings-assertions';

describe('GP combined standings E2E assertions', () => {
  it('accepts English GP point headers', () => {
    expect(() => {
      assertGpCombinedStandingsHeaders([
        '#',
        'Group',
        'Player',
        'MP',
        'W',
        'T',
        'L',
        'Match Pts',
        'Driver Pts',
        'Qual Pts',
      ]);
    }).not.toThrow();
  });

  it('accepts Japanese GP point headers', () => {
    expect(() => {
      assertGpCombinedStandingsHeaders([
        '#',
        'グループ',
        'プレイヤー',
        '試合',
        '勝',
        '分',
        '敗',
        '勝点',
        'ドライバー点',
        '予選点',
      ]);
    }).not.toThrow();
  });

  it('fails when the driver points header is missing', () => {
    expect(() => {
      assertGpCombinedStandingsHeaders([
        '#',
        'Group',
        'Player',
        'MP',
        'W',
        'T',
        'L',
        'Match Pts',
        'Qual Pts',
      ]);
    }).toThrow('GP combined standings missing driver points header');
  });
});

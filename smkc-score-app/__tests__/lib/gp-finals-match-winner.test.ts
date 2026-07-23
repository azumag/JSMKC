import { getGpFinalsMatchWinner } from '@/lib/gp-finals-match-winner';
import type { Player } from '@/lib/types';

function player(id: string, nickname: string): Player {
  return {
    id,
    nickname,
    name: nickname,
    password: null,
    isActive: true,
    role: 'participant',
    discordId: null,
    discordUsername: null,
    avatarUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as Player;
}

describe('getGpFinalsMatchWinner', () => {
  const player1 = player('p1', 'Player 1');
  const player2 = player('p2', 'Player 2');

  it('returns null for unfinished matches', () => {
    expect(
      getGpFinalsMatchWinner({
        completed: false,
        points1: 2,
        points2: 0,
        player1,
        player2,
      }),
    ).toBeNull();
  });

  it('uses cup-win points for current GP finals rows', () => {
    expect(
      getGpFinalsMatchWinner({
        completed: true,
        points1: 2,
        points2: 0,
        player1,
        player2,
      }),
    ).toBe(player1);
  });

  it('falls back to suddenDeathWinnerId for completed legacy tied rows', () => {
    expect(
      getGpFinalsMatchWinner({
        completed: true,
        points1: 2,
        points2: 2,
        player1,
        player2,
        suddenDeathWinnerId: 'p2',
      }),
    ).toBe(player2);
  });

  it('uses the non-tied score before a stale legacy sudden-death winner', () => {
    expect(
      getGpFinalsMatchWinner({
        completed: true,
        points1: 2,
        points2: 1,
        player1,
        player2,
        suddenDeathWinnerId: 'p2',
      }),
    ).toBe(player1);
  });

  it('prioritizes an administrator correction over score order and legacy state', () => {
    expect(
      getGpFinalsMatchWinner({
        completed: true,
        points1: 2,
        points2: 0,
        player1,
        player2,
        suddenDeathWinnerId: 'p1',
        winnerOverrideId: 'p2',
      }),
    ).toBe(player2);
  });

  it('returns null for tied rows without a matching legacy winner', () => {
    expect(
      getGpFinalsMatchWinner({
        completed: true,
        points1: 1,
        points2: 1,
        player1,
        player2,
        suddenDeathWinnerId: 'missing-player',
      }),
    ).toBeNull();
  });
});

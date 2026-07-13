import { rollbackTaBattleRoyaleEntries } from '@/lib/ta/battle-royale-entry-rollback';

describe('rollbackTaBattleRoyaleEntries', () => {
  it('作成済みのPhase 3エントリーだけを削除する', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 14 });
    const playerIds = ['player-1', 'player-2'];

    await rollbackTaBattleRoyaleEntries({ deleteMany }, 'tournament-1', playerIds);

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        tournamentId: 'tournament-1',
        stage: 'phase3',
        playerId: { in: playerIds },
      },
    });
  });

  it('作成済み参加者がいない場合は削除を実行しない', async () => {
    const deleteMany = jest.fn();

    await rollbackTaBattleRoyaleEntries({ deleteMany }, 'tournament-1', []);

    expect(deleteMany).not.toHaveBeenCalled();
  });
});

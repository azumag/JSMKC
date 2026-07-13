type TTEntryDeleteManyDelegate = {
  deleteMany(args: {
    where: {
      tournamentId: string;
      stage: 'phase3';
      playerId: { in: string[] };
    };
  }): Promise<unknown>;
};

/**
 * Removes Phase 3 entries created while starting a TA battle royale.
 *
 * D1 does not support the interactive transaction required to wrap multiple
 * createMany chunks, so callers use this as a compensating rollback when a
 * later chunk fails.
 */
export async function rollbackTaBattleRoyaleEntries(
  tTEntry: TTEntryDeleteManyDelegate,
  tournamentId: string,
  playerIds: string[],
): Promise<void> {
  if (playerIds.length === 0) return;

  await tTEntry.deleteMany({
    where: {
      tournamentId,
      stage: 'phase3',
      playerId: { in: playerIds },
    },
  });
}

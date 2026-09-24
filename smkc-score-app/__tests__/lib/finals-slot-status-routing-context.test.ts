import { generateBracketStructure } from '@/lib/double-elimination';
import { serializeFinalsSlots, type SlotStatusMatch } from '@/lib/finals-slot-status';

function makeMatch(matchNumber: number, overrides: Partial<SlotStatusMatch> = {}): SlotStatusMatch {
  return {
    matchNumber,
    round: null,
    completed: false,
    player1Id: `p1-${matchNumber}`,
    player2Id: `p2-${matchNumber}`,
    ...overrides,
  };
}

describe('serializeFinalsSlots routing context', () => {
  it('uses the full statusMatches set when serializing only a receiving match', () => {
    const bracketStructure = generateBracketStructure(8);
    const receiving = bracketStructure.find((match) => match.round === 'winners_sf');
    expect(receiving).toBeDefined();

    const sources = bracketStructure.filter((match) => match.winnerGoesTo === receiving!.matchNumber);
    expect(sources).toHaveLength(2);

    const [completedSource, pendingSource] = sources;
    expect(completedSource.position).toBeDefined();
    expect(pendingSource.position).toBeDefined();

    const receivingMatch = makeMatch(receiving!.matchNumber, { round: receiving!.round });
    const statusMatches = [
      makeMatch(completedSource.matchNumber, { round: completedSource.round, completed: true }),
      makeMatch(pendingSource.matchNumber, { round: pendingSource.round, completed: false }),
      receivingMatch,
    ];

    const [withoutFullContext] = serializeFinalsSlots([receivingMatch], bracketStructure);
    expect(withoutFullContext).toMatchObject({
      player1Tbd: true,
      player2Tbd: true,
      player1Id: null,
      player2Id: null,
    });

    const [withFullContext] = serializeFinalsSlots([receivingMatch], bracketStructure, statusMatches);
    const completedSlot = completedSource.position === 1 ? 'player1' : 'player2';
    const pendingSlot = pendingSource.position === 1 ? 'player1' : 'player2';

    expect(withFullContext[`${completedSlot}Tbd`]).toBe(false);
    expect(withFullContext[`${pendingSlot}Tbd`]).toBe(true);
    expect(withFullContext[`${completedSlot}Id`]).toBe(receivingMatch[`${completedSlot}Id`]);
    expect(withFullContext[`${pendingSlot}Id`]).toBeNull();
  });
});

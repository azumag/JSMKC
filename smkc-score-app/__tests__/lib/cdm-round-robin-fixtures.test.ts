import { getCdmRoundRobinFixturePlan } from '@/lib/cdm-round-robin-fixtures';

describe('getCdmRoundRobinFixturePlan', () => {
  it.each([
    [7, 8, 1],
    [8, 8, 0],
    [9, 10, 1],
    [10, 10, 0],
    [11, 12, 1],
    [12, 12, 0],
    [14, 16, 2],
    [15, 16, 1],
    [16, 16, 0],
    [17, 18, 1],
    [18, 18, 0],
    [19, 20, 1],
    [20, 20, 0],
  ])('maps %i players to the %i-slot fixture with %i BREAK slots', (playerCount, capacity, breakSlotCount) => {
    expect(getCdmRoundRobinFixturePlan(playerCount)).toEqual({ capacity, breakSlotCount });
  });

  it.each([0, 1, 2, 6, 13, 21, 32])('reports unsupported CDM fixture sizes for %i players', (playerCount) => {
    expect(getCdmRoundRobinFixturePlan(playerCount)).toBeNull();
  });
});

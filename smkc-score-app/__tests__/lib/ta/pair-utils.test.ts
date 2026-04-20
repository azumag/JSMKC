import { applyAutoPairsToSetup, computeAutoPairs } from '@/lib/ta/pair-utils';

/** Helper to make a minimal PairPlayer entry */
const makeEntry = (id: string, playerId: string, seeding: number | null) => ({
  id,
  playerId,
  seeding,
});

describe('computeAutoPairs', () => {
  it('pairs seed 1 with seed N, 2 with N-1 (snake pairing)', () => {
    const players = [
      makeEntry('e1', 'p1', 1),
      makeEntry('e2', 'p2', 2),
      makeEntry('e3', 'p3', 3),
      makeEntry('e4', 'p4', 4),
    ];
    const pairs = computeAutoPairs(players);
    expect(pairs).toHaveLength(2);
    // seed 1 + seed 4
    expect(pairs[0][0].seeding).toBe(1);
    expect(pairs[0][1].seeding).toBe(4);
    // seed 2 + seed 3
    expect(pairs[1][0].seeding).toBe(2);
    expect(pairs[1][1].seeding).toBe(3);
  });

  it('handles 8 players correctly (CDM2025 typical size)', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      makeEntry(`e${i + 1}`, `p${i + 1}`, i + 1)
    );
    const pairs = computeAutoPairs(players);
    expect(pairs).toHaveLength(4);
    // Verify each pair: seed k paired with seed (9-k)
    pairs.forEach(([a, b]) => {
      expect((a.seeding ?? 0) + (b.seeding ?? 0)).toBe(9);
    });
  });

  it('leaves last player unpaired when count is odd', () => {
    const players = [
      makeEntry('e1', 'p1', 1),
      makeEntry('e2', 'p2', 2),
      makeEntry('e3', 'p3', 3),
    ];
    const pairs = computeAutoPairs(players);
    // Math.floor(3/2) = 1 pair; seed 3 is unpaired
    expect(pairs).toHaveLength(1);
    expect(pairs[0][0].seeding).toBe(1);
    expect(pairs[0][1].seeding).toBe(3);
  });

  it('places null-seeded players last', () => {
    const players = [
      makeEntry('e1', 'p1', null),
      makeEntry('e2', 'p2', 1),
      makeEntry('e3', 'p3', null),
      makeEntry('e4', 'p4', 2),
    ];
    const pairs = computeAutoPairs(players);
    expect(pairs).toHaveLength(2);
    // Sorted: seed1=1, seed2=2, seed3=null, seed4=null
    // Pairs: [seed1, null], [seed2, null]
    expect(pairs[0][0].seeding).toBe(1);
    expect(pairs[0][1].seeding).toBeNull();
    expect(pairs[1][0].seeding).toBe(2);
    expect(pairs[1][1].seeding).toBeNull();
  });

  it('returns empty array for 0 players', () => {
    expect(computeAutoPairs([])).toHaveLength(0);
  });

  it('returns empty array for 1 player', () => {
    expect(computeAutoPairs([makeEntry('e1', 'p1', 1)])).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const players = [
      makeEntry('e1', 'p1', 3),
      makeEntry('e2', 'p2', 1),
    ];
    const original = [...players];
    computeAutoPairs(players);
    expect(players).toEqual(original);
  });
});

describe('applyAutoPairsToSetup', () => {
  it('assigns reciprocal partners to seeded entries using snake pairing', () => {
    const result = applyAutoPairsToSetup<{ playerId: string; seeding?: number; partnerId?: string | null }>([
      { playerId: 'p1', seeding: 1 },
      { playerId: 'p2', seeding: 2 },
      { playerId: 'p3', seeding: 3 },
      { playerId: 'p4', seeding: 4 },
    ]);

    const byId = new Map(result.map((e) => [e.playerId, e.partnerId]));
    // seed 1 ↔ seed 4, seed 2 ↔ seed 3
    expect(byId.get('p1')).toBe('p4');
    expect(byId.get('p4')).toBe('p1');
    expect(byId.get('p2')).toBe('p3');
    expect(byId.get('p3')).toBe('p2');
  });

  it('leaves unranked entries untouched so manual pairings survive seeding edits', () => {
    const result = applyAutoPairsToSetup([
      { playerId: 'p1', seeding: 1 },
      { playerId: 'p2', seeding: 2 },
      { playerId: 'p3', partnerId: 'p4' },
      { playerId: 'p4', partnerId: 'p3' },
    ]);

    const byId = new Map(result.map((e) => [e.playerId, e.partnerId]));
    // Seeded pair gets computed partnerId
    expect(byId.get('p1')).toBe('p2');
    expect(byId.get('p2')).toBe('p1');
    // Unranked entries keep their prior partnerId
    expect(byId.get('p3')).toBe('p4');
    expect(byId.get('p4')).toBe('p3');
  });

  it('nulls the partner of the odd-player-out when seed count is odd', () => {
    const result = applyAutoPairsToSetup([
      { playerId: 'p1', seeding: 1, partnerId: 'p2' },
      { playerId: 'p2', seeding: 2, partnerId: 'p1' },
      { playerId: 'p3', seeding: 3, partnerId: 'p1' }, // stale partnerId
    ]);

    const byId = new Map(result.map((e) => [e.playerId, e.partnerId]));
    // seed 1 ↔ seed 3 per snake pairing; seed 2 has no partner
    expect(byId.get('p1')).toBe('p3');
    expect(byId.get('p3')).toBe('p1');
    expect(byId.get('p2')).toBeNull();
  });
});

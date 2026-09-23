import { applyAutoPairsToSetup, computeAutoPairs } from '@/lib/ta/pair-utils';

describe('TA auto-pair malformed seeding handling', () => {
  it('treats malformed numeric seedings as deterministic unranked entries', () => {
    const pairs = computeAutoPairs([
      { id: 'valid-a', playerId: 'valid-a', seeding: 1 },
      { id: 'bad-nan', playerId: 'bad-nan', seeding: Number.NaN },
      { id: 'bad-inf', playerId: 'bad-inf', seeding: Number.POSITIVE_INFINITY },
      { id: 'valid-b', playerId: 'valid-b', seeding: 2 },
      { id: 'bad-neg', playerId: 'bad-neg', seeding: -1 },
      { id: 'bad-frac', playerId: 'bad-frac', seeding: 1.5 },
    ]);

    expect(pairs.map(([stronger, weaker]) => [stronger.playerId, weaker.playerId])).toEqual([
      ['valid-a', 'bad-neg'],
      ['valid-b', 'bad-nan'],
      ['bad-frac', 'bad-inf'],
    ]);
  });

  it('treats an unsafe positive integer as unranked for deterministic pairing', () => {
    const pairs = computeAutoPairs([
      { id: 'valid-a', playerId: 'valid-a', seeding: 1 },
      { id: 'unsafe-a', playerId: 'unsafe-a', seeding: Number.MAX_SAFE_INTEGER + 1 },
      { id: 'valid-b', playerId: 'valid-b', seeding: 2 },
      { id: 'bad-z', playerId: 'bad-z', seeding: -1 },
    ]);

    expect(pairs.map(([stronger, weaker]) => [stronger.playerId, weaker.playerId])).toEqual([
      ['valid-a', 'unsafe-a'],
      ['valid-b', 'bad-z'],
    ]);
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negative', -1],
    ['fractional', 1.5],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ])('preserves an existing manual partner for a malformed %s setup seeding', (_label, malformedSeeding) => {
    const result = applyAutoPairsToSetup([
      { playerId: 'valid-a', seeding: 1 },
      { playerId: 'valid-b', seeding: 2 },
      { playerId: 'manual', seeding: malformedSeeding, partnerId: 'manual-partner' },
    ]);

    const byId = new Map(result.map((entry) => [entry.playerId, entry.partnerId]));
    expect(byId.get('valid-a')).toBe('valid-b');
    expect(byId.get('valid-b')).toBe('valid-a');
    expect(byId.get('manual')).toBe('manual-partner');
  });
});

import { getTaPhase3Rules } from '@/lib/ta/battle-royale';
import { attachLivesAfterToRounds, replayPhase3Lives } from '@/lib/ta/phase3-life-replay';

describe('replayPhase3Lives', () => {
  const standardRules = getTaPhase3Rules(false); // initialLives: 3, resets at [8, 4, 2]
  const battleRoyaleRules = getTaPhase3Rules(true); // initialLives: 10, no resets

  it('deducts a life from the bottom half of a round and leaves the top half untouched', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'fast', timeMs: 60000 },
          { playerId: 'slow', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
      },
    ];

    const { livesByPlayer, roundLivesByPlayer } = replayPhase3Lives(rounds, ['fast', 'slow'], standardRules);

    expect(livesByPlayer.get('fast')).toBe(3);
    expect(livesByPlayer.get('slow')).toBe(2);
    expect(roundLivesByPlayer.get(1)?.get('fast')).toBe(3);
    expect(roundLivesByPlayer.get(1)?.get('slow')).toBe(2);
  });

  it('accumulates life loss across consecutive rounds', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
      },
      {
        roundNumber: 2,
        results: [
          { playerId: 'a', timeMs: 65000 },
          { playerId: 'b', timeMs: 95000 },
        ],
        eliminatedIds: [],
        livesReset: false,
      },
    ];

    const { roundLivesByPlayer } = replayPhase3Lives(rounds, ['a', 'b'], standardRules);

    expect(roundLivesByPlayer.get(1)?.get('b')).toBe(2);
    expect(roundLivesByPlayer.get(2)?.get('b')).toBe(1);
    expect(roundLivesByPlayer.get(2)?.get('a')).toBe(3);
  });

  it('trusts the persisted eliminatedIds for who was eliminated, clamping their life to 0', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 90000 },
        ],
        eliminatedIds: ['b'],
        livesReset: false,
      },
    ];

    const { livesByPlayer, eliminated, roundLivesByPlayer } = replayPhase3Lives(rounds, ['a', 'b'], standardRules);

    expect(eliminated.has('b')).toBe(true);
    expect(livesByPlayer.get('b')).toBe(0);
    expect(roundLivesByPlayer.get(1)?.get('b')).toBe(0);
  });

  it('does not deduct further life from a player eliminated in an earlier round', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 90000 },
        ],
        eliminatedIds: ['b'],
        livesReset: false,
      },
      {
        roundNumber: 2,
        results: [{ playerId: 'a', timeMs: 65000 }],
        eliminatedIds: [],
        livesReset: false,
      },
    ];

    const { livesByPlayer } = replayPhase3Lives(rounds, ['a', 'b'], standardRules);

    expect(livesByPlayer.get('b')).toBe(0);
  });

  it('resets every surviving player to initialLives when a round crosses a reset threshold', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 90000 },
        ],
        eliminatedIds: ['b'],
        livesReset: true,
      },
    ];

    const { roundLivesByPlayer } = replayPhase3Lives(rounds, ['a', 'b'], standardRules);

    expect(roundLivesByPlayer.get(1)?.get('a')).toBe(3);
    expect(roundLivesByPlayer.get(1)?.get('b')).toBe(0); // eliminated players are not revived by a reset
  });

  it('uses 10 initial lives and no reset thresholds in battle royale mode', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
      },
    ];

    const { roundLivesByPlayer } = replayPhase3Lives(rounds, ['a', 'b'], battleRoyaleRules);

    expect(roundLivesByPlayer.get(1)?.get('a')).toBe(10);
    expect(roundLivesByPlayer.get(1)?.get('b')).toBe(9);
  });

  it('replays rounds in roundNumber order regardless of input array order', () => {
    const rounds = [
      {
        roundNumber: 2,
        results: [{ playerId: 'a', timeMs: 65000 }],
        eliminatedIds: [],
        livesReset: false,
      },
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
      },
    ];

    const { roundLivesByPlayer } = replayPhase3Lives(rounds, ['a', 'b'], standardRules);

    expect(roundLivesByPlayer.get(1)?.get('a')).toBe(3);
    expect(roundLivesByPlayer.get(2)?.get('a')).toBe(3);
  });

  it('keeps the top (odd) player safe and only deducts the bottom half for an odd-sized field', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 70000 },
          { playerId: 'c', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
      },
    ];

    // ceil(3/2) = 2 safe, so only 'c' (the single slowest) is in the bottom half.
    const { roundLivesByPlayer } = replayPhase3Lives(rounds, ['a', 'b', 'c'], standardRules);

    expect(roundLivesByPlayer.get(1)?.get('a')).toBe(3);
    expect(roundLivesByPlayer.get(1)?.get('b')).toBe(3);
    expect(roundLivesByPlayer.get(1)?.get('c')).toBe(2);
  });

  it('eliminates two players in the same round when eliminatedIds lists both', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 90000 },
          { playerId: 'c', timeMs: 91000 },
          { playerId: 'd', timeMs: 92000 },
        ],
        eliminatedIds: ['c', 'd'],
        livesReset: false,
      },
    ];

    const { eliminated, roundLivesByPlayer } = replayPhase3Lives(rounds, ['a', 'b', 'c', 'd'], standardRules);

    expect(eliminated.has('c')).toBe(true);
    expect(eliminated.has('d')).toBe(true);
    expect(roundLivesByPlayer.get(1)?.get('c')).toBe(0);
    expect(roundLivesByPlayer.get(1)?.get('d')).toBe(0);
  });

  it('falls back to rules.initialLives for a result whose playerId was never in the seeded playerIds set', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'orphan', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
      },
    ];

    // 'orphan' is not in the seeded playerIds set (mirrors the "orphaned eliminated
    // entries" scenario in route.test.ts, where a round can reference a player the
    // current entries list no longer has). It should self-heal via the initialLives
    // fallback rather than produce an undefined/NaN life total.
    const { roundLivesByPlayer } = replayPhase3Lives(rounds, ['a'], standardRules);

    expect(roundLivesByPlayer.get(1)?.get('orphan')).toBe(2);
  });

  it('breaks a boundary-tied round using the resolved sudden-death order, not raw (still-tied) time', () => {
    // 4 players tie exactly at the safe/unsafe boundary (b and c both at 60000ms).
    // Submission array order is [a, b, c, d] (b before c); a stable sort that
    // ignores sudden-death data preserves that order for the tied pair, so a
    // naive fallback would land on bottomHalf=[c, d] regardless of who
    // actually won the tiebreak. The resolved race below has 'c' FASTER
    // (10000ms) than 'b' (15000ms) -- the opposite of their array order --
    // so this only passes if the sudden-death order is genuinely consulted;
    // it would fail against the pre-fix naive-sort implementation.
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 50000 },
          { playerId: 'b', timeMs: 60000 },
          { playerId: 'c', timeMs: 60000 },
          { playerId: 'd', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
        suddenDeathRounds: [
          {
            sequence: 1,
            resolved: true,
            results: [
              { playerId: 'c', timeMs: 10000 },
              { playerId: 'b', timeMs: 15000 },
            ],
          },
        ],
      },
    ];

    const { roundLivesByPlayer, lifeLostByPlayer } = replayPhase3Lives(rounds, ['a', 'b', 'c', 'd'], standardRules);

    expect(roundLivesByPlayer.get(1)?.get('c')).toBe(3); // resolved faster/safe, keeps all lives
    expect(roundLivesByPlayer.get(1)?.get('b')).toBe(2); // resolved slower/unsafe, loses a life
    expect(lifeLostByPlayer.get(1)?.has('c')).toBe(false);
    expect(lifeLostByPlayer.get(1)?.has('b')).toBe(true);
  });

  it('ignores an unresolved sudden-death sub-round and falls back to raw (stable-sorted) time order', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 50000 },
          { playerId: 'b', timeMs: 60000 },
          { playerId: 'c', timeMs: 60000 },
          { playerId: 'd', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
        suddenDeathRounds: [{ sequence: 1, resolved: false, results: null }],
      },
    ];

    const { roundLivesByPlayer, lifeLostByPlayer } = replayPhase3Lives(rounds, ['a', 'b', 'c', 'd'], standardRules);

    // No resolved sudden-death data is usable, so this must behave exactly as
    // if suddenDeathRounds were absent: a stable sort preserves the tied
    // pair's submission-array order (b before c), so bottomHalf=[c, d].
    expect(roundLivesByPlayer.get(1)?.get('a')).toBe(3);
    expect(roundLivesByPlayer.get(1)?.get('b')).toBe(3);
    expect(roundLivesByPlayer.get(1)?.get('c')).toBe(2);
    expect(roundLivesByPlayer.get(1)?.get('d')).toBe(2);
    expect(lifeLostByPlayer.get(1)?.has('c')).toBe(true);
    expect(lifeLostByPlayer.get(1)?.has('b')).toBe(false);
  });

  it('deducts a round-configured lifeLoss instead of the default 1 (TA battle royale custom round)', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'fast', timeMs: 60000 },
          { playerId: 'slow', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
        lifeLoss: 2,
      },
    ];

    const { roundLivesByPlayer } = replayPhase3Lives(rounds, ['fast', 'slow'], battleRoyaleRules);

    expect(roundLivesByPlayer.get(1)?.get('fast')).toBe(10); // top half: untouched regardless of lifeLoss
    expect(roundLivesByPlayer.get(1)?.get('slow')).toBe(8); // bottom half: 10 - 2, not the default 10 - 1
  });

  it('falls back to a lifeLoss of 1 when the round has no lifeLoss column (legacy rounds)', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'fast', timeMs: 60000 },
          { playerId: 'slow', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
        // lifeLoss intentionally omitted, mirroring a round recorded before
        // the TTPhaseRound.lifeLoss column existed.
      },
    ];

    const { roundLivesByPlayer } = replayPhase3Lives(rounds, ['fast', 'slow'], standardRules);

    expect(roundLivesByPlayer.get(1)?.get('slow')).toBe(2);
  });

  it('accumulates a mix of default and custom lifeLoss across consecutive rounds', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 50000 },
          { playerId: 'b', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
        lifeLoss: 3,
      },
      {
        roundNumber: 2,
        results: [
          { playerId: 'a', timeMs: 55000 },
          { playerId: 'b', timeMs: 95000 },
        ],
        eliminatedIds: [],
        livesReset: false,
        // Default lifeLoss (1) for this round.
      },
    ];

    const { roundLivesByPlayer } = replayPhase3Lives(rounds, ['a', 'b'], battleRoyaleRules);

    expect(roundLivesByPlayer.get(1)?.get('b')).toBe(7); // 10 - 3
    expect(roundLivesByPlayer.get(2)?.get('b')).toBe(6); // 7 - 1
  });

  it('applies an absolute manual adjustment before a later round during replay', () => {
    const rounds = [
      {
        id: 'round-1',
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
        submittedAt: '2026-07-24T02:00:00.000Z',
      },
    ];
    const adjustments = [
      {
        id: 'adjust-a',
        playerId: 'a',
        oldLives: 3,
        newLives: 5,
        entryVersion: 1,
        afterRoundId: null,
        afterRoundNumber: 0,
        createdAt: '2026-07-24T01:00:00.000Z',
      },
      {
        id: 'adjust-b',
        playerId: 'b',
        oldLives: 3,
        newLives: 5,
        entryVersion: 1,
        afterRoundId: null,
        afterRoundNumber: 0,
        createdAt: '2026-07-24T01:00:00.001Z',
      },
    ];

    const replay = replayPhase3Lives(rounds, ['a', 'b'], standardRules, adjustments);

    expect(replay.livesByPlayer.get('a')).toBe(5);
    expect(replay.livesByPlayer.get('b')).toBe(4);
    expect(replay.roundLivesByPlayer.get(1)?.get('b')).toBe(4);
  });

  it('keeps a post-round absolute adjustment when that round is removed by cancel', () => {
    const adjustments = [
      {
        id: 'adjust-before',
        playerId: 'a',
        oldLives: 3,
        newLives: 5,
        entryVersion: 1,
        afterRoundId: null,
        afterRoundNumber: 0,
        createdAt: '2026-07-24T01:00:00.000Z',
      },
      {
        id: 'adjust-after-deleted-round',
        playerId: 'a',
        oldLives: 4,
        newLives: 6,
        entryVersion: 3,
        afterRoundId: 'deleted-round',
        afterRoundNumber: 1,
        createdAt: '2026-07-24T03:00:00.000Z',
      },
    ];

    const replay = replayPhase3Lives([], ['a'], standardRules, adjustments);

    expect(replay.livesByPlayer.get('a')).toBe(6);
    expect(replay.eliminated.has('a')).toBe(false);
  });

  it('does not reapply an adjustment from before a later life-reset boundary', () => {
    const rounds = [
      {
        id: 'reset-round',
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: true,
        submittedAt: '2026-07-24T02:00:00.000Z',
      },
    ];
    const adjustments = [
      {
        id: 'adjust-before-reset',
        playerId: 'a',
        oldLives: 3,
        newLives: 5,
        entryVersion: 1,
        afterRoundId: null,
        afterRoundNumber: 0,
        createdAt: '2026-07-24T01:00:00.000Z',
      },
    ];

    const replay = replayPhase3Lives(rounds, ['a', 'b'], standardRules, adjustments);

    expect(replay.livesByPlayer.get('a')).toBe(3);
    expect(replay.livesByPlayer.get('b')).toBe(3);
  });

  it('records round lives before a later adjustment while keeping the adjusted current state', () => {
    const rounds = [
      {
        id: 'round-1',
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000 },
          { playerId: 'b', timeMs: 90000 },
        ],
        eliminatedIds: [],
        livesReset: false,
        submittedAt: '2026-07-24T01:00:00.000Z',
      },
    ];
    const adjustment = {
      id: 'adjust-after',
      playerId: 'b',
      oldLives: 2,
      newLives: 5,
      entryVersion: 2,
      afterRoundId: 'round-1',
      afterRoundNumber: 1,
      createdAt: '2026-07-24T02:00:00.000Z',
    };

    const replay = replayPhase3Lives(rounds, ['a', 'b'], standardRules, [adjustment, adjustment]);

    expect(replay.roundLivesByPlayer.get(1)?.get('b')).toBe(2);
    expect(replay.livesByPlayer.get('b')).toBe(5);
  });
});

describe('attachLivesAfterToRounds', () => {
  const standardRules = getTaPhase3Rules(false);

  it('annotates each result with the replayed remaining life for that round', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [
          { playerId: 'a', timeMs: 60000, isRetry: false },
          { playerId: 'b', timeMs: 90000, isRetry: false },
        ],
        eliminatedIds: [],
        livesReset: false,
      },
    ];

    const [annotated] = attachLivesAfterToRounds(rounds, ['a', 'b'], standardRules);

    expect(annotated.results[0]).toMatchObject({ playerId: 'a', livesAfter: 3, lifeLost: false });
    expect(annotated.results[1]).toMatchObject({ playerId: 'b', livesAfter: 2, lifeLost: true });
  });

  it('does not mutate the input rounds', () => {
    const rounds = [
      {
        roundNumber: 1,
        results: [{ playerId: 'a', timeMs: 60000, isRetry: false }],
        eliminatedIds: [],
        livesReset: false,
      },
    ];

    attachLivesAfterToRounds(rounds, ['a'], standardRules);

    expect(rounds[0].results[0]).not.toHaveProperty('livesAfter');
  });
});

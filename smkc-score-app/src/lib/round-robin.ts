/**
 * Circle-Method Round-Robin Scheduling
 *
 * Generates a balanced round-robin tournament schedule using the polygon
 * scheduling algorithm (circle method). This is the industry-standard
 * approach for creating fair round-robin pairings.
 *
 * Two-phase algorithm:
 * Phase 1 (Circle method): Generate pairings with day assignments.
 *   - Fix one player at position 0.
 *   - Rotate the remaining N-1 players through positions each day.
 *   - Pair position[k] with position[N-1-k] for k = 0..N/2-1.
 * Phase 2 (Balance optimization): Assign and optimize 1P/2P sides.
 *   - Initial greedy assignment based on running balance.
 *   - Iterative optimization swaps sides where it reduces imbalance.
 *   - Guarantees each player's 1P/2P count differs by at most 1.
 *
 * Reference: requirements.md §10.4 サークル方式（ラウンドロビン方式）
 */

import { BYE_SCORE_BM_MR, GP_BYE_SCORE } from '@/lib/constants';

/** Sentinel player ID for BYE matches when player count is odd */
export const BREAK_PLAYER_ID = '__BREAK__';

/** A single match in the round-robin schedule */
export interface RoundRobinMatch {
  /** 1-based day/round number */
  day: number;
  /** Player assigned to 1P (home) side */
  player1Id: string;
  /** Player assigned to 2P (away) side */
  player2Id: string;
  /** True if one participant is BREAK (bye/walkover) */
  isBye: boolean;
}

/** Complete round-robin schedule output */
export interface RoundRobinSchedule {
  matches: RoundRobinMatch[];
  totalDays: number;
  hasByes: boolean;
}

/** Intermediate pairing before 1P/2P assignment */
interface RawPairing {
  day: number;
  a: string;
  b: string;
  isBye: boolean;
}

/**
 * Generate a round-robin schedule using the circle method.
 *
 * For N players:
 * - If N is even: produces N-1 days with N/2 matches each
 * - If N is odd: adds BREAK sentinel, produces N days with N/2 matches each
 *   (one BYE match per day)
 *
 * @param playerIds - Array of player IDs to schedule (order determines seeding)
 * @returns Complete schedule with day-numbered matches
 */
export function generateRoundRobinSchedule(playerIds: string[]): RoundRobinSchedule {
  if (playerIds.length < 2) {
    return { matches: [], totalDays: 0, hasByes: false };
  }

  /* Pad to even count by adding BREAK if necessary */
  const hasByes = playerIds.length % 2 !== 0;
  const participants = hasByes ? [...playerIds, BREAK_PLAYER_ID] : [...playerIds];
  const n = participants.length;
  const totalDays = n - 1;

  /* Phase 1: Generate pairings using circle method */
  const pairings = generatePairings(participants, totalDays, n);

  /* Phase 2: Assign 1P/2P sides with optimization */
  const matches = assignSides(pairings);

  return { matches, totalDays, hasByes };
}

/**
 * Phase 1: Circle method pairing generation.
 *
 * Fix participants[0] at position 0, rotate the remaining n-1 elements
 * each day. Pair positions: (0, n-1), (1, n-2), (2, n-3), ...
 */
function generatePairings(participants: string[], totalDays: number, n: number): RawPairing[] {
  const rotating = participants.slice(1);
  const pairings: RawPairing[] = [];

  for (let day = 0; day < totalDays; day++) {
    const ordering = [participants[0], ...rotating];

    for (let k = 0; k < n / 2; k++) {
      const a = ordering[k];
      const b = ordering[n - 1 - k];
      const isBye = a === BREAK_PLAYER_ID || b === BREAK_PLAYER_ID;

      pairings.push({ day: day + 1, a, b, isBye });
    }

    /* Rotate: move last element to front */
    rotating.unshift(rotating.pop()!);
  }

  return pairings;
}

/**
 * Phase 2: Assign 1P/2P sides with balance optimization.
 *
 * BYE matches: real player is always player1 (for correct score assignment).
 * Real matches: greedy initial assignment, then iterative optimization
 * to guarantee each player's 1P/2P balance is within ±1.
 *
 * The optimization minimizes total deviation from each player's ideal
 * 1P count (totalRealMatches / 2). Convergence is guaranteed because
 * each swap strictly reduces total deviation.
 */
function assignSides(pairings: RawPairing[]): RoundRobinMatch[] {
  /* Count total real matches per player for target calculation */
  const totalReal = new Map<string, number>();
  for (const p of pairings) {
    if (p.isBye) continue;
    totalReal.set(p.a, (totalReal.get(p.a) ?? 0) + 1);
    totalReal.set(p.b, (totalReal.get(p.b) ?? 0) + 1);
  }

  /* Initial assignment: greedy based on running balance */
  const balance = new Map<string, number>();
  const matches: RoundRobinMatch[] = pairings.map((p, i) => {
    if (p.isBye) {
      const realPlayer = p.a === BREAK_PLAYER_ID ? p.b : p.a;
      return { day: p.day, player1Id: realPlayer, player2Id: BREAK_PLAYER_ID, isBye: true };
    }

    const balA = balance.get(p.a) ?? 0;
    const balB = balance.get(p.b) ?? 0;

    let player1Id: string;
    let player2Id: string;

    if (balA < balB) {
      player1Id = p.a;
      player2Id = p.b;
    } else if (balB < balA) {
      player1Id = p.b;
      player2Id = p.a;
    } else {
      /* Tie-break: alternate by match index for better distribution */
      if (i % 2 === 0) {
        player1Id = p.a;
        player2Id = p.b;
      } else {
        player1Id = p.b;
        player2Id = p.a;
      }
    }

    balance.set(player1Id, (balance.get(player1Id) ?? 0) + 1);
    balance.set(player2Id, (balance.get(player2Id) ?? 0) - 1);

    return { day: p.day, player1Id, player2Id, isBye: false };
  });

  /* Optimization pass: iteratively swap sides to reduce imbalance */
  optimizeSideBalance(matches, totalReal);

  return matches;
}

/**
 * Iteratively swap 1P/2P sides to minimize total deviation from targets.
 *
 * For each player, the target 1P count is totalRealMatches / 2.
 * A swap is performed when it strictly reduces the sum of both players'
 * deviations from their targets. The loop converges because the objective
 * function (total deviation) is bounded below by 0 and strictly decreases.
 */
function optimizeSideBalance(matches: RoundRobinMatch[], totalReal: Map<string, number>): void {
  /* Compute current 1P counts */
  const as1P = new Map<string, number>();
  for (const m of matches) {
    if (m.isBye) continue;
    as1P.set(m.player1Id, (as1P.get(m.player1Id) ?? 0) + 1);
  }

  /* Compute targets: ideal 1P count = totalRealMatches / 2 */
  const target = new Map<string, number>();
  for (const [p, t] of totalReal) {
    target.set(p, t / 2);
  }

  let improved = true;
  while (improved) {
    improved = false;

    for (const m of matches) {
      if (m.isBye) continue;

      const p1 = m.player1Id;
      const p2 = m.player2Id;
      const c1 = as1P.get(p1) ?? 0;
      const c2 = as1P.get(p2) ?? 0;
      const t1 = target.get(p1) ?? 0;
      const t2 = target.get(p2) ?? 0;

      /* Current deviation from targets */
      const currDev = Math.abs(c1 - t1) + Math.abs(c2 - t2);

      /* Deviation after swapping: p1 loses one 1P, p2 gains one */
      const swapDev = Math.abs(c1 - 1 - t1) + Math.abs(c2 + 1 - t2);

      if (swapDev < currDev) {
        m.player1Id = p2;
        m.player2Id = p1;
        as1P.set(p1, c1 - 1);
        as1P.set(p2, c2 + 1);
        improved = true;
      }
    }
  }
}

/**
 * Get auto-completed match data for BYE (BREAK) matches.
 *
 * BYE scores per requirements.md §10.2:
 * - BM/MR: 4-0 (real player wins all rounds)
 * - GP: 45-0 (real player gets max driver points)
 *
 * @param mode - Event type code
 * @returns Fields to spread into the match creation data
 */
export function getByeMatchData(
  mode: 'bm' | 'mr' | 'gp',
): Record<string, number> {
  switch (mode) {
    case 'bm':
    case 'mr':
      return { score1: BYE_SCORE_BM_MR, score2: 0 };
    case 'gp':
      return { points1: GP_BYE_SCORE, points2: 0 };
  }
}

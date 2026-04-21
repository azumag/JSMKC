/**
 * Double Elimination Tournament Bracket Logic
 *
 * This module generates and manages the bracket structure for double elimination
 * tournaments used in BM, MR, and GP finals. In double elimination:
 *
 * - Players must lose twice to be eliminated.
 * - The Winners Bracket tracks undefeated players.
 * - The Losers Bracket gives one-loss players a second chance.
 * - The Grand Final pits the Winners Bracket champion against the Losers Bracket champion.
 * - A Grand Final Reset occurs only if the Losers Bracket champion wins the first Grand Final,
 *   because the Winners Bracket champion would then have only one loss.
 *
 * Supports 8-player brackets (17 matches) and 16-player brackets (31 matches).
 *
 * Bracket structure for 8 players (17 total matches):
 *   Winners: QF(4) -> SF(2) -> Final(1)
 *   Losers:  R1(2) -> R2(2) -> R3(2) -> SF(1) -> Final(1)
 *   Grand Final(1) + Reset(1)
 *
 * Bracket structure for 16 players (31 total matches):
 *   Winners: R1(8) -> QF(4) -> SF(2) -> Final(1)
 *   Losers:  L_R1(4) -> L_R2(4) -> L_R3(2) -> L_R4(2) -> SF(1) -> Final(1)
 *   Grand Final(1) + Reset(1)
 *
 * Match numbering is sequential (1-17) for consistent reference across
 * the UI and API layers.
 */

import { BracketMatch } from '@/types/bracket';

/**
 * Generate the complete bracket structure for an 8-player double elimination tournament.
 *
 * Each BracketMatch contains routing information (winnerGoesTo, loserGoesTo)
 * that determines how players advance or drop down after each match result.
 * The `position` field indicates whether a player enters as player 1 or player 2
 * in the next match, which is important for consistent bracket display.
 *
 * @param playerCount - Number of players (must be 8 or 16)
 * @returns Array of BracketMatch objects defining the full bracket
 * @throws Error if playerCount is not 8 or 16
 */
export function generateBracketStructure(playerCount: number): BracketMatch[] {
  if (playerCount === 16) {
    return generate16PlayerBracket();
  }
  if (playerCount !== 8) {
    throw new Error("Only 8-player and 16-player brackets are supported");
  }

  const matches: BracketMatch[] = [];
  let matchNumber = 1;

  // --- WINNERS BRACKET ---

  // Winners Quarter Finals (Matches 1-4): Initial seeded matchups
  // Seeding pattern ensures maximum separation of top seeds:
  //   Match 1: Seed 1 vs Seed 8 (top vs bottom)
  //   Match 2: Seed 4 vs Seed 5 (middle seeds)
  //   Match 3: Seed 2 vs Seed 7
  //   Match 4: Seed 3 vs Seed 6
  // This arrangement guarantees Seeds 1 and 2 are on opposite sides of the bracket.
  const seedPairs = [
    [1, 8],
    [4, 5],
    [2, 7],
    [3, 6],
  ];

  for (let i = 0; i < 4; i++) {
    matches.push({
      matchNumber: matchNumber,
      round: "winners_qf",
      bracket: "winners",
      player1Seed: seedPairs[i][0],
      player2Seed: seedPairs[i][1],
      // Winners of QF matches 1&2 go to SF match 5; QF matches 3&4 go to SF match 6
      winnerGoesTo: 5 + Math.floor(i / 2),
      // Losers drop to Losers Bracket R1: QF 1&2 losers to L_R1 match 8; QF 3&4 losers to match 9
      loserGoesTo: 8 + Math.floor(i / 2),
      // Position alternates 1,2,1,2 for the receiving semi-final match slots
      position: ((i % 2) + 1) as 1 | 2,
    });
    matchNumber++;
  }

  // Winners Semi Finals (Matches 5-6): Winners of QF advance here
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: matchNumber,
      round: "winners_sf",
      bracket: "winners",
      // Both SF winners advance to the Winners Final (match 7)
      winnerGoesTo: 7,
      // SF losers drop to Losers R3 (matches 12-13), giving them another
      // chance to reach the Grand Final through the losers side
      loserGoesTo: 12 + i,
      // Position 1 or 2 in the Winners Final
      position: (i + 1) as 1 | 2,
    });
    matchNumber++;
  }

  // Winners Final (Match 7): Determines the Winners Bracket champion
  matches.push({
    matchNumber: matchNumber,
    round: "winners_final",
    bracket: "winners",
    // Winner goes to Grand Final as the undefeated player
    winnerGoesTo: 16,
    // Loser drops to Losers Final (match 15) -- still alive with one loss
    loserGoesTo: 15,
    // Enters Grand Final as player 1 (advantaged position for display)
    position: 1,
  });
  matchNumber++;

  // --- LOSERS BRACKET ---

  // Losers Round 1 (Matches 8-9): Receives losers from Winners QF
  // These matches pit QF losers against each other. The losers of
  // these matches are eliminated (second loss).
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: matchNumber,
      round: "losers_r1",
      bracket: "losers",
      // Winners advance to Losers R2 (matches 10-11)
      winnerGoesTo: 10 + i,
      // No loserGoesTo -- losing here means elimination (second loss)
      position: 1,
    });
    matchNumber++;
  }

  // Losers Round 2 (Matches 10-11): L_R1 winners face cross-bracket opponents
  // This round mixes players from different QF groups for bracket diversity.
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: matchNumber,
      round: "losers_r2",
      bracket: "losers",
      // Winners advance to Losers R3 (matches 12-13)
      winnerGoesTo: 12 + i,
      // Position 2: enters as the second player in the next losers match
      position: 2,
    });
    matchNumber++;
  }

  // Losers Round 3 (Matches 12-13): L_R2 winners vs Winners SF losers
  // This is where players who lost in the Winners SF re-enter.
  // Winners SF losers come in as player 1 (set by getNextMatchInfo).
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: matchNumber,
      round: "losers_r3",
      bracket: "losers",
      // Winners advance to Losers SF (match 14)
      winnerGoesTo: 14,
      // Position alternates for the Losers SF slots
      position: (i + 1) as 1 | 2,
    });
    matchNumber++;
  }

  // Losers Semi Final (Match 14): Last match before the Losers Final
  matches.push({
    matchNumber: matchNumber,
    round: "losers_sf",
    bracket: "losers",
    // Winner advances to Losers Final (match 15)
    winnerGoesTo: 15,
    position: 1,
  });
  matchNumber++;

  // Losers Final (Match 15): Losers SF winner vs Winners Final loser
  // The Winners Final loser enters as player 2 (set by getNextMatchInfo).
  matches.push({
    matchNumber: matchNumber,
    round: "losers_final",
    bracket: "losers",
    // Winner becomes the Losers Bracket champion and enters Grand Final (match 16)
    winnerGoesTo: 16,
    // Enters Grand Final as player 2 (the one-loss challenger)
    position: 2,
  });
  matchNumber++;

  // --- GRAND FINAL ---

  // Grand Final (Match 16): Winners champion vs Losers champion
  // If the Winners champion wins, the tournament is over.
  // If the Losers champion wins, a reset match is required because
  // both players would then have exactly one loss.
  // Note: winnerGoesTo is not set here — Grand Final advancement is handled
  // by special-case logic in the finals route (uses round: 'grand_final_reset' lookup).
  matches.push({
    matchNumber: matchNumber,
    round: "grand_final",
    bracket: "grand_final",
  });
  matchNumber++;

  // Grand Final Reset (Match 17): Only played if the Losers Bracket
  // champion won the first Grand Final, equalizing losses at 1 each.
  // This ensures the true champion has either zero or one loss advantage.
  matches.push({
    matchNumber: matchNumber,
    round: "grand_final_reset",
    bracket: "grand_final",
    // No further routing -- this is the absolute final match
  });

  return matches;
}

/**
 * Generate a 16-player double elimination bracket (31 matches).
 *
 * Seeding: 1v16, 8v9, 5v12, 4v13, 3v14, 6v11, 7v10, 2v15
 * Ensures seeds 1&2 on opposite halves, top 4 maximally separated.
 */
function generate16PlayerBracket(): BracketMatch[] {
  const matches: BracketMatch[] = [];
  let mn = 1;

  // --- WINNERS R1 (Matches 1-8): 16 players → 8 winners ---
  const seedPairs16 = [
    [1, 16], [8, 9], [5, 12], [4, 13],
    [3, 14], [6, 11], [7, 10], [2, 15],
  ];
  for (let i = 0; i < 8; i++) {
    matches.push({
      matchNumber: mn,
      round: "winners_r1",
      bracket: "winners",
      player1Seed: seedPairs16[i][0],
      player2Seed: seedPairs16[i][1],
      /* R1 winners → QF: pairs of 2 map to one QF match (9-12) */
      winnerGoesTo: 9 + Math.floor(i / 2),
      /* R1 losers → Losers R1: pairs of 2 map to one L_R1 match (16-19) */
      loserGoesTo: 16 + Math.floor(i / 2),
      position: ((i % 2) + 1) as 1 | 2,
    });
    mn++;
  }

  // --- WINNERS QF (Matches 9-12) ---
  for (let i = 0; i < 4; i++) {
    matches.push({
      matchNumber: mn,
      round: "winners_qf",
      bracket: "winners",
      winnerGoesTo: 13 + Math.floor(i / 2),
      /* QF losers → Losers R2 (20-23) */
      loserGoesTo: 20 + i,
      position: ((i % 2) + 1) as 1 | 2,
    });
    mn++;
  }

  // --- WINNERS SF (Matches 13-14) ---
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: mn,
      round: "winners_sf",
      bracket: "winners",
      winnerGoesTo: 15,
      /* SF losers → Losers R4 (26-27) */
      loserGoesTo: 26 + i,
      position: (i + 1) as 1 | 2,
    });
    mn++;
  }

  // --- WINNERS FINAL (Match 15) ---
  matches.push({
    matchNumber: mn,
    round: "winners_final",
    bracket: "winners",
    winnerGoesTo: 30,
    loserGoesTo: 29,
    position: 1,
  });
  mn++;

  // --- LOSERS R1 (Matches 16-19): R1 losers pair up ---
  for (let i = 0; i < 4; i++) {
    matches.push({
      matchNumber: mn,
      round: "losers_r1",
      bracket: "losers",
      winnerGoesTo: 20 + i,
      position: 1,
    });
    mn++;
  }

  // --- LOSERS R2 (Matches 20-23): L_R1 winners vs QF losers ---
  for (let i = 0; i < 4; i++) {
    matches.push({
      matchNumber: mn,
      round: "losers_r2",
      bracket: "losers",
      winnerGoesTo: 24 + Math.floor(i / 2),
      position: ((i % 2) + 1) as 1 | 2,
    });
    mn++;
  }

  // --- LOSERS R3 (Matches 24-25): L_R2 winners pair up ---
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: mn,
      round: "losers_r3",
      bracket: "losers",
      winnerGoesTo: 26 + i,
      position: 2,
    });
    mn++;
  }

  // --- LOSERS R4 (Matches 26-27): L_R3 winners vs SF losers ---
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: mn,
      round: "losers_r4",
      bracket: "losers",
      winnerGoesTo: 28,
      position: (i + 1) as 1 | 2,
    });
    mn++;
  }

  // --- LOSERS SF (Match 28) ---
  matches.push({
    matchNumber: mn,
    round: "losers_sf",
    bracket: "losers",
    winnerGoesTo: 29,
    position: 1,
  });
  mn++;

  // --- LOSERS FINAL (Match 29): LSF winner vs WF loser ---
  matches.push({
    matchNumber: mn,
    round: "losers_final",
    bracket: "losers",
    winnerGoesTo: 30,
    position: 2,
  });
  mn++;

  // --- GRAND FINAL (Match 30) ---
  matches.push({
    matchNumber: mn,
    round: "grand_final",
    bracket: "grand_final",
  });
  mn++;

  // --- GRAND FINAL RESET (Match 31) ---
  matches.push({
    matchNumber: mn,
    round: "grand_final_reset",
    bracket: "grand_final",
  });

  return matches;
}

/**
 * Generate the Pre-Bracket Playoff ("barrage") structure for 12 entrants.
 *
 * Resolves issue #454: Top 24 → Top 16. Qualification positions 13-24 enter
 * a single-elimination playoff whose 4 winners fill Upper-Bracket seeds 13-16.
 * Top 4 playoff seeds (qualification 13-16) receive a Round 1 BYE.
 *
 * Structure (8 matches total):
 *   R1 (playoff_r1, 4 matches): Seeds 8v9, 5v12, 6v11, 7v10 — standard bracket pairing
 *                               for the non-BYE seeds, maximally separating stronger seeds.
 *   R2 (playoff_r2, 4 matches): BYE seeds 1-4 each face one R1 winner. Winners advance.
 *
 * Upper-Bracket seed assignment mirrors 16-player bracket balance so the
 * strongest playoff survivor (faced the lowest BYE seed in R2) enters the
 * Upper Bracket opposite Upper-seed 1 — the toughest path — preserving the
 * competitive advantage of direct-advance qualifiers:
 *   R2 match 5 (playoff seed 1) winner → Upper seed 16
 *   R2 match 6 (playoff seed 4) winner → Upper seed 13
 *   R2 match 7 (playoff seed 3) winner → Upper seed 14
 *   R2 match 8 (playoff seed 2) winner → Upper seed 15
 *
 * Cross-stage advancement (playoff_r2 winner → Upper Bracket slot) is handled
 * by the finals-route PUT handler, not by the generic getNextMatchInfo mechanism,
 * because the target match lives in a different `stage` row.
 *
 * @param entrantCount - Number of playoff entrants (currently only 12 supported)
 * @returns Array of BracketMatch objects defining the full playoff
 * @throws Error if entrantCount is not 12
 */
export function generatePlayoffStructure(entrantCount: number): BracketMatch[] {
  if (entrantCount !== 12) {
    throw new Error("Only 12-entrant playoff is supported");
  }

  const matches: BracketMatch[] = [];

  /* --- PLAYOFF ROUND 1 (Matches 1-4): 8 lower seeds pair up ---
   * Cross-group pairing for 2-group qualification (A7-12, B7-12):
   *   M1: A12(seed11) vs B11(seed10) → winner faces A7(seed1) in R2
   *   M2: A10(seed7)  vs B9(seed6)   → winner faces B8(seed4) in R2
   *   M3: A9(seed5)   vs B10(seed8)  → winner faces A8(seed3) in R2
   *   M4: A11(seed9)  vs B12(seed12) → winner faces B7(seed2) in R2
   *
   *   seed 1   2   3   4   5   6    7    8    9   10   11   12
   */
  const r1Pairs = [
    [11, 10], // A12 vs B11
    [7, 6],   // A10 vs B9
    [5, 8],   // A9 vs B10
    [9, 12],  // A11 vs B12
  ];
  for (let i = 0; i < 4; i++) {
    matches.push({
      matchNumber: i + 1,
      round: "playoff_r1",
      bracket: "winners",
      player1Seed: r1Pairs[i][0],
      player2Seed: r1Pairs[i][1],
      /* R1 winners enter R2 as player 2 (the BYE seed holds player 1). */
      winnerGoesTo: 5 + i,
      position: 2,
      /* No loserGoesTo — single-elimination, losers are out. */
    });
  }

  /* --- PLAYOFF ROUND 2 (Matches 5-8): BYE seeds meet R1 winners ---
   * Each R2 match is a "decider": winner advances to the Upper Bracket.
   * advancesToUpperSeed specifies which of seeds 13-16 the winner claims.
   *
   * The assignment inverts the playoff seed → upper seed relationship so the
   * strongest playoff survivor faces Upper #1: see function-level comment. */
  const byeSeedToUpperSeed: Array<{ byeSeed: number; upperSeed: number }> = [
    { byeSeed: 1, upperSeed: 16 },
    { byeSeed: 4, upperSeed: 13 },
    { byeSeed: 3, upperSeed: 14 },
    { byeSeed: 2, upperSeed: 15 },
  ];
  for (let i = 0; i < 4; i++) {
    matches.push({
      matchNumber: 5 + i,
      round: "playoff_r2",
      bracket: "winners",
      player1Seed: byeSeedToUpperSeed[i].byeSeed,
      /* player2Seed intentionally omitted — filled at runtime by R1 winner. */
      advancesToUpperSeed: byeSeedToUpperSeed[i].upperSeed,
      /* No winnerGoesTo/loserGoesTo — cross-stage advancement is handled by
       * the finals route, and losers are eliminated. */
    });
  }

  return matches;
}

/**
 * Determine where a player goes after a match result.
 *
 * Given a completed match and whether the player won or lost, returns
 * the next match number and the position (1 or 2) in that next match.
 * Returns null if there is no next match (e.g., the player is eliminated
 * or the tournament is over).
 *
 * The position logic varies by round:
 * - QF losers: their original bracket position (odd match -> P1, even -> P2)
 * - SF losers: always enter Losers R3 as player 1 (the "seeded" position)
 * - Winners Final loser: enters Losers Final as player 2
 *
 * @param matches              - Full array of bracket matches
 * @param completedMatchNumber - Match number that was just completed
 * @param isWinner             - True if querying for the winner's next match
 * @returns Next match info or null if no next match exists
 */
export function getNextMatchInfo(
  matches: BracketMatch[],
  completedMatchNumber: number,
  isWinner: boolean
): { nextMatchNumber: number; position: 1 | 2 } | null {
  const match = matches.find((m) => m.matchNumber === completedMatchNumber);
  if (!match) return null;

  if (isWinner && match.winnerGoesTo) {
    // Winner advances to the designated next match
    return {
      nextMatchNumber: match.winnerGoesTo,
      position: match.position || 1,
    };
  } else if (!isWinner && match.loserGoesTo) {
    // Loser drops down -- position depends on the round to maintain
    // proper bracket placement and visual consistency
    if (match.round === "winners_r1") {
      /* 16-player R1 losers: position based on match number parity */
      return {
        nextMatchNumber: match.loserGoesTo,
        position: ((completedMatchNumber - 1) % 2 + 1) as 1 | 2,
      };
    } else if (match.round === "winners_qf") {
      /* QF losers enter Losers R2 as position 2 (L_R1 winners enter as position 1).
       * In 16-player bracket, QF is matches 9-12 → each goes to L_R2 match 20-23.
       * In 8-player bracket, QF is matches 1-4 → position based on parity. */
      const is16Player = matches.length > 17;
      return {
        nextMatchNumber: match.loserGoesTo,
        position: is16Player ? 2 : ((completedMatchNumber - 1) % 2 + 1) as 1 | 2,
      };
    } else if (match.round === "winners_sf") {
      /* SF losers enter as player 1 (the "higher seed" position) */
      return {
        nextMatchNumber: match.loserGoesTo,
        position: 1,
      };
    } else if (match.round === "winners_final") {
      /* Winners Final loser enters Losers Final as player 2 */
      return {
        nextMatchNumber: match.loserGoesTo,
        position: 2,
      };
    }
  }

  // No next match: player is eliminated or tournament is complete
  return null;
}

/**
 * Human-readable display names for each bracket round.
 * Used in the tournament UI to label match phases clearly.
 */
export const roundNames: Record<string, string> = {
  playoff_r1: "Playoff Round 1",
  playoff_r2: "Playoff Round 2",
  winners_r1: "Winners Round 1",
  winners_qf: "Winners Quarter Final",
  winners_sf: "Winners Semi Final",
  winners_final: "Winners Final",
  losers_r1: "Losers Round 1",
  losers_r2: "Losers Round 2",
  losers_r3: "Losers Round 3",
  losers_r4: "Losers Round 4",
  losers_sf: "Losers Semi Final",
  losers_final: "Losers Final",
  grand_final: "Grand Final",
  grand_final_reset: "Grand Final Reset",
};

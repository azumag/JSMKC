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
 * Currently supports 8-player brackets only (the standard for JSMKC finals).
 * The seeding follows the standard 1v8, 4v5, 2v7, 3v6 pattern to ensure
 * that the top two seeds can only meet in the Winners Final, and adjacent
 * seeds are maximally separated in the bracket.
 *
 * Bracket structure for 8 players (17 total matches):
 *   Winners: QF(4) -> SF(2) -> Final(1)
 *   Losers:  R1(2) -> R2(2) -> R3(2) -> SF(1) -> Final(1)
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
 * @param playerCount - Number of players (must be 8)
 * @returns Array of BracketMatch objects defining the full bracket
 * @throws Error if playerCount is not 8
 */
export function generateBracketStructure(playerCount: number): BracketMatch[] {
  if (playerCount !== 8) {
    // Currently only 8-player brackets are implemented because JSMKC finals
    // always have exactly 8 qualifiers. This can be extended to 4, 16, etc.
    // by adding additional seed patterns and bracket configurations.
    throw new Error("Currently only 8-player brackets are supported");
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
      // Losers drop to Losers Bracket R1: QF 1&2 losers to L_R1 match 9; QF 3&4 losers to match 10
      loserGoesTo: 9 + Math.floor(i / 2),
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
      // SF losers drop to Losers R3 (matches 13-14), giving them another
      // chance to reach the Grand Final through the losers side
      loserGoesTo: 13 + i,
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
      // Winners advance to Losers R2 (matches 11-12)
      winnerGoesTo: 11 + i,
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
      // Winners advance to Losers R3 (matches 13-14)
      winnerGoesTo: 13 + i,
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
      // Winners advance to Losers SF (match 15)
      winnerGoesTo: 15,
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
    // Winner advances to Losers Final (match 16)
    winnerGoesTo: 16,
    position: 1,
  });
  matchNumber++;

  // Losers Final (Match 15): Losers SF winner vs Winners Final loser
  // The Winners Final loser enters as player 2 (set by getNextMatchInfo).
  matches.push({
    matchNumber: matchNumber,
    round: "losers_final",
    bracket: "losers",
    // Winner becomes the Losers Bracket champion and enters Grand Final
    winnerGoesTo: 17,
    // Enters Grand Final as player 2 (the one-loss challenger)
    position: 2,
  });
  matchNumber++;

  // --- GRAND FINAL ---

  // Grand Final (Match 16): Winners champion vs Losers champion
  // If the Winners champion wins, the tournament is over.
  // If the Losers champion wins, a reset match is required because
  // both players would then have exactly one loss.
  matches.push({
    matchNumber: matchNumber,
    round: "grand_final",
    bracket: "grand_final",
    // Points to reset match if needed
    winnerGoesTo: 18,
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
    if (match.round === "winners_qf") {
      // QF losers: position based on original match number parity.
      // Match 1 loser -> P1, Match 2 loser -> P2 in the same L_R1 match.
      return {
        nextMatchNumber: match.loserGoesTo,
        position: ((completedMatchNumber - 1) % 2 + 1) as 1 | 2,
      };
    } else if (match.round === "winners_sf") {
      // SF losers enter Losers R3 as player 1 (the "higher seed" position),
      // because they had a better initial tournament run than L_R2 winners.
      return {
        nextMatchNumber: match.loserGoesTo,
        position: 1,
      };
    } else if (match.round === "winners_final") {
      // Winners Final loser enters Losers Final as player 2,
      // facing the Losers SF winner who enters as player 1.
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
  winners_qf: "Winners Quarter Final",
  winners_sf: "Winners Semi Final",
  winners_final: "Winners Final",
  losers_r1: "Losers Round 1",
  losers_r2: "Losers Round 2",
  losers_r3: "Losers Round 3",
  losers_sf: "Losers Semi Final",
  losers_final: "Losers Final",
  grand_final: "Grand Final",
  grand_final_reset: "Grand Final Reset",
};

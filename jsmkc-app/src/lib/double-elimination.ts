// Double Elimination Tournament Logic

import { BracketMatch } from '@/types/bracket';

// Generate bracket structure for 8 players
export function generateBracketStructure(playerCount: number): BracketMatch[] {
  if (playerCount !== 8) {
    // For now, only support 8 players
    // Can be extended later for 4, 16, etc.
    throw new Error("Currently only 8-player brackets are supported");
  }

  const matches: BracketMatch[] = [];
  let matchNumber = 1;

  // Winners Bracket Round 1 (Quarter Finals) - 4 matches
  // Seeding: 1v8, 4v5, 2v7, 3v6
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
      winnerGoesTo: 5 + Math.floor(i / 2), // W_SF matches 5, 6
      loserGoesTo: 9 + Math.floor(i / 2), // L_R1 matches 9, 10
      position: ((i % 2) + 1) as 1 | 2,
    });
    matchNumber++;
  }

  // Winners Bracket Semi Finals - 2 matches (5, 6)
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: matchNumber,
      round: "winners_sf",
      bracket: "winners",
      winnerGoesTo: 7, // W_Final
      loserGoesTo: 13 + i, // L_R3 matches 13, 14
      position: (i + 1) as 1 | 2,
    });
    matchNumber++;
  }

  // Winners Final - 1 match (7)
  matches.push({
    matchNumber: matchNumber,
    round: "winners_final",
    bracket: "winners",
    winnerGoesTo: 16, // Grand Final
    loserGoesTo: 15, // L_Final
    position: 1,
  });
  matchNumber++;

  // Losers Bracket Round 1 - 2 matches (8, 9)
  // Receives losers from W_QF: match 1&2 losers, match 3&4 losers
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: matchNumber,
      round: "losers_r1",
      bracket: "losers",
      winnerGoesTo: 11 + i, // L_R2 matches 11, 12
      position: 1,
    });
    matchNumber++;
  }

  // Losers Bracket Round 2 - 2 matches (10, 11)
  // L_R1 winners vs remaining W_QF losers
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: matchNumber,
      round: "losers_r2",
      bracket: "losers",
      winnerGoesTo: 13 + i, // L_R3 matches 13, 14
      position: 2,
    });
    matchNumber++;
  }

  // Losers Bracket Round 3 - 2 matches (12, 13)
  // L_R2 winners vs W_SF losers
  for (let i = 0; i < 2; i++) {
    matches.push({
      matchNumber: matchNumber,
      round: "losers_r3",
      bracket: "losers",
      winnerGoesTo: 15, // L_SF
      position: (i + 1) as 1 | 2,
    });
    matchNumber++;
  }

  // Losers Semi Final - 1 match (14)
  matches.push({
    matchNumber: matchNumber,
    round: "losers_sf",
    bracket: "losers",
    winnerGoesTo: 16, // L_Final
    position: 1,
  });
  matchNumber++;

  // Losers Final - 1 match (15)
  // L_SF winner vs W_Final loser
  matches.push({
    matchNumber: matchNumber,
    round: "losers_final",
    bracket: "losers",
    winnerGoesTo: 17, // Grand Final
    position: 2,
  });
  matchNumber++;

  // Grand Final - 1 match (16)
  matches.push({
    matchNumber: matchNumber,
    round: "grand_final",
    bracket: "grand_final",
    winnerGoesTo: 18, // Reset if needed
  });
  matchNumber++;

  // Grand Final Reset - 1 match (17) - only played if losers winner beats winners winner
  matches.push({
    matchNumber: matchNumber,
    round: "grand_final_reset",
    bracket: "grand_final",
  });

  return matches;
}

// Get next match info based on result
export function getNextMatchInfo(
  matches: BracketMatch[],
  completedMatchNumber: number,
  isWinner: boolean
): { nextMatchNumber: number; position: 1 | 2 } | null {
  const match = matches.find((m) => m.matchNumber === completedMatchNumber);
  if (!match) return null;

  if (isWinner && match.winnerGoesTo) {
    return {
      nextMatchNumber: match.winnerGoesTo,
      position: match.position || 1,
    };
  } else if (!isWinner && match.loserGoesTo) {
    // Determine position for loser
    if (match.round === "winners_qf") {
      // QF losers go to L_R1 as player 1 or 2 based on their original position
      return {
        nextMatchNumber: match.loserGoesTo,
        position: ((completedMatchNumber - 1) % 2 + 1) as 1 | 2,
      };
    } else if (match.round === "winners_sf") {
      // SF losers go to L_R3 as player 1
      return {
        nextMatchNumber: match.loserGoesTo,
        position: 1,
      };
    } else if (match.round === "winners_final") {
      // W_Final loser goes to L_Final as player 2
      return {
        nextMatchNumber: match.loserGoesTo,
        position: 2,
      };
    }
  }

  return null;
}

// Round display names
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

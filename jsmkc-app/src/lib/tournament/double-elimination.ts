/**
 * Tournament-Specific Double Elimination Bracket Generator
 *
 * Generates bracket structures for BM and MR finals from qualified players.
 * Creates winner bracket, loser bracket, and grand final match nodes
 * with proper seeding based on qualification rankings.
 *
 * This module differs from @/lib/double-elimination.ts which defines
 * the abstract bracket structure. This module creates actual match nodes
 * with player assignments for tournament execution.
 */

/** Full bracket structure with winner, loser, and grand final sections */
export interface DoubleEliminationBracket {
  winnerBracket: MatchNode[];
  loserBracket: MatchNode[];
  grandFinal?: MatchNode;
}

/** A single match in the bracket with player IDs and win tracking */
export interface MatchNode {
  id: string;
  player1Id: string | null;
  player2Id: string | null;
  player1Wins: number;
  player2Wins: number;
  bracket: 'winners' | 'losers' | 'grand_final';
  /** Position identifier within bracket (e.g., "wb-r1", "lb-r2", "gf") */
  bracketPosition: string;
  /** Round identifier for display purposes */
  round: string;
  isGrandFinal: boolean;
}

/** Player entering the bracket with qualification data */
export interface BracketPlayer {
  playerId: string;
  playerName: string;
  /** Rank from qualification (1 = best), used for seeding */
  qualifyingRank: number;
  /** Number of losses accumulated (used in losers bracket tracking) */
  losses: number;
  wins?: number;
  points?: number;
}

/**
 * Generates a double elimination bracket from qualified players.
 * Players are seeded by qualifying rank. The bracket size is rounded
 * down to the nearest power of 2 if the player count isn't already one.
 *
 * @param players - Array of qualified players with rankings
 * @param _matchType - The competition mode ('BM' or 'MR'), reserved for future use
 * @returns Complete bracket structure with winner, loser, and grand final
 */
export function generateDoubleEliminationBracket(
  players: BracketPlayer[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _matchType: 'BM' | 'MR'
): DoubleEliminationBracket {
  const totalPlayers = players.length;
  const isPowerOf2 = (totalPlayers & (totalPlayers - 1)) === 0;

  if (totalPlayers < 2) {
    throw new Error('Need at least 2 players for bracket');
  }

  // Sort by qualifying rank so top seeds get favorable matchups
  const sortedPlayers = [...players].sort((a, b) => a.qualifyingRank - b.qualifyingRank);

  // Bracket size must be power of 2 for proper bracket structure
  const bracketSize = isPowerOf2 ? totalPlayers : Math.pow(2, Math.floor(Math.log2(totalPlayers - 1)));
  const bracketPlayers = sortedPlayers.slice(0, bracketSize);

  // Generate winner's bracket matches by pairing players sequentially
  const winnerBracket: MatchNode[] = [];

  const generateWinnerMatch = (
    player1: BracketPlayer,
    player2: BracketPlayer | null,
    position: string,
    round: number
  ): MatchNode => {
    const id = crypto.randomUUID();
    return {
      id,
      player1Id: player1.playerId,
      player2Id: player2?.playerId || null,
      player1Wins: 0,
      player2Wins: 0,
      bracket: 'winners',
      bracketPosition: position,
      round: `wb-r${round}`,
      isGrandFinal: false,
    };
  };

  let wbRound = 1;
  let wbIndex = 0;

  // Pair players in order: 1v2, 3v4, 5v6, 7v8
  while (wbIndex < bracketPlayers.length) {
    const p1 = bracketPlayers[wbIndex];
    const p2 = bracketPlayers[wbIndex + 1] || null;
    winnerBracket.push(generateWinnerMatch(p1, p2, `wb-r${wbRound}`, wbRound));
    wbIndex += 2;
    wbRound++;
  }

  // Collect losers from winner's bracket for loser's bracket placement
  const wbLosers: BracketPlayer[] = [];
  winnerBracket.forEach(match => {
    const p1 = players.find(p => p.playerId === match.player1Id);
    const p2 = match.player2Id ? players.find(p => p.playerId === match.player2Id) : null;

    // Determine loser based on win count comparison
    const loser = (p1 && p2 && match.player1Wins < match.player2Wins) ? p1 :
               (p1 && !p2) ? p2 : null;

    if (loser) {
      wbLosers.push(loser);
    }
  });

  // Generate loser's bracket matches
  const loserBracket: MatchNode[] = [];
  let lbRound = 1;
  let lbIndex = 0;

  while (lbIndex < wbLosers.length) {
    const p1 = wbLosers[lbIndex];
    const p2 = wbLosers[lbIndex + 1] || null;

    loserBracket.push({
      id: crypto.randomUUID(),
      player1Id: p1.playerId,
      player2Id: p2?.playerId || null,
      player1Wins: 0,
      player2Wins: 0,
      bracket: 'losers',
      bracketPosition: `lb-r${lbRound}`,
      round: `lb-r${lbRound}`,
      isGrandFinal: false,
    });

    lbIndex += 2;
    lbRound++;
  }

  // Grand Final: Winner's bracket champion vs Loser's bracket champion
  let grandFinal: MatchNode | undefined;

  if (winnerBracket.length > 0 && loserBracket.length > 0) {
    const wbChampion = winnerBracket[0];
    const lbChampion = loserBracket[0];

    if (wbChampion.player1Id && lbChampion.player1Id) {
      grandFinal = {
        id: crypto.randomUUID(),
        player1Id: wbChampion.player1Id,
        player2Id: lbChampion.player1Id,
        player1Wins: 0,
        player2Wins: 0,
        bracket: 'grand_final',
        bracketPosition: 'gf',
        round: 'gf',
        isGrandFinal: true,
      };
    }
  }

  return {
    winnerBracket,
    loserBracket,
    grandFinal,
  };
}

/**
 * Determines if a match is complete based on win counts.
 * Regular matches end when one player reaches the target wins.
 * Grand finals have special rules since the WB champion has an extra life.
 *
 * @param match - The match node to check
 * @param player1Wins - Current wins for player 1
 * @param player2Wins - Current wins for player 2
 * @returns 'complete' if the match has a winner, 'ongoing' otherwise
 */
export function calculateMatchProgression(match: MatchNode, player1Wins: number, player2Wins: number): 'ongoing' | 'complete' {
  const targetWins = 5; // BM target is 5 wins (best of 9)

  if (match.isGrandFinal) {
    // Grand Final: WB champion can lose once (reset), LB champion cannot
    if (match.player2Wins === targetWins || player1Wins === targetWins) {
      return 'complete';
    }
  } else {
    // Regular match: First to target wins
    if (player1Wins >= targetWins || player2Wins >= targetWins) {
      return 'complete';
    }
  }

  return 'ongoing';
}

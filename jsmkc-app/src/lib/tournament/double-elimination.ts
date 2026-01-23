export interface DoubleEliminationBracket {
  winnerBracket: MatchNode[];
  loserBracket: MatchNode[];
  grandFinal?: MatchNode;
}

export interface MatchNode {
  id: string;
  player1Id: string | null;
  player2Id: string | null;
  player1Wins: number;
  player2Wins: number;
  bracket: 'winners' | 'losers' | 'grand_final';
  bracketPosition: string; // e.g., "wb-r1", "wb-r2", "lb-r1", "lb-r2"
  round: string; // e.g., "wb-r1", "wb-r2"
  isGrandFinal: boolean;
}

export interface BracketPlayer {
  playerId: string;
  playerName: string;
  qualifyingRank: number;
  losses: number;
  wins?: number;
  points?: number;
}

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

  const sortedPlayers = [...players].sort((a, b) => a.qualifyingRank - b.qualifyingRank);

  // Determine bracket size (power of 2 or next power of 2)
  const bracketSize = isPowerOf2 ? totalPlayers : Math.pow(2, Math.floor(Math.log2(totalPlayers - 1)));

  const bracketPlayers = sortedPlayers.slice(0, bracketSize);

  // Winner's bracket
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

  while (wbIndex < bracketPlayers.length) {
    const p1 = bracketPlayers[wbIndex];
    const p2 = bracketPlayers[wbIndex + 1] || null;

    winnerBracket.push(generateWinnerMatch(p1, p2, `wb-r${wbRound}`, wbRound));

    wbIndex += 2;
    wbRound++;
  }

  // Move losers from winner's bracket matches to loser's bracket
  const wbLosers: BracketPlayer[] = [];
  winnerBracket.forEach(match => {
    const p1 = players.find(p => p.playerId === match.player1Id);
    const p2 = match.player2Id ? players.find(p => p.playerId === match.player2Id) : null;

    // Determine loser (the one with fewer wins)
    const loser = (p1 && p2 && match.player1Wins < match.player2Wins) ? p1 : 
               (p1 && !p2) ? p2 : null;

    if (loser) {
      wbLosers.push(loser);
    }
  });

  // Loser's bracket
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
    const wbChampion = winnerBracket[0]; // Winner of first WB match should be champion
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

export function calculateMatchProgression(match: MatchNode, player1Wins: number, player2Wins: number): 'ongoing' | 'complete' {
  const targetWins = 5; // BM target is 5 wins

  if (match.isGrandFinal) {
    // Grand Final: Winner can lose once, LB player loses once = out
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

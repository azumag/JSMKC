/**
 * Player Character Statistics API Route
 *
 * GET /api/players/:id/character-stats
 *
 * Retrieves character usage statistics for a specific player across all
 * match types (BM, MR, GP). This endpoint aggregates data from the
 * MatchCharacterUsage table and cross-references with actual match results
 * to calculate win rates per character.
 *
 * This data helps players and organizers understand character preferences
 * and performance trends in competitive SMK.
 *
 * Access: Admin only (requires authenticated admin session)
 *
 * Response:
 *   {
 *     playerId: string,
 *     playerName: string,
 *     playerNickname: string,
 *     totalMatches: number,
 *     characterStats: Array<{ character, matchCount, winCount, winRate }>,
 *     mostUsedCharacter: string | null,
 *     characterUsage: Array<MatchCharacterUsage>
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

/**
 * Interface representing a match record with the fields needed for
 * win/loss determination. Used across BM, MR, and GP match types.
 */
interface MatchWithInfo {
  id: string;
  matchType?: string;
  player1Id: string;
  player2Id: string;
  completed: boolean;
  /** Score for player 1 (used in BM and MR) */
  score1?: number;
  /** Score for player 2 (used in BM and MR) */
  score2?: number;
  /** Driver points for player 1 (used in GP) */
  points1?: number;
  /** Driver points for player 2 (used in GP) */
  points2?: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('players-character-stats-api');

  // Admin authentication check: character stats contain detailed
  // competitive data that should only be visible to tournament organizers
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  try {
    const { id: playerId } = await params;

    // Fetch all character usage records for this player.
    // Each record links a player to a character for a specific match.
    // Includes the player relation for name/nickname in the response.
    const characterUsages = await prisma.matchCharacterUsage.findMany({
      where: { playerId },
      include: { player: true },
      orderBy: { createdAt: 'desc' },
    });

    // Group character usages by match type (BM, MR, GP) to batch-fetch
    // the corresponding match records efficiently.
    const usagesByType = new Map<string, Array<typeof characterUsages[0]>>();
    for (const usage of characterUsages) {
      const type = usage.matchType;
      if (!usagesByType.has(type)) {
        usagesByType.set(type, []);
      }
      usagesByType.get(type)!.push(usage);
    }

    // Build a map of matchId -> match data for win/loss determination.
    // Each match type has its own Prisma model, so we query them separately.
    const matchMap = new Map<string, MatchWithInfo>();

    for (const [matchType, usages] of usagesByType.entries()) {
      // Deduplicate match IDs to minimize database queries
      const matchIds = [...new Set(usages.map(u => u.matchId))];

      let matches: MatchWithInfo[] = [];

      // Query the appropriate match table based on the match type.
      // BM = Battle Mode, MR = Match Race, GP = Grand Prix.
      if (matchType === 'BM') {
        matches = await prisma.bMMatch.findMany({ where: { id: { in: matchIds } } });
      } else if (matchType === 'MR') {
        matches = await prisma.mRMatch.findMany({ where: { id: { in: matchIds } } });
      } else if (matchType === 'GP') {
        matches = await prisma.gPMatch.findMany({ where: { id: { in: matchIds } } });
      }

      // Store each match with its type annotation for later win determination
      for (const match of matches) {
        matchMap.set(match.id, { ...match, matchType });
      }
    }

    // Aggregate per-character statistics: match count, win count, and win rate.
    // Win determination logic differs by match type:
    //   - BM/MR: compare score1 vs score2 based on player position
    //   - GP: compare points1 vs points2 (driver points system)
    const characterStats = new Map<string, {
      character: string;
      matchCount: number;
      winCount: number;
      winRate: number;
    }>();

    for (const usage of characterUsages) {
      const char = usage.character;
      const matchCount = (characterStats.get(char)?.matchCount || 0) + 1;
      const match = matchMap.get(usage.matchId);
      let isWin = false;

      if (match) {
        if (usage.matchType === 'BM') {
          // Battle Mode: compare balloon-pop scores
          const bMMatch = match;
          const isPlayer1 = bMMatch.player1Id === playerId;
          const myScore = isPlayer1 ? (bMMatch.score1 ?? 0) : (bMMatch.score2 ?? 0);
          const oppScore = isPlayer1 ? (bMMatch.score2 ?? 0) : (bMMatch.score1 ?? 0);
          isWin = myScore > oppScore;
        } else if (usage.matchType === 'MR') {
          // Match Race: compare race scores
          const mRMatch = match;
          const isPlayer1 = mRMatch.player1Id === playerId;
          const myScore = isPlayer1 ? (mRMatch.score1 ?? 0) : (mRMatch.score2 ?? 0);
          const oppScore = isPlayer1 ? (mRMatch.score2 ?? 0) : (mRMatch.score1 ?? 0);
          isWin = myScore > oppScore;
        } else if (usage.matchType === 'GP') {
          // Grand Prix: compare driver points (9, 6, 3, 1 system)
          const gPMatch = match;
          const isPlayer1 = gPMatch.player1Id === playerId;
          const myPoints = isPlayer1 ? (gPMatch.points1 ?? 0) : (gPMatch.points2 ?? 0);
          const oppPoints = isPlayer1 ? (gPMatch.points2 ?? 0) : (gPMatch.points1 ?? 0);
          isWin = myPoints > oppPoints;
        }
      }

      const winCount = (characterStats.get(char)?.winCount || 0) + (isWin ? 1 : 0);

      // Update the aggregated stats for this character
      characterStats.set(char, {
        character: char,
        matchCount,
        winCount,
        winRate: winCount / matchCount,
      });
    }

    // Convert to array and sort by most-used character first
    const statsArray = Array.from(characterStats.values())
      .sort((a, b) => b.matchCount - a.matchCount);

    return NextResponse.json({
      playerId,
      playerName: characterUsages[0]?.player.name,
      playerNickname: characterUsages[0]?.player.nickname,
      totalMatches: characterUsages.length,
      characterStats: statsArray,
      mostUsedCharacter: statsArray[0]?.character || null,
      characterUsage: characterUsages,
    });
  } catch (error) {
    // Log error with structured metadata including the player ID for debugging
    logger.error("Failed to fetch character stats", {
      error,
      playerId: (await params).id,
    });
    return NextResponse.json(
      { error: "Failed to fetch character stats" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  try {
    const { id: playerId } = await params;

    const characterUsages = await prisma.matchCharacterUsage.findMany({
      where: { playerId },
      include: { player: true },
      orderBy: { createdAt: 'desc' },
    });

    const usagesByType = new Map<string, Array<typeof characterUsages[0]>>();
    for (const usage of characterUsages) {
      const type = usage.matchType;
      if (!usagesByType.has(type)) {
        usagesByType.set(type, []);
      }
      usagesByType.get(type)!.push(usage);
    }

    const matchMap = new Map<string, any>();

    for (const [matchType, usages] of usagesByType.entries()) {
      const matchIds = [...new Set(usages.map(u => u.matchId))];

      let matches: any[] = [];
      if (matchType === 'BM') {
        matches = await prisma.bMMatch.findMany({ where: { id: { in: matchIds } } });
      } else if (matchType === 'MR') {
        matches = await prisma.mRMatch.findMany({ where: { id: { in: matchIds } } });
      } else if (matchType === 'GP') {
        matches = await prisma.gPMatch.findMany({ where: { id: { in: matchIds } } });
      }

      for (const match of matches) {
        matchMap.set(match.id, { ...match, matchType });
      }
    }

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
          const bMMatch = match;
          const isPlayer1 = bMMatch.player1Id === playerId;
          const myScore = isPlayer1 ? bMMatch.score1 : bMMatch.score2;
          const oppScore = isPlayer1 ? bMMatch.score2 : bMMatch.score1;
          isWin = myScore > oppScore;
        } else if (usage.matchType === 'MR') {
          const mRMatch = match;
          const isPlayer1 = mRMatch.player1Id === playerId;
          const myScore = isPlayer1 ? mRMatch.score1 : mRMatch.score2;
          const oppScore = isPlayer1 ? mRMatch.score2 : mRMatch.score1;
          isWin = myScore > oppScore;
        } else if (usage.matchType === 'GP') {
          const gPMatch = match;
          const isPlayer1 = gPMatch.player1Id === playerId;
          const myPoints = isPlayer1 ? gPMatch.points1 : gPMatch.points2;
          const oppPoints = isPlayer1 ? gPMatch.points2 : gPMatch.points1;
          isWin = myPoints > oppPoints;
        }
      }

      const winCount = (characterStats.get(char)?.winCount || 0) + (isWin ? 1 : 0);

      characterStats.set(char, {
        character: char,
        matchCount,
        winCount,
        winRate: winCount / matchCount,
      });
    }

    const statsArray = Array.from(characterStats.values()).sort((a, b) => b.matchCount - a.matchCount);

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
    console.error("Failed to fetch character stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch character stats" },
      { status: 500 }
    );
  }
}

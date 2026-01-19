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

    const characterStats = new Map<string, {
      character: string;
      matchCount: number;
      winCount: number;
      winRate: number;
    }>();

    for (const usage of characterUsages) {
      const char = usage.character;
      const matchCount = (characterStats.get(char)?.matchCount || 0) + 1;
      const isWin = await checkMatchWin(usage.matchId, usage.matchType, usage.playerId);
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

async function checkMatchWin(matchId: string, matchType: string, playerId: string): Promise<boolean> {
  try {
    if (matchType === 'BM') {
      const match = await prisma.bMMatch.findUnique({
        where: { id: matchId },
        select: { score1: true, score2: true, player1Id: true, player2Id: true },
      });
      if (!match) return false;
      const isPlayer1 = match.player1Id === playerId;
      const myScore = isPlayer1 ? match.score1 : match.score2;
      const oppScore = isPlayer1 ? match.score2 : match.score1;
      return myScore > oppScore;
    } else if (matchType === 'MR') {
      const match = await prisma.mRMatch.findUnique({
        where: { id: matchId },
        select: { score1: true, score2: true, player1Id: true, player2Id: true },
      });
      if (!match) return false;
      const isPlayer1 = match.player1Id === playerId;
      const myScore = isPlayer1 ? match.score1 : match.score2;
      const oppScore = isPlayer1 ? match.score2 : match.score1;
      return myScore > oppScore;
    } else if (matchType === 'GP') {
      const match = await prisma.gPMatch.findUnique({
        where: { id: matchId },
        select: { points1: true, points2: true, player1Id: true, player2Id: true },
      });
      if (!match) return false;
      const isPlayer1 = match.player1Id === playerId;
      const myPoints = isPlayer1 ? match.points1 : match.points2;
      const oppPoints = isPlayer1 ? match.points2 : match.points1;
      return myPoints > oppPoints;
    }
    return false;
  } catch {
    return false;
  }
}

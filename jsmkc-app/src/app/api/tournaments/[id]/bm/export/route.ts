import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createCSV } from "@/lib/excel";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, date: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const qualifications = await prisma.bMQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [
        { score: 'desc' },
        { points: 'desc' },
      ],
    });

    const matches = await prisma.bMMatch.findMany({
      where: { tournamentId },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: 'asc' },
    });

    const bom = '\uFEFF';
    let csvContent = bom;

    const qualificationHeaders = ['Rank', 'Player Name', 'Nickname', 'Matches', 'Wins', 'Ties', 'Losses', 'Win Rounds', 'Loss Rounds', 'Points', 'Score'];
    const qualificationData = qualifications.map((q, index) => [
      String(index + 1),
      q.player.name,
      q.player.nickname,
      String(q.mp),
      String(q.wins),
      String(q.ties),
      String(q.losses),
      String(q.winRounds),
      String(q.lossRounds),
      String(q.points),
      String(q.score),
    ]);

    csvContent += 'QUALIFICATIONS\n';
    csvContent += createCSV(qualificationHeaders, qualificationData);

    const matchHeaders = ['Match #', 'Stage', 'Player 1', 'Player 2', 'Score 1', 'Score 2', 'Completed'];
    const matchData = matches.map((m) => [
      String(m.matchNumber),
      m.stage,
      `${m.player1.name} (${m.player1.nickname})`,
      `${m.player2.name} (${m.player2.nickname})`,
      String(m.score1),
      String(m.score2),
      m.completed ? 'Yes' : 'No',
    ]);

    csvContent += '\nMATCHES\n';
    csvContent += createCSV(matchHeaders, matchData);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const csvFilename = `${tournament.name}_BM_${timestamp}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to export tournament:", error);
    return NextResponse.json({ error: "Failed to export tournament" }, { status: 500 });
  }
}

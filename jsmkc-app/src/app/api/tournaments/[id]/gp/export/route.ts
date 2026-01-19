import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createWorkbook, downloadWorkbook, downloadCSV, getExportFormat } from "@/lib/excel";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;
    const { searchParams } = new URL(request.url);
    const format = getExportFormat(searchParams.get('format'));

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, date: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const qualifications = await prisma.gPQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [
        { score: 'desc' },
        { points: 'desc' },
      ],
    });

    const matches = await prisma.gPMatch.findMany({
      where: { tournamentId },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: 'asc' },
    });

    const qualificationHeaders = ['Rank', 'Player Name', 'Nickname', 'Matches', 'Wins', 'Ties', 'Losses', 'Driver Points', 'Score'];
    const qualificationData = qualifications.map((q, index) => [
      index + 1,
      q.player.name,
      q.player.nickname,
      q.mp,
      q.wins,
      q.ties,
      q.losses,
      q.points,
      q.score,
    ]);

    const matchHeaders = ['Match #', 'Stage', 'Cup', 'Player 1', 'Player 2', 'Points 1', 'Points 2', 'Completed'];
    const matchData = matches.map((m) => [
      m.matchNumber,
      m.stage,
      m.cup || '-',
      `${m.player1.name} (${m.player1.nickname})`,
      `${m.player2.name} (${m.player2.nickname})`,
      m.points1,
      m.points2,
      m.completed ? 'Yes' : 'No',
    ]);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    if (format === 'csv') {
      const csvFilename = `${tournament.name}_GP_${timestamp}.csv`;
      downloadCSV(qualificationHeaders, qualificationData, csvFilename);
      return NextResponse.json({ success: true, message: 'CSV export initiated' });
    }

    const workbook = createWorkbook([
      {
        name: 'Qualifications',
        headers: qualificationHeaders,
        data: qualificationData,
      },
      {
        name: 'Matches',
        headers: matchHeaders,
        data: matchData,
      },
    ]);

    const xlsxFilename = `${tournament.name}_GP_${timestamp}.xlsx`;
    downloadWorkbook(workbook, xlsxFilename);

    return NextResponse.json({ success: true, message: 'Excel export initiated' });
  } catch (error) {
    console.error("Failed to export tournament:", error);
    return NextResponse.json({ error: "Failed to export tournament" }, { status: 500 });
  }
}

/**
 * Grand Prix Data Export API Route
 *
 * Exports GP qualification standings and match data as CSV.
 * Includes UTF-8 BOM for proper Excel encoding.
 *
 * CSV contains two sections:
 * 1. QUALIFICATIONS: Rankings with driver points and match scores
 * 2. MATCHES: All matches with cup, driver points, and completion status
 *
 * - GET: Download CSV export
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createCSV } from "@/lib/excel";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/gp/export
 *
 * Generate and download a CSV file with GP data.
 * Includes qualification standings and match details.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('gp-export-api');
  const { id: tournamentId } = await params;
  try {
    /* Fetch tournament name for the filename */
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, date: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    /* Fetch qualification standings sorted by score and driver points */
    const qualifications = await prisma.gPQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [
        { score: 'desc' },
        { points: 'desc' },
      ],
    });

    /* Fetch all matches with player details */
    const matches = await prisma.gPMatch.findMany({
      where: { tournamentId },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: 'asc' },
    });

    /* UTF-8 BOM ensures proper character encoding in Excel */
    const bom = '\uFEFF';
    let csvContent = bom;

    /* Section 1: Qualification standings with driver points column */
    const qualificationHeaders = ['Rank', 'Player Name', 'Nickname', 'Matches', 'Wins', 'Ties', 'Losses', 'Driver Points', 'Score'];
    const qualificationData = qualifications.map((q, index) => [
      String(index + 1),
      q.player.name,
      q.player.nickname,
      String(q.mp),
      String(q.wins),
      String(q.ties),
      String(q.losses),
      String(q.points),
      String(q.score),
    ]);

    csvContent += 'QUALIFICATIONS\n';
    csvContent += createCSV(qualificationHeaders, qualificationData);

    /* Section 2: Match results with cup and points data */
    const matchHeaders = ['Match #', 'Stage', 'Cup', 'Player 1', 'Player 2', 'Points 1', 'Points 2', 'Completed'];
    const matchData = matches.map((m) => [
      String(m.matchNumber),
      m.stage,
      m.cup || '-',
      `${m.player1.name} (${m.player1.nickname})`,
      `${m.player2.name} (${m.player2.nickname})`,
      String(m.points1),
      String(m.points2),
      m.completed ? 'Yes' : 'No',
    ]);

    csvContent += '\nMATCHES\n';
    csvContent += createCSV(matchHeaders, matchData);

    /* Generate timestamp-based filename */
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const csvFilename = `${tournament.name}_GP_${timestamp}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename}"`,
      },
    });
  } catch (error) {
    logger.error("Failed to export tournament", { error, tournamentId });
    return NextResponse.json({ error: "Failed to export tournament" }, { status: 500 });
  }
}

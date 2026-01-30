/**
 * Match Race CSV Export API Route
 *
 * Exports MR tournament data as CSV with UTF-8 BOM for
 * proper character encoding in spreadsheet applications.
 * Includes both qualification standings and match results.
 *
 * The export is structured in sections:
 * 1. QUALIFICATIONS: Player standings with all statistics
 * 2. MATCHES: Individual match results with scores
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createCSV } from "@/lib/excel";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/mr/export
 *
 * Generate and download a CSV export of all MR tournament data.
 * Returns a file download response with Content-Disposition header.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('mr-export-api');
  const { id: tournamentId } = await params;
  try {
    /* Verify tournament exists */
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, date: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    /* Fetch qualification standings sorted by score and point differential */
    const qualifications = await prisma.mRQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [
        { score: 'desc' },
        { points: 'desc' },
      ],
    });

    /* Fetch all matches (both qualification and finals) with player details */
    const matches = await prisma.mRMatch.findMany({
      where: { tournamentId },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: 'asc' },
    });

    /* Build CSV content with UTF-8 BOM for Excel compatibility */
    const bom = '\uFEFF';
    let csvContent = bom;

    /* Section 1: Qualification standings */
    const qualificationHeaders = ['Rank', 'Player Name', 'Nickname', 'Matches', 'Wins', 'Ties', 'Losses', 'Points', 'Score'];
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

    /* Section 2: Match results */
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

    /* Generate filename with tournament name and timestamp */
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const csvFilename = `${tournament.name}_MR_${timestamp}.csv`;

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

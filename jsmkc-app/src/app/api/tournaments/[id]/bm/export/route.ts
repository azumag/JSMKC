/**
 * Battle Mode Export API Route
 *
 * Exports all Battle Mode tournament data (qualifications and matches) as a CSV file.
 * The CSV is UTF-8 encoded with BOM for proper Excel compatibility with Japanese characters.
 *
 * The export includes two sections:
 * 1. QUALIFICATIONS: Player standings with full stats (rank, wins, losses, points, etc.)
 * 2. MATCHES: All matches with scores and completion status
 *
 * The filename includes the tournament name and timestamp for uniqueness.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createCSV } from "@/lib/excel";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/bm/export
 *
 * Generate and download a CSV export of all BM tournament data.
 * Returns a file download response with Content-Disposition header.
 *
 * The CSV contains:
 * - Qualification standings sorted by score descending
 * - All matches (qualification + finals) sorted by match number
 *
 * @param request - Standard Request object
 * @param params - Route parameters containing tournament ID
 * @returns CSV file download response
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Logger must be created inside the function for proper test mocking */
  const logger = createLogger('bm-export-api');
  const { id: tournamentId } = await params;

  try {
    /* Verify tournament exists before proceeding with export */
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, date: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    /* Fetch qualification standings sorted by score for ranking display */
    const qualifications = await prisma.bMQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [
        { score: 'desc' },
        { points: 'desc' },
      ],
    });

    /* Fetch all matches (both qualification and finals) for complete export */
    const matches = await prisma.bMMatch.findMany({
      where: { tournamentId },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: 'asc' },
    });

    /*
     * UTF-8 BOM (Byte Order Mark) is prepended to ensure Excel
     * correctly detects the encoding for Japanese characters.
     */
    const bom = '\uFEFF';
    let csvContent = bom;

    /* Build qualification standings section */
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

    /* Build matches section with all tournament matches */
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

    /* Generate a unique filename with tournament name and timestamp */
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const csvFilename = `${tournament.name}_BM_${timestamp}.csv`;

    /* Return the CSV as a downloadable file attachment */
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

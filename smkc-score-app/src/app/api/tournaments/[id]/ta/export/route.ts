/**
 * TA Export API Route
 *
 * Exports Time Attack tournament data as a CSV file for external analysis
 * or record-keeping. The CSV includes all entries with rankings, player info,
 * times, lives, and elimination status.
 *
 * The export includes a UTF-8 BOM marker for proper encoding in Excel
 * and other spreadsheet applications that may not default to UTF-8.
 *
 * CRITICAL: Logger is created INSIDE the handler function (not at module level)
 * to ensure proper test mocking per the project's mock architecture pattern.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createCSV, formatTime } from "@/lib/excel";
import { createLogger } from "@/lib/logger";

/**
 * GET /api/tournaments/[id]/ta/export
 *
 * Export TA entries as a CSV file download.
 *
 * Response:
 * - Content-Type: text/csv with UTF-8 charset
 * - Content-Disposition: attachment with tournament-specific filename
 * - Body: CSV data with BOM marker, headers, and entry rows
 *
 * CSV columns: Rank, Player Name, Nickname, Total Time (ms), Total Time, Lives, Eliminated
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('ta-export-api');
  const { id: tournamentId } = await params;
  try {

    // Fetch tournament name and date for the filename
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, date: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Fetch all entries ordered by rank for export
    const entries = await prisma.tTEntry.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: { rank: 'asc' },
    });

    // Define CSV column headers
    const entryHeaders = ['Rank', 'Player Name', 'Nickname', 'Total Time (ms)', 'Total Time', 'Lives', 'Eliminated'];

    // Map entries to CSV row data
    const entryData = entries.map((e) => [
      e.rank || '-',
      e.player.name,
      e.player.nickname,
      String(e.totalTime || 0),
      e.totalTime ? formatTime(e.totalTime) : '-',
      String(e.lives),
      e.eliminated ? 'Yes' : 'No',
    ]);

    // Add UTF-8 BOM marker for proper encoding in Excel/spreadsheet apps
    const bom = '\uFEFF';
    const csvContent = bom + createCSV(entryHeaders, entryData);

    // Generate timestamp-based filename for uniqueness
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const csvFilename = `${tournament.name}_TA_${timestamp}.csv`;

    // Return CSV as downloadable attachment
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename}"`,
      },
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to export tournament", { error, tournamentId });
    return NextResponse.json({ error: "Failed to export tournament" }, { status: 500 });
  }
}

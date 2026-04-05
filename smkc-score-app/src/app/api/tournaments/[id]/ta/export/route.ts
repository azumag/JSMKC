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
import { createErrorResponse } from "@/lib/error-handling";
import { resolveTournamentId } from "@/lib/tournament-identifier";
import { COURSES } from "@/lib/constants";

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
 * CSV columns: Rank, Player Name, Nickname, Total Time (ms), Total Time, Qualification Points,
 *              Lives, Eliminated, then per-course columns ({CourseAbbr} Time, {CourseAbbr} Points)
 *              for all 20 courses in COURSES order.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking
  const logger = createLogger('ta-export-api');
  const { id } = await params;
  const tournamentId = await resolveTournamentId(id);
  try {

    // Fetch tournament name and date for the filename
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, date: true },
    });

    if (!tournament) {
      return createErrorResponse('Tournament not found', 404, 'NOT_FOUND');
    }

    // Fetch all entries ordered by rank for export
    const entries = await prisma.tTEntry.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: { rank: 'asc' },
    });

    // Define CSV column headers: summary columns + per-course time and points
    // Per-course columns follow the canonical COURSES order (20 courses, 2 columns each)
    const entryHeaders = [
      'Rank', 'Player Name', 'Nickname', 'Total Time (ms)', 'Total Time', 'Qualification Points', 'Lives', 'Eliminated',
      ...COURSES.flatMap(c => [`${c} Time`, `${c} Points`]),
    ];

    // Map entries to CSV row data
    const entryData = entries.map((e) => {
      // Cast JSON fields to typed records; fall back to empty objects when null
      const times = (e.times as Record<string, string> | null) ?? {};
      const courseScores = (e.courseScores as Record<string, number> | null) ?? {};

      return [
        // Use != null (not ||) to correctly handle rank===0 edge case
        e.rank != null ? e.rank : '-',
        e.player.name,
        e.player.nickname,
        // Use ?? to handle totalTime===0 correctly (valid zero-duration value)
        String(e.totalTime ?? 0),
        e.totalTime != null ? formatTime(e.totalTime) : '-',
        // qualificationPoints may be null before any times are entered
        e.qualificationPoints != null ? String(e.qualificationPoints) : '-',
        String(e.lives),
        e.eliminated ? 'Yes' : 'No',
        // Per-course columns: time string as-is (already formatted), points as string
        // Missing courses (player hasn't run that course yet) use '-'
        ...COURSES.flatMap(c => [
          times[c] ?? '-',
          courseScores[c] != null ? String(courseScores[c]) : '-',
        ]),
      ];
    });

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
        // filename* uses RFC 5987 percent-encoding (safe for all characters).
        // filename= fallback strips embedded quotes to avoid header syntax breakage.
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(csvFilename)}; filename="${csvFilename.replace(/"/g, "'")}"`,
      },
    });
  } catch (error) {
    // Use structured logging for error tracking and debugging
    logger.error("Failed to export tournament", { error, tournamentId });
    return createErrorResponse('Failed to export tournament', 500, 'INTERNAL_ERROR');
  }
}

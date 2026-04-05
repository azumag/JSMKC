/**
 * TA Export API Route
 *
 * Exports Time Attack tournament data as a CSV file with two sections:
 *
 * [SECTION 1 - QUALIFICATION]
 * Per-player summary: rank, total time, qualification points, lives,
 * elimination status, and individual course times/points for all 20 courses.
 *
 * [SECTION 2 - KNOCKOUT PHASES]
 * Per-round detail from TTPhaseRound: one row per player per round,
 * showing phase, round number, course, time, retry flag, whether the
 * player was eliminated that round, and whether lives reset after the round.
 * Omitted entirely when no phase rounds exist (tournament still in qualification).
 *
 * The export includes a UTF-8 BOM marker for proper encoding in Excel
 * and other spreadsheet applications that may not default to UTF-8.
 *
 * CRITICAL: Logger is created INSIDE the handler function (not at module level)
 * to ensure proper test mocking per the project's mock architecture pattern.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createCSV, csvRow, formatTime } from "@/lib/excel";
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
 * - Body: CSV data with BOM marker, two sections separated by a blank line
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

    // ── SECTION 1: Qualification ─────────────────────────────────────────────

    // Fetch qualification-stage entries only, ordered by rank for export.
    // Finals entries (phase1/phase2/phase3) share the same TTEntry table but
    // have no courseScores/qualificationPoints, so they must be excluded.
    const entries = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: 'qualification' },
      include: { player: true },
      orderBy: { rank: 'asc' },
    });

    // Define CSV column headers: summary columns + per-course time and points
    // Per-course columns follow the canonical COURSES order (20 courses, 2 columns each)
    const qualHeaders = [
      'Rank', 'Player Name', 'Nickname', 'Total Time (ms)', 'Total Time', 'Qualification Points', 'Lives', 'Eliminated',
      ...COURSES.flatMap(c => [`${c} Time`, `${c} Points`]),
    ];

    // Map entries to CSV row data
    const qualData = entries.map((e) => {
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

    // createCSV already prepends the UTF-8 BOM internally; do not add it again
    let csvContent = createCSV(qualHeaders, qualData);

    // ── SECTION 2: Knockout Phases ───────────────────────────────────────────

    // Fetch all phase rounds ordered by phase then round number
    const phaseRounds = await prisma.tTPhaseRound.findMany({
      where: { tournamentId },
      orderBy: [{ phase: 'asc' }, { roundNumber: 'asc' }],
    });

    if (phaseRounds.length > 0) {
      // Build a playerId → player lookup from all phase entries to resolve names.
      // We need all stages here (not just qualification) to cover phase participants.
      const phaseEntries = await prisma.tTEntry.findMany({
        where: { tournamentId, stage: { in: ['phase1', 'phase2', 'phase3'] } },
        include: { player: true },
      });
      const playerMap = new Map(phaseEntries.map(e => [e.playerId, e.player]));

      // Phase round columns: all phases use the same headers.
      // "Lives Reset" marks rounds where lives were reset to 3 (phase3 only).
      const phaseHeaders = [
        'Phase', 'Round', 'Course',
        'Player Name', 'Nickname',
        'Time (ms)', 'Time', 'Retry',
        'Eliminated This Round', 'Lives Reset After Round',
      ];

      // Blank line + section label + header row
      csvContent += '\r\n';
      csvContent += csvRow(['=== KNOCKOUT PHASES ===']);
      csvContent += csvRow(phaseHeaders);

      for (const round of phaseRounds) {
        const results = round.results as Array<{ playerId: string; timeMs: number; isRetry: boolean }>;
        const eliminatedIds = new Set((round.eliminatedIds as string[] | null) ?? []);

        for (const result of results) {
          const player = playerMap.get(result.playerId);
          csvContent += csvRow([
            round.phase,
            round.roundNumber,
            round.course,
            player?.name ?? result.playerId,
            player?.nickname ?? '-',
            result.timeMs,
            formatTime(result.timeMs),
            result.isRetry ? 'Yes' : 'No',
            eliminatedIds.has(result.playerId) ? 'Yes' : 'No',
            round.livesReset ? 'Yes' : 'No',
          ]);
        }
      }
    }

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

/**
 * TA Knockout Phases Export API Route
 *
 * Exports Time Attack knockout phase data as a CSV file.
 * One row per player per round, covering all phase rounds
 * (phase1, phase2, phase3) in chronological order.
 *
 * Columns: Phase, Round, Course, Player Name, Nickname,
 *          Time (ms), Time, Retry, Eliminated This Round, Lives Reset After Round
 *
 * Returns 404 when no phase rounds exist (tournament still in qualification).
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

/**
 * GET /api/tournaments/[id]/ta/export/phases
 *
 * Export TA knockout phase rounds as a CSV file download.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const logger = createLogger('ta-phases-export-api');
  const { id } = await params;
  const tournamentId = await resolveTournamentId(id);
  try {

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, date: true },
    });

    if (!tournament) {
      return createErrorResponse('Tournament not found', 404, 'NOT_FOUND');
    }

    // Fetch all phase rounds ordered by phase then round number
    const phaseRounds = await prisma.tTPhaseRound.findMany({
      where: { tournamentId },
      orderBy: [{ phase: 'asc' }, { roundNumber: 'asc' }],
    });

    if (phaseRounds.length === 0) {
      return createErrorResponse('No knockout phase data found', 404, 'NOT_FOUND');
    }

    // Build playerId → player lookup from all phase entries to resolve names
    const phaseEntries = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: { in: ['phase1', 'phase2', 'phase3'] } },
      include: { player: true },
    });
    const playerMap = new Map(phaseEntries.map(e => [e.playerId, e.player]));

    const headers = [
      'Phase', 'Round', 'Course',
      'Player Name', 'Nickname',
      'Time (ms)', 'Time', 'Retry',
      'Eliminated This Round', 'Lives Reset After Round',
    ];

    // Build rows: one per player per round, in round order
    const rows: unknown[][] = [];
    for (const round of phaseRounds) {
      const results = round.results as Array<{ playerId: string; timeMs: number; isRetry: boolean }>;
      const eliminatedIds = new Set((round.eliminatedIds as string[] | null) ?? []);

      for (const result of results) {
        const player = playerMap.get(result.playerId);
        rows.push([
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

    // createCSV already prepends the UTF-8 BOM internally; do not add it again
    const csvContent = createCSV(headers, rows);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const csvFilename = `${tournament.name}_TA_Knockout_${timestamp}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(csvFilename)}; filename="${csvFilename.replace(/"/g, "'")}"`,
      },
    });
  } catch (error) {
    logger.error("Failed to export knockout phases", { error, tournamentId });
    return createErrorResponse('Failed to export knockout phases', 500, 'INTERNAL_ERROR');
  }
}

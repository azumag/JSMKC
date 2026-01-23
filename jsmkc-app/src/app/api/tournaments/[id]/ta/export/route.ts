import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createCSV, formatTime } from "@/lib/excel";
import { createLogger } from "@/lib/logger";

// Initialize logger for structured logging
const logger = createLogger('ta-export-api');

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  try {

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, date: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const entries = await prisma.tTEntry.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: { rank: 'asc' },
    });

    const entryHeaders = ['Rank', 'Player Name', 'Nickname', 'Total Time (ms)', 'Total Time', 'Lives', 'Eliminated'];
    const entryData = entries.map((e) => [
      e.rank || '-',
      e.player.name,
      e.player.nickname,
      String(e.totalTime || 0),
      e.totalTime ? formatTime(e.totalTime) : '-',
      String(e.lives),
      e.eliminated ? 'Yes' : 'No',
    ]);

    const bom = '\uFEFF';
    const csvContent = bom + createCSV(entryHeaders, entryData);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const csvFilename = `${tournament.name}_TA_${timestamp}.csv`;

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

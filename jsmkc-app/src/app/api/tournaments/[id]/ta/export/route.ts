import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createWorkbook, downloadWorkbook, downloadCSV, getExportFormat, formatTime } from "@/lib/excel";

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
      e.totalTime || 0,
      e.totalTime ? formatTime(e.totalTime) : '-',
      e.lives,
      e.eliminated ? 'Yes' : 'No',
    ]);

    // Get all course names
    const courseTimes = new Map<string, (string | number)[]>();
    entries.forEach((entry) => {
      if (entry.times && typeof entry.times === 'object') {
        const times = entry.times as Record<string, number>;
        Object.keys(times).forEach((course) => {
          if (!courseTimes.has(course)) {
            courseTimes.set(course, []);
          }
          courseTimes.get(course)!.push(times[course]);
        });
      }
    });

    const courseHeaders = ['Rank', 'Player Name', 'Nickname', ...Array.from(courseTimes.keys()).sort()];
    const courseData = entries.map((e) => {
      const row: (string | number)[] = [
        e.rank || '-',
        e.player.name,
        e.player.nickname,
      ];
      
      if (e.times && typeof e.times === 'object') {
        const times = e.times as Record<string, number>;
        courseHeaders.slice(3).forEach((course) => {
          const courseKey = course as string;
          row.push(times[courseKey] ? formatTime(times[courseKey]) : '-');
        });
      } else {
        courseHeaders.slice(3).forEach(() => row.push('-'));
      }
      
      return row;
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    if (format === 'csv') {
      const csvFilename = `${tournament.name}_TA_${timestamp}.csv`;
      downloadCSV(entryHeaders, entryData, csvFilename);
      return NextResponse.json({ success: true, message: 'CSV export initiated' });
    }

    const workbook = createWorkbook([
      {
        name: 'Qualifications',
        headers: entryHeaders,
        data: entryData,
      },
      {
        name: 'Course Times',
        headers: courseHeaders,
        data: courseData,
      },
    ]);

    const xlsxFilename = `${tournament.name}_TA_${timestamp}.xlsx`;
    downloadWorkbook(workbook, xlsxFilename);

    return NextResponse.json({ success: true, message: 'Excel export initiated' });
  } catch (error) {
    console.error("Failed to export tournament:", error);
    return NextResponse.json({ error: "Failed to export tournament" }, { status: 500 });
  }
}

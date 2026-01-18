import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";
import { formatDate } from "@/lib/excel";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const qualifications = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: "qualification" },
      include: { player: true },
      orderBy: { totalTime: "asc" },
    });

    const finals = await prisma.tTEntry.findMany({
      where: { tournamentId, stage: "finals" },
      include: { player: true },
      orderBy: { rank: "asc" },
    });

    const workbook = XLSX.utils.book_new();

    const summaryData = [
      ["Tournament Name", tournament.name],
      ["Date", formatDate(new Date(tournament.date))],
      ["Status", tournament.status],
      ["Total Participants", qualifications.length],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet["!cols"] = [{ wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    if (qualifications.length > 0) {
      const qualHeaders = ["Rank", "Player", "Nickname", "Total Time (ms)", "Total Time"];
      const qualData = qualifications.map((entry, index) => {
        const minutes = Math.floor((entry.totalTime || 0) / 60000);
        const seconds = Math.floor(((entry.totalTime || 0) % 60000) / 1000);
        const centiseconds = Math.floor(((entry.totalTime || 0) % 1000) / 10);
        const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;

        return [
          index + 1,
          entry.player.name,
          entry.player.nickname,
          entry.totalTime || 0,
          formattedTime,
        ];
      });

      const qualSheet = XLSX.utils.aoa_to_sheet([qualHeaders, ...qualData]);
      qualSheet["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      qualSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, qualSheet, "Qualifications");

      const courseTimesHeaders = ["Player", "Nickname"];
      const courses = ["MC1", "DP1", "GV1", "BC1", "MC2", "DP2", "GV2", "BC2", "MC3", "DP3", "GV3", "BC3", "CI1", "CI2", "RR", "VL1", "VL2", "KD", "MC4", "KB1"];
      courseTimesHeaders.push(...courses);

      const courseTimesData = qualifications.map((entry) => {
        const times = entry.times as Record<string, string> || {};
        const row = [
          entry.player.name,
          entry.player.nickname,
          ...courses.map((course) => times[course] || "-"),
        ];
        return row;
      });

      const courseTimesSheet = XLSX.utils.aoa_to_sheet([courseTimesHeaders, ...courseTimesData]);
      courseTimesSheet["!cols"] = [{ wch: 20 }, { wch: 15 }, ...courses.map(() => ({ wch: 10 }))];
      courseTimesSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, courseTimesSheet, "Course Times");
    }

    if (finals.length > 0) {
      const finalsHeaders = ["Rank", "Player", "Nickname", "Lives", "Eliminated", "Total Time (ms)"];
      const finalsData = finals.map((entry) => {
        const totalTime = entry.totalTime || 0;

        return [
          entry.rank || "-",
          entry.player.name,
          entry.player.nickname,
          entry.lives,
          entry.eliminated ? "Yes" : "No",
          totalTime > 0 ? totalTime : "-",
        ];
      });

      const finalsSheet = XLSX.utils.aoa_to_sheet([finalsHeaders, ...finalsData]);
      finalsSheet["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 15 }, { wch: 6 }, { wch: 10 }, { wch: 15 }];
      finalsSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, finalsSheet, "Finals");
    }

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const filename = `${tournament.name.replace(/[^a-zA-Z0-9]/g, "_")}-ta-${formatDate(new Date(tournament.date))}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to export time trial:", error);
    return NextResponse.json(
      { error: "Failed to export time trial data" },
      { status: 500 }
    );
  }
}

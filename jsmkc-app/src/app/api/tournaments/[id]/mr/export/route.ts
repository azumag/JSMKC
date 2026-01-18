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

    const qualifications = await prisma.mRQualification.findMany({
      where: { tournamentId },
      include: { player: true },
      orderBy: [{ group: "asc" }, { score: "desc" }, { points: "desc" }],
    });

    const qualMatches = await prisma.mRMatch.findMany({
      where: { tournamentId, stage: "qualification" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    const finalsMatches = await prisma.mRMatch.findMany({
      where: { tournamentId, stage: "finals" },
      include: { player1: true, player2: true },
      orderBy: { matchNumber: "asc" },
    });

    const workbook = XLSX.utils.book_new();

    const summaryData = [
      ["Tournament Name", tournament.name],
      ["Date", formatDate(new Date(tournament.date))],
      ["Status", tournament.status],
      ["Total Participants", qualifications.length],
      ["Qualification Matches", qualMatches.length],
      ["Finals Matches", finalsMatches.length],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet["!cols"] = [{ wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    if (qualifications.length > 0) {
      const groups = [...new Set(qualifications.map((q) => q.group))].sort();

      groups.forEach((group) => {
        const groupQualifications = qualifications
          .filter((q) => q.group === group)
          .sort((a, b) => b.score - a.score || b.points - a.points);

        const qualHeaders = [
          "Rank",
          "Player",
          "Nickname",
          "Matches Played",
          "Wins",
          "Ties",
          "Losses",
          "Round Diff (+/-)",
          "Points",
        ];

        const qualData = groupQualifications.map((q, index) => [
          index + 1,
          q.player.name,
          q.player.nickname,
          q.mp,
          q.wins,
          q.ties,
          q.losses,
          q.points > 0 ? `+${q.points}` : q.points,
          q.score,
        ]);

        const qualSheet = XLSX.utils.aoa_to_sheet([qualHeaders, ...qualData]);
        qualSheet["!cols"] = [
          { wch: 6 },
          { wch: 20 },
          { wch: 15 },
          { wch: 13 },
          { wch: 5 },
          { wch: 5 },
          { wch: 6 },
          { wch: 15 },
          { wch: 7 },
        ];
        qualSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

        const sheetName = group === "A" ? "Qual Group A" : group === "B" ? "Qual Group B" : `Qual Group ${group}`;
        XLSX.utils.book_append_sheet(workbook, qualSheet, sheetName);
      });
    }

    if (qualMatches.length > 0) {
      const matchHeaders = [
        "Match #",
        "Player 1",
        "Nickname 1",
        "Player 2",
        "Nickname 2",
        "Score",
        "Completed",
        "Rounds",
      ];

      const matchData = qualMatches.map((match) => {
        const score = match.completed
          ? `${match.score1} - ${match.score2}`
          : "Not started";

        let roundsInfo = "-";
        if (match.rounds && Array.isArray(match.rounds)) {
          roundsInfo = match.rounds
            .map((r) => {
              if (typeof r === "object" && r !== null && "course" in r && "winner" in r) {
                return `Course ${(r as { course: string; winner: number }).course}: P${(r as { course: string; winner: number }).winner} wins`;
              }
              return "";
            })
            .filter(Boolean)
            .join(", ");
        }

        return [
          match.matchNumber,
          match.player1.name,
          match.player1.nickname,
          match.player2.name,
          match.player2.nickname,
          score,
          match.completed ? "Yes" : "No",
          roundsInfo,
        ];
      });

      const matchSheet = XLSX.utils.aoa_to_sheet([matchHeaders, ...matchData]);
      matchSheet["!cols"] = [
        { wch: 8 },
        { wch: 20 },
        { wch: 15 },
        { wch: 20 },
        { wch: 15 },
        { wch: 10 },
        { wch: 10 },
        { wch: 40 },
      ];
      matchSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, matchSheet, "Qual Matches");
    }

    if (finalsMatches.length > 0) {
      const finalsHeaders = [
        "Match #",
        "Round",
        "TV #",
        "Player 1",
        "Nickname 1",
        "Player 2",
        "Nickname 2",
        "Score",
        "Completed",
        "Rounds",
      ];

      const finalsData = finalsMatches.map((match) => {
        const score = match.completed
          ? `${match.score1} - ${match.score2}`
          : "Not started";

        let roundsInfo = "-";
        if (match.rounds && Array.isArray(match.rounds)) {
          roundsInfo = match.rounds
            .map((r) => {
              if (typeof r === "object" && r !== null && "course" in r && "winner" in r) {
                return `Course ${(r as { course: string; winner: number }).course}: P${(r as { course: string; winner: number }).winner} wins`;
              }
              return "";
            })
            .filter(Boolean)
            .join(", ");
        }

        return [
          match.matchNumber,
          match.round || "-",
          match.tvNumber || "-",
          match.player1.name,
          match.player1.nickname,
          match.player2.name,
          match.player2.nickname,
          score,
          match.completed ? "Yes" : "No",
          roundsInfo,
        ];
      });

      const finalsSheet = XLSX.utils.aoa_to_sheet([finalsHeaders, ...finalsData]);
      finalsSheet["!cols"] = [
        { wch: 8 },
        { wch: 15 },
        { wch: 6 },
        { wch: 20 },
        { wch: 15 },
        { wch: 20 },
        { wch: 15 },
        { wch: 10 },
        { wch: 10 },
        { wch: 40 },
      ];
      finalsSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, finalsSheet, "Finals Matches");
    }

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const filename = `${tournament.name.replace(/[^a-zA-Z0-9]/g, "_")}-mr-${formatDate(new Date(tournament.date))}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to export match race:", error);
    return NextResponse.json(
      { error: "Failed to export match race data" },
      { status: 500 }
    );
  }
}

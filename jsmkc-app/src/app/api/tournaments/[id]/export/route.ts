import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";
import { formatDate, formatTime } from "@/lib/excel";

interface Player {
  id: string;
  name: string;
  nickname: string;
}

interface BMQualification {
  id: string;
  playerId: string;
  group: string;
  mp: number;
  wins: number;
  ties: number;
  losses: number;
  points: number;
  score: number;
  player: Player;
}

interface BMMatch {
  id: string;
  matchNumber: number;
  stage: string;
  round?: string | null;
  tvNumber?: number | null;
  score1: number;
  score2: number;
  completed: boolean;
  rounds?: unknown[] | null;
  player1: Player;
  player2: Player;
}

interface MRMatch {
  id: string;
  matchNumber: number;
  round?: string | null;
  score1: number;
  score2: number;
  completed: boolean;
  course?: string | null;
  status?: string | null;
  player1: Player;
  player2: Player;
}

interface GPMatch {
  id: string;
  matchNumber: number;
  score1: number;
  score2: number;
  completed: boolean;
  raceCount?: number | null;
  points1?: number | null;
  points2?: number | null;
  player1: Player;
  player2: Player;
}

interface TTEntry {
  id: string;
  time: number;
  course?: string | null;
  createdAt: Date;
  player: Player;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface TournamentData {
  id: string;
  name: string;
  date: Date;
  status: string;
  bmQualifications: BMQualification[];
  bmMatches: BMMatch[];
  mrMatches: MRMatch[];
  gpMatches: GPMatch[];
  ttEntries: TTEntry[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        bmQualifications: { include: { player: true } },
        bmMatches: { include: { player1: true, player2: true } },
        mrMatches: { include: { player1: true, player2: true } },
        gpMatches: { include: { player1: true, player2: true } },
        ttEntries: { include: { player: true } },
      },
    });

    if (!tournament) {
      return NextResponse.json({ success: false, error: "Tournament not found" }, { status: 404 });
    }

    const workbook = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      ["Tournament Name", tournament.name],
      ["Date", formatDate(new Date(tournament.date))],
      ["Status", tournament.status],
      ["", ""],
      ["Battle Mode", ""],
      ["BM Participants", tournament.bmQualifications.length],
      ["BM Qualification Matches", tournament.bmMatches.filter(m => m.stage === "qualification").length],
      ["BM Finals Matches", tournament.bmMatches.filter(m => m.stage === "finals").length],
      ["", ""],
      ["Match Race", ""],
      ["MR Matches", tournament.mrMatches.length],
      ["", ""],
      ["Grand Prix", ""],
      ["GP Matches", tournament.gpMatches.length],
      ["", ""],
      ["Time Attack", ""],
      ["TA Entries", tournament.ttEntries.length],
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet["!cols"] = [{ wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    // Battle Mode Sheet
    if (tournament.bmQualifications.length > 0) {
      const groups = [...new Set(tournament.bmQualifications.map((q) => q.group))].sort();
      
      groups.forEach((group) => {
        const groupQualifications = tournament.bmQualifications
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
          { wch: 6 }, { wch: 20 }, { wch: 15 }, { wch: 13 },
          { wch: 5 }, { wch: 5 }, { wch: 6 }, { wch: 15 }, { wch: 7 }
        ];
        qualSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

        const sheetName = group === "A" ? "BM Group A" : group === "B" ? "BM Group B" : `BM Group ${group}`;
        XLSX.utils.book_append_sheet(workbook, qualSheet, sheetName);
      });
    }

    // Battle Mode Matches
    if (tournament.bmMatches.length > 0) {
      const qualMatches = tournament.bmMatches.filter(m => m.stage === "qualification");
      const finalsMatches = tournament.bmMatches.filter(m => m.stage === "finals");

      if (qualMatches.length > 0) {
        const qualMatchHeaders = [
          "Match #", "Player 1", "Nickname 1", "Player 2", "Nickname 2",
          "Score", "Completed", "Rounds"
        ];

        const qualMatchData = qualMatches.map((match) => {
          const score = match.completed ? `${match.score1} - ${match.score2}` : "Not started";
          
          let roundsInfo = "-";
          if (match.rounds && Array.isArray(match.rounds)) {
            roundsInfo = match.rounds
              .map((r) => {
                if (typeof r === "object" && r !== null && "arena" in r && "winner" in r) {
                  return `Arena ${(r as { arena: string; winner: number }).arena}: P${(r as { arena: string; winner: number }).winner} wins`;
                }
                return "";
              })
              .filter(Boolean)
              .join(", ");
          }

          return [
            match.matchNumber, match.player1.name, match.player1.nickname,
            match.player2.name, match.player2.nickname, score,
            match.completed ? "Yes" : "No", roundsInfo
          ];
        });

        const qualMatchSheet = XLSX.utils.aoa_to_sheet([qualMatchHeaders, ...qualMatchData]);
        qualMatchSheet["!cols"] = [
          { wch: 8 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 15 },
          { wch: 10 }, { wch: 10 }, { wch: 40 }
        ];
        qualMatchSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
        XLSX.utils.book_append_sheet(workbook, qualMatchSheet, "BM Qual Matches");
      }

      if (finalsMatches.length > 0) {
        const finalsHeaders = [
          "Match #", "Round", "TV #", "Player 1", "Nickname 1",
          "Player 2", "Nickname 2", "Score", "Completed", "Rounds"
        ];

        const finalsData = finalsMatches.map((match) => {
          const score = match.completed ? `${match.score1} - ${match.score2}` : "Not started";
          
          let roundsInfo = "-";
          if (match.rounds && Array.isArray(match.rounds)) {
            roundsInfo = match.rounds
              .map((r) => {
                if (typeof r === "object" && r !== null && "arena" in r && "winner" in r) {
                  return `Arena ${(r as { arena: string; winner: number }).arena}: P${(r as { arena: string; winner: number }).winner} wins`;
                }
                return "";
              })
              .filter(Boolean)
              .join(", ");
          }

          return [
            match.matchNumber, match.round || "-", match.tvNumber || "-",
            match.player1.name, match.player1.nickname, match.player2.name,
            match.player2.nickname, score, match.completed ? "Yes" : "No", roundsInfo
          ];
        });

        const finalsSheet = XLSX.utils.aoa_to_sheet([finalsHeaders, ...finalsData]);
        finalsSheet["!cols"] = [
          { wch: 8 }, { wch: 15 }, { wch: 6 }, { wch: 20 }, { wch: 15 },
          { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 40 }
        ];
        finalsSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
        XLSX.utils.book_append_sheet(workbook, finalsSheet, "BM Finals");
      }
    }

    // Match Race Sheet
    if (tournament.mrMatches.length > 0) {
      const mrHeaders = [
        "Match #", "Stage", "Round", "Player 1", "Nickname 1", "Player 2", "Nickname 2",
        "Score", "Completed"
      ];

      const mrData = tournament.mrMatches.map((match) => {
        const score = match.completed ? `${match.score1} - ${match.score2}` : "Not started";
        
        return [
          match.matchNumber, match.stage || "-", match.round || "-", match.player1.name, match.player1.nickname,
          match.player2.name, match.player2.nickname, score, match.completed ? "Yes" : "No"
        ];
      });

      const mrSheet = XLSX.utils.aoa_to_sheet([mrHeaders, ...mrData]);
      mrSheet["!cols"] = [
        { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 15 },
        { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 10 }
      ];
      mrSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, mrSheet, "Match Race");
    }

    // Grand Prix Sheet
    if (tournament.gpMatches.length > 0) {
      const gpHeaders = [
        "Match #", "Stage", "Player 1", "Nickname 1", "Player 2", "Nickname 2",
        "Points P1", "Points P2", "Completed"
      ];

      const gpData = tournament.gpMatches.map((match) => {
        return [
          match.matchNumber, match.stage || "-", match.player1.name, match.player1.nickname,
          match.player2.name, match.player2.nickname, match.points1 || 0, match.points2 || 0,
          match.completed ? "Yes" : "No"
        ];
      });

      const gpSheet = XLSX.utils.aoa_to_sheet([gpHeaders, ...gpData]);
      gpSheet["!cols"] = [
        { wch: 8 }, { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 15 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }
      ];
      gpSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, gpSheet, "Grand Prix");
    }

    // Time Attack Sheet
    if (tournament.ttEntries.length > 0) {
      const taHeaders = [
        "Rank", "Player", "Nickname", "Stage", "Total Time", "Lives", "Date"
      ];

      const taData = tournament.ttEntries
        .filter(entry => entry.totalTime !== null) // Only entries with total time
        .sort((a, b) => (a.totalTime || 0) - (b.totalTime || 0))
        .map((entry, index) => [
          index + 1,
          entry.player.name,
          entry.player.nickname,
          entry.stage,
          formatTime(entry.totalTime || 0),
          entry.lives,
          formatDate(new Date(entry.createdAt))
        ]);

      const taSheet = XLSX.utils.aoa_to_sheet([taHeaders, ...taData]);
      taSheet["!cols"] = [
        { wch: 6 }, { wch: 20 }, { wch: 15 }, { wch: 10 },
        { wch: 15 }, { wch: 6 }, { wch: 12 }
      ];
      taSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, taSheet, "Time Attack");
    }

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const filename = `${tournament.name.replace(/[^a-zA-Z0-9]/g, "_")}-full-${formatDate(new Date(tournament.date))}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to export tournament:", error);
    return NextResponse.json(
      { success: false, error: "Failed to export tournament data" },
      { status: 500 }
    );
  }
}
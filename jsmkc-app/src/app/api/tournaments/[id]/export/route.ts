/**
 * Tournament Export API Route
 *
 * GET /api/tournaments/:id/export
 *
 * Exports all tournament data as a CSV file for offline analysis and
 * record-keeping. The export includes:
 *   - Tournament summary (name, date, status, participant counts)
 *   - BM qualification standings per group
 *   - BM qualification match results with round details
 *   - BM finals match results with round/TV information
 *   - MR (Match Race) match results
 *   - GP (Grand Prix) match results with driver points
 *   - TA (Time Attack) entries with times and rankings
 *
 * The CSV uses UTF-8 BOM encoding for proper display in Excel and
 * other spreadsheet applications, especially for Japanese characters.
 *
 * Access: Public (no authentication required)
 * Response: CSV file download
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { formatDate, formatTime } from "@/lib/excel";
import { createLogger } from "@/lib/logger";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('tournament-export-api');
  const { id: tournamentId } = await params;

  try {
    // Fetch tournament with ALL related data across all match types.
    // This is a heavy query but is acceptable for an export operation
    // that is called infrequently (typically once after a tournament ends).
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
      return NextResponse.json(
        { success: false, error: "Tournament not found" },
        { status: 404 }
      );
    }

    // UTF-8 BOM (Byte Order Mark) ensures Excel correctly interprets
    // the file as UTF-8, which is important for Japanese player names.
    const bom = '\uFEFF';
    let csvContent = bom;

    // ========================================
    // Section 1: Tournament Summary
    // ========================================
    csvContent += 'TOURNAMENT SUMMARY\n';
    const summaryHeaders = ['Field', 'Value'];
    const summaryData = [
      ['Tournament Name', tournament.name],
      ['Date', formatDate(new Date(tournament.date))],
      ['Status', tournament.status],
      ['', ''],
      ['Battle Mode', ''],
      ['BM Participants', String(tournament.bmQualifications.length)],
      ['BM Qualification Matches', String(tournament.bmMatches.filter(m => m.stage === "qualification").length)],
      ['BM Finals Matches', String(tournament.bmMatches.filter(m => m.stage === "finals").length)],
      ['', ''],
      ['Match Race', ''],
      ['MR Matches', String(tournament.mrMatches.length)],
      ['', ''],
      ['Grand Prix', ''],
      ['GP Matches', String(tournament.gpMatches.length)],
      ['', ''],
      ['Time Attack', ''],
      ['TA Entries', String(tournament.ttEntries.length)],
    ];
    csvContent += summaryHeaders.join(',') + '\n';
    csvContent += summaryData.map(row => row.join(',')).join('\n');

    // ========================================
    // Section 2: BM Qualification Standings
    // ========================================
    if (tournament.bmQualifications.length > 0) {
      // Get unique groups and sort alphabetically (A, B, C, ...)
      const groups = [...new Set(tournament.bmQualifications.map((q) => q.group))].sort();

      groups.forEach((group) => {
        // Sort players within each group by score (descending), then by round
        // differential (points) as tiebreaker
        const groupQualifications = tournament.bmQualifications
          .filter((q) => q.group === group)
          .sort((a, b) => b.score - a.score || b.points - a.points);

        const qualHeaders = [
          "Rank", "Player", "Nickname", "Matches Played", "Wins", "Ties",
          "Losses", "Round Diff (+/-)", "Points",
        ];

        const qualData = groupQualifications.map((q, index) => [
          String(index + 1),
          q.player.name,
          q.player.nickname,
          String(q.mp),
          String(q.wins),
          String(q.ties),
          String(q.losses),
          // Format round differential with + prefix for positive values
          q.points > 0 ? `+${q.points}` : String(q.points),
          String(q.score),
        ]);

        const sheetName = group === "A" ? "BM Group A" : group === "B" ? "BM Group B" : `BM Group ${group}`;
        csvContent += `\n${sheetName}\n`;
        csvContent += qualHeaders.join(',') + '\n';
        csvContent += qualData.map(row => row.join(',')).join('\n');
      });
    }

    // ========================================
    // Section 3: BM Match Results
    // ========================================
    if (tournament.bmMatches.length > 0) {
      const qualMatches = tournament.bmMatches.filter(m => m.stage === "qualification");
      const finalsMatches = tournament.bmMatches.filter(m => m.stage === "finals");

      // 3a: Qualification matches
      if (qualMatches.length > 0) {
        const qualMatchHeaders = [
          "Match #", "Player 1", "Nickname 1", "Player 2", "Nickname 2",
          "Score", "Completed", "Rounds"
        ];

        const qualMatchData = qualMatches.map((match) => {
          const score = match.completed ? `${match.score1} - ${match.score2}` : "Not started";

          // Parse round details from the JSON rounds field.
          // Each round contains the arena played and which player won.
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

          // Escape CSV values that contain commas by wrapping in double quotes
          return [
            String(match.matchNumber),
            match.player1.name,
            match.player1.nickname,
            match.player2.name,
            match.player2.nickname,
            score,
            match.completed ? "Yes" : "No",
            roundsInfo,
          ].map(v => v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v).join(',');
        });

        csvContent += '\nBM Qualification Matches\n';
        csvContent += qualMatchHeaders.join(',') + '\n';
        csvContent += qualMatchData.join('\n');
      }

      // 3b: Finals matches (include round and TV number columns)
      if (finalsMatches.length > 0) {
        const finalsHeaders = [
          "Match #", "Round", "TV #", "Player 1", "Nickname 1",
          "Player 2", "Nickname 2", "Score", "Completed", "Rounds"
        ];

        const finalsData = finalsMatches.map((match) => {
          const score = match.completed ? `${match.score1} - ${match.score2}` : "Not started";

          // Parse round details from JSON (same logic as qualification matches)
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

          // Escape CSV values that contain commas
          return [
            String(match.matchNumber),
            match.round || "-",
            String(match.tvNumber || "-"),
            match.player1.name,
            match.player1.nickname,
            match.player2.name,
            match.player2.nickname,
            score,
            match.completed ? "Yes" : "No",
            roundsInfo,
          ].map(v => v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v).join(',');
        });

        csvContent += '\nBM Finals Matches\n';
        csvContent += finalsHeaders.join(',') + '\n';
        csvContent += finalsData.join('\n');
      }
    }

    // ========================================
    // Section 4: Match Race Results
    // ========================================
    if (tournament.mrMatches.length > 0) {
      const mrHeaders = [
        "Match #", "Stage", "Round", "Player 1", "Nickname 1", "Player 2", "Nickname 2",
        "Score", "Completed"
      ];

      const mrData = tournament.mrMatches.map((match) => {
        const score = match.completed ? `${match.score1} - ${match.score2}` : "Not started";

        // Escape CSV values that contain commas
        return [
          String(match.matchNumber),
          match.stage || "-",
          match.round || "-",
          match.player1.name,
          match.player1.nickname,
          match.player2.name,
          match.player2.nickname,
          score,
          match.completed ? "Yes" : "No",
        ].map(v => v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v).join(',');
      });

      csvContent += '\nMatch Race Matches\n';
      csvContent += mrHeaders.join(',') + '\n';
      csvContent += mrData.join('\n');
    }

    // ========================================
    // Section 5: Grand Prix Results
    // ========================================
    if (tournament.gpMatches.length > 0) {
      const gpHeaders = [
        "Match #", "Stage", "Player 1", "Nickname 1", "Player 2", "Nickname 2",
        "Points P1", "Points P2", "Completed"
      ];

      const gpData = tournament.gpMatches.map((match) => {
        // GP uses driver points (9, 6, 3, 1) instead of round scores
        return [
          String(match.matchNumber),
          match.stage || "-",
          match.player1.name,
          match.player1.nickname,
          match.player2.name,
          match.player2.nickname,
          String(match.points1 || 0),
          String(match.points2 || 0),
          match.completed ? "Yes" : "No",
        ].map(v => v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v).join(',');
      });

      csvContent += '\nGrand Prix Matches\n';
      csvContent += gpHeaders.join(',') + '\n';
      csvContent += gpData.join('\n');
    }

    // ========================================
    // Section 6: Time Attack Entries
    // ========================================
    if (tournament.ttEntries.length > 0) {
      const taHeaders = [
        "Rank", "Player", "Nickname", "Stage", "Total Time", "Lives", "Date"
      ];

      // Filter out entries without times, then sort by fastest time for ranking
      const taData = tournament.ttEntries
        .filter(entry => entry.totalTime !== null)
        .sort((a, b) => (a.totalTime || 0) - (b.totalTime || 0))
        .map((entry, index) => [
          String(index + 1),
          entry.player.name,
          entry.player.nickname,
          entry.stage || "-",
          formatTime(entry.totalTime || 0),
          String(entry.lives),
          formatDate(new Date(entry.createdAt)),
        ].map(v => v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v).join(','));

      csvContent += '\nTime Attack Entries\n';
      csvContent += taHeaders.join(',') + '\n';
      csvContent += taData.join('\n');
    }

    // Generate a filesystem-safe filename from the tournament name and date.
    // Non-alphanumeric characters are replaced with underscores.
    const filename = `${tournament.name.replace(/[^a-zA-Z0-9]/g, "_")}-full-${formatDate(new Date(tournament.date))}.csv`;

    // Return the CSV content as a file download response
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    // Log error with tournament ID for debugging
    logger.error("Failed to export tournament", { error, tournamentId });
    return NextResponse.json(
      { success: false, error: "Failed to export tournament data" },
      { status: 500 }
    );
  }
}

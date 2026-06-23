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
 * Access: CSV is public; CDM workbook export requires an admin session.
 * Response: CSV file download
 */
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PLAYER_PUBLIC_SELECT } from '@/lib/prisma-selects';
import prisma from "@/lib/prisma";
import { formatDate, formatTime } from "@/lib/excel";
import { createLogger } from "@/lib/logger";
import { createErrorResponse, handleAuthError, handleAuthzError } from "@/lib/error-handling";
import { resolveTournamentId } from "@/lib/tournament-identifier";
import { auth } from "@/lib/auth";
import { generateCdmWorkbook } from "@/lib/cdm-export";
import type {
  CdmMatch,
  CdmModeQualification,
  CdmTTEntry,
  CdmTTPhaseRound,
  CdmTournamentData,
} from "@/lib/cdm-export/types";

const CDM_TEMPLATE_PATH = "/templates/cdm-2025-template.xlsm";

/*
 * Prisma row shapes the CDM mapper reads. These mirror the columns the
 * CDM_EXPORT_INCLUDE query returns (player projected through PLAYER_PUBLIC_SELECT);
 * they exist only to give mapToCdmTournamentData a typed input without pulling the
 * full generated Prisma payload type into this route. Every field below maps 1:1
 * to a prisma/schema.prisma column (BMQualification/BMMatch/GPMatch/TTEntry/
 * TTPhaseRound) so the mapping is a pure field projection, not a transformation.
 */
type CdmPlayerRow = {
  id: string;
  name: string;
  nickname: string;
  country?: string | null;
};

type CdmQualificationRow = {
  player: CdmPlayerRow;
  group: string;
  seeding: number | null;
  points: number;
  score: number;
  rankOverride?: number | null;
};

type CdmMatchRow = {
  matchNumber: number;
  stage: string;
  round?: string | null;
  bracketPosition?: string | null;
  isGrandFinal?: boolean;
  roundNumber?: number | null;
  tvNumber?: number | null;
  isBye?: boolean;
  player1: CdmPlayerRow;
  player2: CdmPlayerRow;
  player1Side?: number | null;
  player2Side?: number | null;
  score1?: number | null;
  score2?: number | null;
  points1?: number | null;
  points2?: number | null;
  completed: boolean;
  assignedCourses?: unknown;
  cup?: string | null;
};

type CdmTtEntryRow = {
  player: CdmPlayerRow;
  playerId: string;
  stage: string;
  seeding: number | null;
  lives: number;
  eliminated: boolean;
  times?: unknown;
  totalTime?: number | null;
  qualificationPoints?: number | null;
  rank?: number | null;
};

type CdmTtPhaseRoundRow = {
  phase: string;
  roundNumber: number;
  course: string;
  results: unknown;
  eliminatedIds?: unknown;
  livesReset: boolean;
};

type CdmTournamentRow = {
  name: string;
  date: Date;
  bmQualifications: CdmQualificationRow[];
  mrQualifications: CdmQualificationRow[];
  gpQualifications: CdmQualificationRow[];
  bmMatches: CdmMatchRow[];
  mrMatches: CdmMatchRow[];
  gpMatches: CdmMatchRow[];
  ttEntries: CdmTtEntryRow[];
  ttPhaseRounds: CdmTtPhaseRoundRow[];
};

const BASE_EXPORT_INCLUDE = {
  bmQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
  bmMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
  mrMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
  gpMatches: { include: { player1: { select: PLAYER_PUBLIC_SELECT }, player2: { select: PLAYER_PUBLIC_SELECT } } },
  ttEntries: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
};

/*
 * The CDM workbook is formula-driven: standings, bracket advancement and the
 * Overall Ranking sheet are all computed by Excel dynamic-array formulas from a
 * small set of input cells, so the exporter never writes the Overall Ranking
 * sheet and therefore does NOT need playerScores (design §3.6). We add only the
 * MR/GP qualification seeds and the TT phase rounds the workbook sheets read.
 */
const CDM_EXPORT_INCLUDE = {
  ...BASE_EXPORT_INCLUDE,
  mrQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
  gpQualifications: { include: { player: { select: PLAYER_PUBLIC_SELECT } } },
  ttPhaseRounds: true,
};

async function loadCDMTemplate(request: Request): Promise<
  | { ok: true; buffer: ArrayBuffer }
  | { ok: false; status: number; source: string; error?: unknown }
> {
  let assets: { fetch?: (input: URL) => Promise<Response> } | undefined;
  try {
    assets = getCloudflareContext().env.ASSETS;
  } catch {
    // Outside the Cloudflare runtime, fall back to the public asset URL below.
  }

  if (assets?.fetch) {
    try {
      const response = await assets.fetch(new URL(CDM_TEMPLATE_PATH, "https://assets.local"));
      if (response.ok) {
        return { ok: true, buffer: await response.arrayBuffer() };
      }
      return { ok: false, status: response.status, source: "ASSETS" };
    } catch (error) {
      return { ok: false, status: 500, source: "ASSETS", error };
    }
  }

  const response = await fetch(new URL(CDM_TEMPLATE_PATH, request.url));
  if (response.ok) {
    return { ok: true, buffer: await response.arrayBuffer() };
  }
  return { ok: false, status: response.status, source: "fetch" };
}

/*
 * Map the Prisma export query result into the CdmTournamentData the generator
 * consumes. This is a pure field projection (no business logic): each property
 * lines up with a prisma/schema.prisma column. BM/MR matches carry round-win
 * scores (score1/score2); GP matches carry driver points (points1/points2); the
 * generator's fill maps pick the right pair per mode. Player objects come from
 * PLAYER_PUBLIC_SELECT, so password is never present here. The Overall Ranking
 * sheet is formula-driven, hence no playerScores mapping (design §3.6).
 */
function mapPlayer(player: CdmPlayerRow): CdmTournamentData["bmQualifications"][number]["player"] {
  return {
    id: player.id,
    name: player.name,
    nickname: player.nickname,
    country: player.country ?? null,
  };
}

function mapQualification(q: CdmQualificationRow): CdmModeQualification {
  return {
    player: mapPlayer(q.player),
    seeding: q.seeding,
    group: q.group,
    rankOverride: q.rankOverride ?? null,
    points: q.points,
    score: q.score,
  };
}

function mapMatch(match: CdmMatchRow): CdmMatch {
  return {
    matchNumber: match.matchNumber,
    stage: match.stage,
    round: match.round ?? null,
    bracketPosition: match.bracketPosition ?? null,
    isGrandFinal: match.isGrandFinal ?? false,
    roundNumber: match.roundNumber ?? null,
    tvNumber: match.tvNumber ?? null,
    isBye: match.isBye ?? false,
    player1: mapPlayer(match.player1),
    player2: mapPlayer(match.player2),
    player1Side: match.player1Side ?? null,
    player2Side: match.player2Side ?? null,
    score1: match.score1 ?? null,
    score2: match.score2 ?? null,
    points1: match.points1 ?? null,
    points2: match.points2 ?? null,
    completed: match.completed,
    assignedCourses: match.assignedCourses,
    cup: match.cup ?? null,
  };
}

function mapTtEntry(entry: CdmTtEntryRow): CdmTTEntry {
  return {
    player: mapPlayer(entry.player),
    playerId: entry.playerId,
    stage: entry.stage,
    seeding: entry.seeding,
    lives: entry.lives,
    eliminated: entry.eliminated,
    times: entry.times,
    totalTime: entry.totalTime ?? null,
    qualificationPoints: entry.qualificationPoints ?? null,
    rank: entry.rank ?? null,
  };
}

function mapTtPhaseRound(round: CdmTtPhaseRoundRow): CdmTTPhaseRound {
  return {
    phase: round.phase,
    roundNumber: round.roundNumber,
    course: round.course,
    results: round.results,
    eliminatedIds: round.eliminatedIds,
    livesReset: round.livesReset,
  };
}

function mapToCdmTournamentData(tournament: CdmTournamentRow): CdmTournamentData {
  return {
    name: tournament.name,
    date: tournament.date,
    bmQualifications: tournament.bmQualifications.map(mapQualification),
    mrQualifications: tournament.mrQualifications.map(mapQualification),
    gpQualifications: tournament.gpQualifications.map(mapQualification),
    bmMatches: tournament.bmMatches.map(mapMatch),
    mrMatches: tournament.mrMatches.map(mapMatch),
    gpMatches: tournament.gpMatches.map(mapMatch),
    ttEntries: tournament.ttEntries.map(mapTtEntry),
    ttPhaseRounds: tournament.ttPhaseRounds.map(mapTtPhaseRound),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Logger created inside function for proper test mocking support
  const logger = createLogger('tournament-export-api');
  const { id } = await params;
  const exportFormat = new URL(request.url).searchParams.get("format");
  // Use raw id as fallback so the catch-block logger always has a tournamentId,
  // even if resolveTournamentId throws before assigning.
  let tournamentId = id;

  try {
    // Resolve inside try so identifier-validation errors from resolveTournamentId
    // (e.g. malformed id combined with a DB connectivity failure) are returned as
    // a structured 500 instead of an unhandled exception that crashes the handler.
    tournamentId = await resolveTournamentId(id);
    if (exportFormat === "cdm") {
      const session = await auth();
      if (!session?.user) {
        return handleAuthError();
      }
      if (session.user.role !== "admin") {
        return handleAuthzError("Admin access required");
      }

      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: CDM_EXPORT_INCLUDE,
      });

      if (!tournament) {
        return createErrorResponse("Tournament not found", 404);
      }

      const template = await loadCDMTemplate(request);
      if (!template.ok) {
        logger.error("Failed to load CDM export template", {
          source: template.source,
          status: template.status,
          ...(template.error !== undefined && { error: template.error }),
          tournamentId,
        });
        return createErrorResponse("Failed to load CDM export template", 503, "SERVICE_UNAVAILABLE");
      }

      // The Prisma payload (player columns projected via PLAYER_PUBLIC_SELECT)
      // is structurally a CdmTournamentRow; cast through unknown because the
      // generated Prisma include type is wider/looser than our read-only shape.
      const cdmData = mapToCdmTournamentData(tournament as unknown as CdmTournamentRow);
      // generateCdmWorkbook returns a Uint8Array over the zip's backing buffer.
      // Re-wrap it so the response body is a Uint8Array<ArrayBuffer> (BodyInit);
      // the patcher's declared return widens to ArrayBufferLike, which NextResponse
      // does not accept directly. The copy is one-time and admin-only.
      const workbookBytes = new Uint8Array(
        generateCdmWorkbook(new Uint8Array(template.buffer), cdmData),
      );
      const filename = `${tournament.name.replace(/[^a-zA-Z0-9]/g, "_")}-cdm-${formatDate(new Date(tournament.date))}.xlsm`;

      return new NextResponse(workbookBytes, {
        headers: {
          "Content-Type": "application/vnd.ms-excel.sheet.macroEnabled.12",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}; filename="${filename}"`,
        },
      });
    }

    // CSV does not read CDM-only qualification/phase/overall tables, so keep
    // its include narrow. The CDM workbook path above opts into the heavier
    // include set only when those workbook sheets need the extra data.
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: BASE_EXPORT_INCLUDE,
    });

    if (!tournament) {
      return createErrorResponse("Tournament not found", 404);
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
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}; filename="${filename}"`,
      },
    });
  } catch (error) {
    // Log error with tournament ID for debugging
    logger.error("Failed to export tournament", { error, tournamentId });
    return createErrorResponse("Failed to export tournament data", 500);
  }
}

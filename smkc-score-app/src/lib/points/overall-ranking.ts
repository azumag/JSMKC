/**
 * Overall Ranking Calculation
 *
 * This module aggregates points from all 4 competition modes (TA, BM, MR, GP)
 * to calculate tournament-wide total points and overall player rankings.
 *
 * Point structure per mode:
 *   - Qualification: max 1000 points (TA uses course-based linear interpolation;
 *     BM/MR/GP use normalized match points)
 *   - Finals: max 2000 points (fixed table lookup based on elimination placement)
 *   - Total per mode: max 3000 points
 *
 * Grand total: max 12,000 points (4 modes x 3,000 per mode)
 *
 * The overall ranking determines the tournament champion. Players are ranked
 * by total points descending, with standard competition ranking for ties
 * (tied players share the same rank; the next rank skips accordingly).
 *
 * This module provides both calculation functions (computing scores from raw data)
 * and persistence functions (saving/loading from the TournamentPlayerScore table).
 *
 * Database dependency: The TournamentPlayerScore model must exist in the Prisma schema.
 * The ExtendedPrismaClient type aliases PrismaClient from @prisma/client.
 */

import { PrismaClient } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import {
  calculateAllCourseScores,
  type TAQualificationPointsResult,
} from "@/lib/ta/qualification-scoring";
import {
  calculateQualificationPoints,
  MatchRecord,
  QualificationPointsResult,
} from "./qualification-points";
import { getFinalsPoints } from "./finals-points";


type ExtendedPrismaClient = PrismaClient;

const logger = createLogger("overall-ranking");

/**
 * Shape of a qualification entry from the database for BM/MR/GP modes.
 * Provides type safety when mapping database rows to MatchRecord objects.
 */
interface QualificationEntry {
  playerId: string;
  wins: number;
  ties: number;
  losses: number;
}

/**
 * Shape of a TTEntry record from the database, used for determining
 * TA finals positions based on elimination status and lives remaining.
 */
interface TTEntryRecord {
  playerId: string;
  eliminated: boolean;
  lives: number;
  totalTime: number | null;
}

/**
 * Aggregated tournament score for a single player.
 *
 * Contains qualification and finals points for each of the 4 modes,
 * the computed total, and the player's overall tournament rank.
 * This is the primary data structure displayed on the Overall Ranking page.
 */
export interface PlayerTournamentScore {
  playerId: string;
  playerName: string;
  playerNickname: string;

  // Qualification points (max 1000 each, from round-robin or time attack)
  taQualificationPoints: number;
  bmQualificationPoints: number;
  mrQualificationPoints: number;
  gpQualificationPoints: number;

  // Finals points (max 2000 each, from fixed placement table)
  taFinalsPoints: number;
  bmFinalsPoints: number;
  mrFinalsPoints: number;
  gpFinalsPoints: number;

  // Sum of all 8 point categories (max 12000)
  totalPoints: number;
  // Tournament-wide rank (1-based, with ties). Null if not yet calculated.
  overallRank: number | null;
  // Timestamp of last DB update (only present when loaded from DB via getOverallRankings)
  updatedAt?: string;
}

/**
 * Calculate TA qualification points from the database.
 *
 * Fetches all Time Trial qualification entries for the tournament,
 * converts stored time strings to milliseconds, and runs the
 * TA qualification points calculation algorithm.
 *
 * @param prisma       - Prisma client instance
 * @param tournamentId - Tournament to calculate for
 * @returns Map of playerId to their TA qualification points result
 */
export async function calculateTAQualificationPointsFromDB(
  prisma: ExtendedPrismaClient,
  tournamentId: string
): Promise<Map<string, TAQualificationPointsResult>> {
  // Fetch all qualification-stage TT entries for this tournament
  const entries = await prisma.tTEntry.findMany({
    where: {
      tournamentId,
      stage: "qualification",
    },
    include: { player: true },
  });

  // Use the same scoring algorithm as the TA qualification page (qualification-scoring.ts)
  // to ensure consistent points between the TA page and overall ranking.
  // This uses single-floor-at-total approach (raw floats per course, Math.floor only on sum).
  const scoringEntries = entries.map((e) => ({
    id: e.id,
    times: e.times as Record<string, string> | null,
  }));

  const scoringResults = calculateAllCourseScores(scoringEntries);

  // Map entry ID -> player ID for the result
  const entryToPlayer = new Map<string, string>();
  for (const entry of entries) {
    entryToPlayer.set(entry.id, entry.playerId);
  }

  // Convert to TAQualificationPointsResult keyed by playerId
  const resultMap = new Map<string, TAQualificationPointsResult>();
  for (const [entryId, result] of scoringResults) {
    const playerId = entryToPlayer.get(entryId);
    if (!playerId) continue;

    resultMap.set(playerId, {
      playerId,
      coursePoints: result.courseScores as Record<string, number>,
      totalPoints: result.qualificationPoints,
    });
  }

  return resultMap;
}

/**
 * Calculate BM (Battle Mode) qualification points from the database.
 *
 * Fetches BMQualification records and applies the standard match-based
 * qualification points formula (2xW + 1xT, normalized to 0-1000).
 *
 * @param prisma       - Prisma client instance
 * @param tournamentId - Tournament to calculate for
 * @returns Map of playerId to their BM qualification points result
 */
export async function calculateBMQualificationPointsFromDB(
  prisma: ExtendedPrismaClient,
  tournamentId: string
): Promise<Map<string, QualificationPointsResult>> {
  const qualifications = await prisma.bMQualification.findMany({
    where: { tournamentId },
    include: { player: true },
  });

  // Map database records to the MatchRecord interface expected by the calculator
  const records: MatchRecord[] = qualifications.map((q: QualificationEntry) => ({
    playerId: q.playerId,
    wins: q.wins,
    ties: q.ties,
    losses: q.losses,
  }));

  const results = calculateQualificationPoints(records);

  // Convert to Map for O(1) lookup
  const resultMap = new Map<string, QualificationPointsResult>();
  for (const result of results) {
    resultMap.set(result.playerId, result);
  }

  return resultMap;
}

/**
 * Calculate MR (Match Race) qualification points from the database.
 *
 * Uses the same formula as BM -- only the data source model differs.
 *
 * @param prisma       - Prisma client instance
 * @param tournamentId - Tournament to calculate for
 * @returns Map of playerId to their MR qualification points result
 */
export async function calculateMRQualificationPointsFromDB(
  prisma: ExtendedPrismaClient,
  tournamentId: string
): Promise<Map<string, QualificationPointsResult>> {
  const qualifications = await prisma.mRQualification.findMany({
    where: { tournamentId },
    include: { player: true },
  });

  const records: MatchRecord[] = qualifications.map((q: QualificationEntry) => ({
    playerId: q.playerId,
    wins: q.wins,
    ties: q.ties,
    losses: q.losses,
  }));

  const results = calculateQualificationPoints(records);

  const resultMap = new Map<string, QualificationPointsResult>();
  for (const result of results) {
    resultMap.set(result.playerId, result);
  }

  return resultMap;
}

/**
 * Calculate GP (Grand Prix) qualification points from the database.
 *
 * Uses the same formula as BM/MR -- only the data source model differs.
 *
 * @param prisma       - Prisma client instance
 * @param tournamentId - Tournament to calculate for
 * @returns Map of playerId to their GP qualification points result
 */
export async function calculateGPQualificationPointsFromDB(
  prisma: ExtendedPrismaClient,
  tournamentId: string
): Promise<Map<string, QualificationPointsResult>> {
  const qualifications = await prisma.gPQualification.findMany({
    where: { tournamentId },
    include: { player: true },
  });

  const records: MatchRecord[] = qualifications.map((q: QualificationEntry) => ({
    playerId: q.playerId,
    wins: q.wins,
    ties: q.ties,
    losses: q.losses,
  }));

  const results = calculateQualificationPoints(records);

  const resultMap = new Map<string, QualificationPointsResult>();
  for (const result of results) {
    resultMap.set(result.playerId, result);
  }

  return resultMap;
}

/**
 * A player's final placement in a mode's finals bracket.
 * Position is 1-based (1 = champion).
 */
export interface FinalsPosition {
  playerId: string;
  position: number;
}

/**
 * Determine TA finals positions from the phase3 (finals) stage data.
 *
 * TA finals use a life-based elimination system. Players are ordered by:
 * 1. Elimination status (non-eliminated players rank higher)
 * 2. Remaining lives (more lives = better)
 * 3. Total time (faster = better, as tiebreaker)
 *
 * Falls back to the legacy "finals" stage name for backwards compatibility
 * with older tournament data that used "finals" instead of "phase3".
 *
 * @param prisma       - Prisma client instance
 * @param tournamentId - Tournament to look up
 * @returns Array of FinalsPosition sorted by placement (1st first)
 */
export async function getTAFinalsPositions(
  prisma: ExtendedPrismaClient,
  tournamentId: string
): Promise<FinalsPosition[]> {
  // Query phase3 (current naming convention for TA finals stage)
  // Ordering: non-eliminated first, then by lives descending, then by time ascending
  const finalsEntries = await prisma.tTEntry.findMany({
    where: {
      tournamentId,
      stage: "phase3",
    },
    orderBy: [
      { eliminated: "asc" },   // Non-eliminated (false) sorts before eliminated (true)
      { lives: "desc" },        // More remaining lives = better performance
      { totalTime: "asc" },     // Faster total time breaks ties
    ],
  });

  // Fallback: check for legacy "finals" stage name used in older tournaments
  if (finalsEntries.length === 0) {
    const legacyFinalsEntries = await prisma.tTEntry.findMany({
      where: {
        tournamentId,
        stage: "finals",
      },
      orderBy: [
        { eliminated: "asc" },
        { lives: "desc" },
        { totalTime: "asc" },
      ],
    });

    // Convert sorted array position to 1-based placement
    return legacyFinalsEntries.map((entry: TTEntryRecord, index: number) => ({
      playerId: entry.playerId,
      position: index + 1,
    }));
  }

  // Convert sorted array position to 1-based placement
  return finalsEntries.map((entry: TTEntryRecord, index: number) => ({
    playerId: entry.playerId,
    position: index + 1,
  }));
}

/**
 * Internal shape for a completed finals match record.
 * Unifies the BM/MR/GP models (GP uses points1/points2 while BM/MR use score1/score2).
 */
interface FinalsMatchRecord {
  player1Id: string;
  player2Id: string;
  /** Player 1's score (wins for BM/MR, driver points for GP) */
  p1Score: number;
  /** Player 2's score */
  p2Score: number;
  round: string | null;
  matchNumber: number;
}

/**
 * Determine the winner and loser of a completed finals match.
 * In case of a draw (shouldn't occur for completed matches), defaults to player 1 as winner.
 */
function resolveWinnerLoser(
  m: FinalsMatchRecord
): { winner: string; loser: string } {
  if (m.p1Score > m.p2Score) return { winner: m.player1Id, loser: m.player2Id };
  if (m.p2Score > m.p1Score) return { winner: m.player2Id, loser: m.player1Id };
  return { winner: m.player1Id, loser: m.player2Id };
}

/**
 * Determine BM/MR/GP finals positions from double-elimination bracket results.
 *
 * Reads completed finals matches from the DB and maps bracket rounds to final
 * placements based on the JSMKC 8-player double-elimination structure:
 *
 *   1st: Grand Final (or GF Reset if played) winner
 *   2nd: Grand Final (or GF Reset) loser
 *   3rd: Losers Final loser
 *   4th: Losers SF loser
 *   5th–6th (tied): Losers R3 losers
 *   7th–8th (tied): Losers R2 losers
 *   9th–12th (tied): Losers R1 losers
 *
 * Returns an empty array when no completed finals exist (e.g. finals not yet played).
 * Falls back gracefully so that `calculateOverallRankings` can handle missing data.
 *
 * GP matches use `points1`/`points2`; BM/MR matches use `score1`/`score2`.
 * Both are normalised to `p1Score`/`p2Score` internally.
 *
 * @param prisma       - Prisma client instance
 * @param tournamentId - Tournament to look up
 * @param mode         - Which mode's finals to examine (BM, MR, or GP)
 * @returns Array of FinalsPosition derived from actual bracket results
 */
export async function getMatchFinalsPositions(
  prisma: ExtendedPrismaClient,
  tournamentId: string,
  mode: "BM" | "MR" | "GP"
): Promise<FinalsPosition[]> {
  logger.info(
    `getMatchFinalsPositions called for mode=${mode}, tournament=${tournamentId}.`
  );

  // Fetch all completed, non-deleted finals matches ordered by match number.
  // GP uses points1/points2 as the score fields; BM/MR use score1/score2.
  let matches: FinalsMatchRecord[];

  if (mode === "BM") {
    const rows = await prisma.bMMatch.findMany({
      where: { tournamentId, stage: "finals", completed: true, deletedAt: null },
      orderBy: { matchNumber: "asc" },
      select: { player1Id: true, player2Id: true, score1: true, score2: true, round: true, matchNumber: true },
    });
    matches = rows.map((r: { player1Id: string; player2Id: string; score1: number; score2: number; round: string | null; matchNumber: number }) => ({
      player1Id: r.player1Id,
      player2Id: r.player2Id,
      p1Score: r.score1,
      p2Score: r.score2,
      round: r.round,
      matchNumber: r.matchNumber,
    }));
  } else if (mode === "MR") {
    const rows = await prisma.mRMatch.findMany({
      where: { tournamentId, stage: "finals", completed: true, deletedAt: null },
      orderBy: { matchNumber: "asc" },
      select: { player1Id: true, player2Id: true, score1: true, score2: true, round: true, matchNumber: true },
    });
    matches = rows.map((r: { player1Id: string; player2Id: string; score1: number; score2: number; round: string | null; matchNumber: number }) => ({
      player1Id: r.player1Id,
      player2Id: r.player2Id,
      p1Score: r.score1,
      p2Score: r.score2,
      round: r.round,
      matchNumber: r.matchNumber,
    }));
  } else {
    // GP uses points1/points2 instead of score1/score2
    const rows = await prisma.gPMatch.findMany({
      where: { tournamentId, stage: "finals", completed: true, deletedAt: null },
      orderBy: { matchNumber: "asc" },
      select: { player1Id: true, player2Id: true, points1: true, points2: true, round: true, matchNumber: true },
    });
    matches = rows.map((r: { player1Id: string; player2Id: string; points1: number; points2: number; round: string | null; matchNumber: number }) => ({
      player1Id: r.player1Id,
      player2Id: r.player2Id,
      p1Score: r.points1,
      p2Score: r.points2,
      round: r.round,
      matchNumber: r.matchNumber,
    }));
  }

  // No finals played yet: return empty array (caller should treat as "not yet determined")
  if (matches.length === 0) {
    logger.warn(`No completed finals found for mode=${mode}, tournament=${tournamentId}. Returning empty positions.`);
    return [];
  }

  const positions: FinalsPosition[] = [];

  /*
   * Position mapping from JSMKC double-elimination bracket rounds
   * (see src/lib/double-elimination.ts for full bracket definition):
   *
   *   grand_final / grand_final_reset → 1st (winner), 2nd (loser)
   *   losers_final                    → 3rd (loser)
   *   losers_sf                       → 4th (loser)
   *   losers_r3  (2 matches)          → 5th (both losers share 5th–6th)
   *   losers_r2  (2 matches)          → 7th (both losers share 7th–8th)
   *   losers_r1  (up to 2 matches)    → 9th (losers share 9th–12th)
   */

  // Grand Final: use the last completed GF match (GF Reset if it was played)
  const gfMatches = matches
    .filter((m) => m.round === "grand_final" || m.round === "grand_final_reset")
    .sort((a, b) => a.matchNumber - b.matchNumber);

  if (gfMatches.length > 0) {
    const { winner, loser } = resolveWinnerLoser(gfMatches[gfMatches.length - 1]);
    positions.push({ playerId: winner, position: 1 });
    positions.push({ playerId: loser, position: 2 });
  }

  // Losers Final loser → 3rd
  for (const m of matches.filter((m) => m.round === "losers_final")) {
    positions.push({ playerId: resolveWinnerLoser(m).loser, position: 3 });
  }

  // Losers SF loser → 4th
  for (const m of matches.filter((m) => m.round === "losers_sf")) {
    positions.push({ playerId: resolveWinnerLoser(m).loser, position: 4 });
  }

  // Losers R3 losers → 5th (both get 5; finals-points table groups 5th–6th equally)
  for (const m of matches.filter((m) => m.round === "losers_r3")) {
    positions.push({ playerId: resolveWinnerLoser(m).loser, position: 5 });
  }

  // Losers R2 losers → 7th (finals-points table groups 7th–8th equally)
  for (const m of matches.filter((m) => m.round === "losers_r2")) {
    positions.push({ playerId: resolveWinnerLoser(m).loser, position: 7 });
  }

  // Losers R1 losers → 9th (finals-points table groups 9th–12th equally)
  for (const m of matches.filter((m) => m.round === "losers_r1")) {
    positions.push({ playerId: resolveWinnerLoser(m).loser, position: 9 });
  }

  return positions;
}

/**
 * Calculate overall tournament rankings by aggregating all modes' points.
 *
 * This is the main entry point for full ranking recalculation. It:
 * 1. Discovers all players who participated in any mode
 * 2. Calculates qualification points for TA, BM, MR, GP
 * 3. Determines finals positions and looks up finals points
 * 4. Sums all 8 point categories per player
 * 5. Sorts by total descending and assigns ranks with tie handling
 *
 * @param prisma       - Prisma client instance
 * @param tournamentId - Tournament to calculate rankings for
 * @returns Array of PlayerTournamentScore sorted by rank
 */
export async function calculateOverallRankings(
  prisma: ExtendedPrismaClient,
  tournamentId: string
): Promise<PlayerTournamentScore[]> {
  // Step 1: Collect all unique player IDs across all 4 modes.
  // A player may participate in only some modes, and still receives
  // 0 points for modes they did not enter.
  const allPlayerIds = new Set<string>();

  // Type aliases for database result shapes
  type PlayerIdEntry = { playerId: string };
  type PlayerEntry = { id: string; name: string; nickname: string };

  // Gather players from TA qualification entries
  const taEntries = await prisma.tTEntry.findMany({
    where: { tournamentId, stage: "qualification" },
    select: { playerId: true },
  });
  taEntries.forEach((e: PlayerIdEntry) => allPlayerIds.add(e.playerId));

  // Gather players from BM qualification
  const bmQuals = await prisma.bMQualification.findMany({
    where: { tournamentId },
    select: { playerId: true },
  });
  bmQuals.forEach((q: PlayerIdEntry) => allPlayerIds.add(q.playerId));

  // Gather players from MR qualification
  const mrQuals = await prisma.mRQualification.findMany({
    where: { tournamentId },
    select: { playerId: true },
  });
  mrQuals.forEach((q: PlayerIdEntry) => allPlayerIds.add(q.playerId));

  // Gather players from GP qualification
  const gpQuals = await prisma.gPQualification.findMany({
    where: { tournamentId },
    select: { playerId: true },
  });
  gpQuals.forEach((q: PlayerIdEntry) => allPlayerIds.add(q.playerId));

  // Step 2: Fetch player display info (name, nickname) for the results
  const players = await prisma.player.findMany({
    where: { id: { in: Array.from(allPlayerIds) } },
  });
  const playerMap = new Map<string, PlayerEntry>(
    players.map((p: PlayerEntry) => [p.id, p])
  );

  // Step 3: Calculate qualification points for each mode
  const taQualPoints = await calculateTAQualificationPointsFromDB(
    prisma,
    tournamentId
  );
  const bmQualPoints = await calculateBMQualificationPointsFromDB(
    prisma,
    tournamentId
  );
  const mrQualPoints = await calculateMRQualificationPointsFromDB(
    prisma,
    tournamentId
  );
  const gpQualPoints = await calculateGPQualificationPointsFromDB(
    prisma,
    tournamentId
  );

  // Step 4: Determine finals positions and look up corresponding points
  const taFinalsPos = await getTAFinalsPositions(prisma, tournamentId);
  const bmFinalsPos = await getMatchFinalsPositions(prisma, tournamentId, "BM");
  const mrFinalsPos = await getMatchFinalsPositions(prisma, tournamentId, "MR");
  const gpFinalsPos = await getMatchFinalsPositions(prisma, tournamentId, "GP");

  // Build lookup maps for finals points (playerId -> points)
  const taFinalsPointsMap = new Map<string, number>();
  taFinalsPos.forEach((p) => {
    taFinalsPointsMap.set(p.playerId, getFinalsPoints("TA", p.position));
  });

  const bmFinalsPointsMap = new Map<string, number>();
  bmFinalsPos.forEach((p) => {
    bmFinalsPointsMap.set(p.playerId, getFinalsPoints("BM", p.position));
  });

  const mrFinalsPointsMap = new Map<string, number>();
  mrFinalsPos.forEach((p) => {
    mrFinalsPointsMap.set(p.playerId, getFinalsPoints("MR", p.position));
  });

  const gpFinalsPointsMap = new Map<string, number>();
  gpFinalsPos.forEach((p) => {
    gpFinalsPointsMap.set(p.playerId, getFinalsPoints("GP", p.position));
  });

  // Step 5: Assemble the complete score for each player
  const scores: PlayerTournamentScore[] = [];

  for (const playerId of allPlayerIds) {
    const player = playerMap.get(playerId);
    if (!player) continue; // Skip orphaned player IDs (shouldn't happen)

    // Look up each point category; default to 0 if the player didn't participate
    const taQual = taQualPoints.get(playerId)?.totalPoints ?? 0;
    const bmQual = bmQualPoints.get(playerId)?.normalizedPoints ?? 0;
    const mrQual = mrQualPoints.get(playerId)?.normalizedPoints ?? 0;
    const gpQual = gpQualPoints.get(playerId)?.normalizedPoints ?? 0;

    const taFinals = taFinalsPointsMap.get(playerId) ?? 0;
    const bmFinals = bmFinalsPointsMap.get(playerId) ?? 0;
    const mrFinals = mrFinalsPointsMap.get(playerId) ?? 0;
    const gpFinals = gpFinalsPointsMap.get(playerId) ?? 0;

    // Sum all 8 categories for the grand total
    const totalPoints =
      taQual +
      bmQual +
      mrQual +
      gpQual +
      taFinals +
      bmFinals +
      mrFinals +
      gpFinals;

    scores.push({
      playerId,
      playerName: player.name,
      playerNickname: player.nickname,
      taQualificationPoints: taQual,
      bmQualificationPoints: bmQual,
      mrQualificationPoints: mrQual,
      gpQualificationPoints: gpQual,
      taFinalsPoints: taFinals,
      bmFinalsPoints: bmFinals,
      mrFinalsPoints: mrFinals,
      gpFinalsPoints: gpFinals,
      totalPoints,
      overallRank: null, // Placeholder -- assigned after sorting
    });
  }

  // Step 6: Sort by total points descending to determine ranking
  scores.sort((a, b) => b.totalPoints - a.totalPoints || a.playerId.localeCompare(b.playerId));

  // Step 7: Assign ranks using standard competition ranking (1224).
  // Players with the same total share a rank; the next distinct rank
  // skips to the actual 1-based position.
  let currentRank = 1;
  let previousPoints: number | null = null;

  for (let i = 0; i < scores.length; i++) {
    if (previousPoints !== null && scores[i].totalPoints === previousPoints) {
      // Tied with previous player -- share the same rank
      scores[i].overallRank = currentRank;
    } else {
      // New point total -- rank equals 1-based position
      currentRank = i + 1;
      scores[i].overallRank = currentRank;
    }
    previousPoints = scores[i].totalPoints;
  }

  return scores;
}

/**
 * Persist calculated rankings to the TournamentPlayerScore database table.
 *
 * Uses Prisma upsert for each player to handle both initial creation and
 * subsequent updates. All upserts are wrapped in a transaction for atomicity,
 * ensuring the ranking table is never in a partially-updated state.
 *
 * @param prisma       - Prisma client instance
 * @param tournamentId - Tournament the scores belong to
 * @param scores       - Calculated player scores to save
 */
export async function saveOverallRankings(
  prisma: ExtendedPrismaClient,
  tournamentId: string,
  scores: PlayerTournamentScore[]
): Promise<void> {
  // Build an array of upsert operations -- one per player.
  // Upsert ensures idempotency: first call creates, subsequent calls update.
  const operations = scores.map((score) =>
    prisma.tournamentPlayerScore.upsert({
      where: {
        // Composite unique key: one score record per tournament+player pair
        tournamentId_playerId: {
          tournamentId,
          playerId: score.playerId,
        },
      },
      create: {
        tournamentId,
        playerId: score.playerId,
        taQualificationPoints: score.taQualificationPoints,
        bmQualificationPoints: score.bmQualificationPoints,
        mrQualificationPoints: score.mrQualificationPoints,
        gpQualificationPoints: score.gpQualificationPoints,
        taFinalsPoints: score.taFinalsPoints,
        bmFinalsPoints: score.bmFinalsPoints,
        mrFinalsPoints: score.mrFinalsPoints,
        gpFinalsPoints: score.gpFinalsPoints,
        totalPoints: score.totalPoints,
        overallRank: score.overallRank,
      },
      update: {
        taQualificationPoints: score.taQualificationPoints,
        bmQualificationPoints: score.bmQualificationPoints,
        mrQualificationPoints: score.mrQualificationPoints,
        gpQualificationPoints: score.gpQualificationPoints,
        taFinalsPoints: score.taFinalsPoints,
        bmFinalsPoints: score.bmFinalsPoints,
        mrFinalsPoints: score.mrFinalsPoints,
        gpFinalsPoints: score.gpFinalsPoints,
        totalPoints: score.totalPoints,
        overallRank: score.overallRank,
      },
    })
  );

  // Execute all upserts atomically within a single transaction
  await prisma.$transaction(operations);
}

/**
 * Shape of the stored TournamentPlayerScore record from the database,
 * including the related Player fields needed for display.
 */
interface StoredTournamentScore {
  playerId: string;
  player: { name: string; nickname: string };
  taQualificationPoints: number;
  bmQualificationPoints: number;
  mrQualificationPoints: number;
  gpQualificationPoints: number;
  taFinalsPoints: number;
  bmFinalsPoints: number;
  mrFinalsPoints: number;
  gpFinalsPoints: number;
  totalPoints: number;
  overallRank: number | null;
  updatedAt: Date;
}

/**
 * Retrieve saved overall rankings from the database.
 *
 * Returns pre-computed scores sorted by rank ascending. This is used
 * by the Overall Ranking page to display results without recalculating.
 * Scores are recalculated and saved by `calculateOverallRankings` +
 * `saveOverallRankings` when triggered by an admin action.
 *
 * @param prisma       - Prisma client instance
 * @param tournamentId - Tournament to fetch rankings for
 * @returns Array of PlayerTournamentScore sorted by overall rank
 */
export async function getOverallRankings(
  prisma: ExtendedPrismaClient,
  tournamentId: string
): Promise<PlayerTournamentScore[]> {
  const scores = await prisma.tournamentPlayerScore.findMany({
    where: { tournamentId },
    include: { player: true },
    orderBy: { overallRank: "asc" },
  });

  // Map database records to the PlayerTournamentScore interface
  return scores.map((s: StoredTournamentScore) => ({
    playerId: s.playerId,
    playerName: s.player.name,
    playerNickname: s.player.nickname,
    taQualificationPoints: s.taQualificationPoints,
    bmQualificationPoints: s.bmQualificationPoints,
    mrQualificationPoints: s.mrQualificationPoints,
    gpQualificationPoints: s.gpQualificationPoints,
    taFinalsPoints: s.taFinalsPoints,
    bmFinalsPoints: s.bmFinalsPoints,
    mrFinalsPoints: s.mrFinalsPoints,
    gpFinalsPoints: s.gpFinalsPoints,
    totalPoints: s.totalPoints,
    // Null if overallRank has not been calculated yet
    overallRank: s.overallRank ?? null,
    updatedAt: s.updatedAt.toISOString(),
  }));
}

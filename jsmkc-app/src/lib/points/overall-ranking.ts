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
  calculateTAQualificationPoints,
  TAQualificationPointsResult,
} from "./ta-qualification-points";
import {
  calculateQualificationPoints,
  MatchRecord,
  QualificationPointsResult,
} from "./qualification-points";
import { getFinalsPoints } from "./finals-points";
import { timeToMs } from "@/lib/ta/time-utils";

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

  // Build a map of playerId -> { courseAbbr -> timeMs }
  // Time strings are converted to milliseconds for numeric comparison
  const playerTimes = new Map<string, Record<string, number | null>>();

  for (const entry of entries) {
    const times = entry.times as Record<string, string> | null;
    if (!times) continue;

    // Convert each course's time string (e.g., "1:23.45") to milliseconds
    const courseTimes: Record<string, number | null> = {};
    for (const [course, timeStr] of Object.entries(times)) {
      courseTimes[course] = timeStr ? timeToMs(timeStr) : null;
    }
    playerTimes.set(entry.playerId, courseTimes);
  }

  // Run the TA qualification points algorithm
  const results = calculateTAQualificationPoints(playerTimes);

  // Convert array to Map for O(1) lookup by playerId
  const resultMap = new Map<string, TAQualificationPointsResult>();
  for (const result of results) {
    resultMap.set(result.playerId, result);
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
 * Determine BM/MR/GP finals positions from bracket results.
 *
 * **PROVISIONAL / ESTIMATED DATA**: Currently uses qualification ranking as a
 * proxy for finals positions. The actual implementation should analyze the
 * double elimination bracket completion to determine exact placements
 * (winner of Grand Final = 1st, loser = 2nd, etc.).
 *
 * The positions returned by this function are NOT actual bracket results --
 * they are estimates based on qualification seeding. Consumers should treat
 * these values as provisional until full bracket analysis is implemented.
 *
 * @remarks This implementation is provisional and returns estimated positions
 * based on qualification seeding. Use actual bracket results when available.
 *
 * TODO: Implement full bracket analysis when bracket completion tracking
 * is available in the database schema.
 *
 * @param prisma       - Prisma client instance
 * @param tournamentId - Tournament to look up
 * @param mode         - Which mode's finals to examine (BM, MR, or GP)
 * @returns Array of FinalsPosition for the top 16 players (provisional)
 */
export async function getMatchFinalsPositions(
  prisma: ExtendedPrismaClient,
  tournamentId: string,
  mode: "BM" | "MR" | "GP"
): Promise<FinalsPosition[]> {
  logger.info(
    `getMatchFinalsPositions called for mode=${mode}, tournament=${tournamentId}. ` +
    "Returning PROVISIONAL positions based on qualification seeding, not actual bracket results."
  );

  // Fetch qualification data sorted by score descending as a proxy
  // for finals placement. This is a temporary simplification.
  let qualifications;

  if (mode === "BM") {
    qualifications = await prisma.bMQualification.findMany({
      where: { tournamentId },
      orderBy: { score: "desc" },
    });
  } else if (mode === "MR") {
    qualifications = await prisma.mRQualification.findMany({
      where: { tournamentId },
      orderBy: { score: "desc" },
    });
  } else {
    qualifications = await prisma.gPQualification.findMany({
      where: { tournamentId },
      orderBy: { score: "desc" },
    });
  }

  // Take top 16 (the standard finals bracket size) and assign
  // sequential positions as a simplified placement proxy
  return qualifications.slice(0, 16).map((q: { playerId: string }, index: number) => ({
    playerId: q.playerId,
    position: index + 1, // Simplified -- actual position should come from bracket analysis
  }));
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

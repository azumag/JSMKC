/**
 * Soft Delete Utilities for Prisma
 *
 * Provides a centralized manager class for performing soft delete operations
 * across all JSMKC models that support the deletedAt field pattern.
 *
 * Instead of physically removing records from the database, soft delete sets
 * a `deletedAt` timestamp. This allows recovery of accidentally deleted data
 * and maintains referential integrity for audit trails and historical queries.
 *
 * Supported models: Player, Tournament, BMMatch, MRMatch, GPMatch,
 * TTEntry, BMQualification, MRQualification, GPQualification
 *
 * Usage:
 *   import { getSoftDeleteManager } from '@/lib/soft-delete';
 *   const manager = getSoftDeleteManager(prismaClient);
 *   await manager.softDeletePlayer('player-id');
 *   const players = await manager.findPlayers(); // excludes soft-deleted
 *   const allPlayers = await manager.findPlayers({}, true); // includes soft-deleted
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '@/lib/logger';

/**
 * Singleton instance of SoftDeleteManager.
 * Ensures only one manager exists per PrismaClient to avoid redundant instances.
 */
let softDeleteManagerInstance: SoftDeleteManager | null = null;

/**
 * SoftDeleteManager provides explicit soft delete, find, and restore operations
 * for every model in the JSMKC schema that supports the deletedAt field.
 *
 * Each model group has three method types:
 * - softDelete(id): Sets deletedAt to current timestamp
 * - find(options, includeDeleted): Queries with optional soft-delete filtering
 * - restore(id): Clears the deletedAt field to "undelete" a record
 *
 * This approach is preferred over Prisma middleware because it gives explicit
 * control over when soft delete filtering is applied, making the behavior
 * predictable and testable.
 */
export class SoftDeleteManager {
  /** Logger scoped to soft-delete operations for structured debugging */
  private logger = createLogger('soft-delete');

  /**
   * @param prisma - The PrismaClient instance to use for all database operations.
   *                 Should be the singleton instance from '@/lib/prisma'.
   */
  constructor(private prisma: PrismaClient) {}

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Adds a `deletedAt: null` condition to a where clause to exclude
   * soft-deleted records, unless the caller explicitly requests to
   * include deleted records.
   *
   * This is the core filtering mechanism used by all find methods.
   * By centralizing this logic, we ensure consistent behavior across
   * all model queries and avoid accidentally returning deleted records.
   *
   * @param where - The existing Prisma where clause (may be undefined)
   * @param includeDeleted - If true, skip adding the deletedAt filter
   * @returns The augmented where clause with deletedAt filtering applied
   */
  private addSoftDeleteClause(
    where: Record<string, unknown> = {},
    includeDeleted: boolean = false
  ): Record<string, unknown> {
    // When includeDeleted is true, return the where clause unmodified
    // so that soft-deleted records are included in query results.
    // This is used for admin views and audit/recovery operations.
    if (includeDeleted) {
      return where;
    }

    // Default behavior: only return records where deletedAt is null,
    // effectively hiding soft-deleted records from normal queries.
    return {
      ...where,
      deletedAt: null,
    };
  }

  // ============================================================
  // Player Operations
  // ============================================================

  /**
   * Soft deletes a player by setting the deletedAt timestamp.
   * The player record remains in the database for referential integrity
   * and can be restored later if needed.
   *
   * @param id - The unique identifier of the player to soft delete
   * @returns The updated player record with deletedAt set
   */
  async softDeletePlayer(id: string) {
    this.logger.info('Soft deleting player', { playerId: id });
    return this.prisma.player.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Finds multiple players, excluding soft-deleted records by default.
   *
   * @param where - Optional Prisma where clause for filtering
   * @param includeDeleted - If true, includes soft-deleted players in results
   * @returns Array of player records matching the query
   */
  async findPlayers(
    where: Record<string, unknown> = {},
    includeDeleted: boolean = false
  ) {
    return this.prisma.player.findMany({
      where: this.addSoftDeleteClause(where, includeDeleted),
    });
  }

  /**
   * Finds a single player by ID, excluding soft-deleted records by default.
   *
   * @param id - The unique identifier of the player
   * @param includeDeleted - If true, can find soft-deleted players
   * @returns The player record or null if not found (or soft-deleted)
   */
  async findPlayer(id: string, includeDeleted: boolean = false) {
    return this.prisma.player.findFirst({
      where: this.addSoftDeleteClause({ id }, includeDeleted),
    });
  }

  /**
   * Restores a soft-deleted player by clearing the deletedAt field.
   * This effectively "undeletes" the player, making them visible in
   * normal queries again.
   *
   * @param id - The unique identifier of the player to restore
   * @returns The updated player record with deletedAt cleared
   */
  async restorePlayer(id: string) {
    this.logger.info('Restoring soft-deleted player', { playerId: id });
    return this.prisma.player.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // ============================================================
  // Tournament Operations
  // ============================================================

  /**
   * Soft deletes a tournament by setting the deletedAt timestamp.
   * Related matches and qualifications are NOT cascaded - they must
   * be soft-deleted separately if needed, preserving granular control.
   *
   * @param id - The unique identifier of the tournament to soft delete
   * @returns The updated tournament record with deletedAt set
   */
  async softDeleteTournament(id: string) {
    this.logger.info('Soft deleting tournament', { tournamentId: id });
    return this.prisma.tournament.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Finds multiple tournaments, excluding soft-deleted records by default.
   *
   * @param where - Optional Prisma where clause for filtering
   * @param includeDeleted - If true, includes soft-deleted tournaments
   * @returns Array of tournament records matching the query
   */
  async findTournaments(
    where: Record<string, unknown> = {},
    includeDeleted: boolean = false
  ) {
    return this.prisma.tournament.findMany({
      where: this.addSoftDeleteClause(where, includeDeleted),
    });
  }

  /**
   * Finds a single tournament by ID, excluding soft-deleted by default.
   *
   * @param id - The unique identifier of the tournament
   * @param includeDeleted - If true, can find soft-deleted tournaments
   * @returns The tournament record or null if not found (or soft-deleted)
   */
  async findTournament(id: string, includeDeleted: boolean = false) {
    return this.prisma.tournament.findFirst({
      where: this.addSoftDeleteClause({ id }, includeDeleted),
    });
  }

  /**
   * Restores a soft-deleted tournament by clearing the deletedAt field.
   *
   * @param id - The unique identifier of the tournament to restore
   * @returns The updated tournament record with deletedAt cleared
   */
  async restoreTournament(id: string) {
    this.logger.info('Restoring soft-deleted tournament', { tournamentId: id });
    return this.prisma.tournament.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // ============================================================
  // Battle Mode (BM) Match Operations
  // ============================================================

  /**
   * Soft deletes a BM match by setting the deletedAt timestamp.
   * BM matches track 1v1 balloon-popping battles in qualification
   * and double elimination finals phases.
   *
   * @param id - The unique identifier of the BM match to soft delete
   * @returns The updated BM match record with deletedAt set
   */
  async softDeleteBMMatch(id: string) {
    this.logger.info('Soft deleting BM match', { matchId: id });
    return this.prisma.bMMatch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Finds multiple BM matches, excluding soft-deleted by default.
   *
   * @param where - Optional Prisma where clause for filtering
   * @param includeDeleted - If true, includes soft-deleted BM matches
   * @returns Array of BM match records matching the query
   */
  async findBMMatches(
    where: Record<string, unknown> = {},
    includeDeleted: boolean = false
  ) {
    return this.prisma.bMMatch.findMany({
      where: this.addSoftDeleteClause(where, includeDeleted),
    });
  }

  /**
   * Finds a single BM match by ID, excluding soft-deleted by default.
   *
   * @param id - The unique identifier of the BM match
   * @param includeDeleted - If true, can find soft-deleted BM matches
   * @returns The BM match record or null if not found
   */
  async findBMMatch(id: string, includeDeleted: boolean = false) {
    return this.prisma.bMMatch.findFirst({
      where: this.addSoftDeleteClause({ id }, includeDeleted),
    });
  }

  /**
   * Restores a soft-deleted BM match by clearing the deletedAt field.
   *
   * @param id - The unique identifier of the BM match to restore
   * @returns The updated BM match record with deletedAt cleared
   */
  async restoreBMMatch(id: string) {
    this.logger.info('Restoring soft-deleted BM match', { matchId: id });
    return this.prisma.bMMatch.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // ============================================================
  // Match Race (MR) Match Operations
  // ============================================================

  /**
   * Soft deletes an MR match by setting the deletedAt timestamp.
   * MR matches track 1v1 random course races with bracket-style
   * qualification and double elimination finals.
   *
   * @param id - The unique identifier of the MR match to soft delete
   * @returns The updated MR match record with deletedAt set
   */
  async softDeleteMRMatch(id: string) {
    this.logger.info('Soft deleting MR match', { matchId: id });
    return this.prisma.mRMatch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Finds multiple MR matches, excluding soft-deleted by default.
   *
   * @param where - Optional Prisma where clause for filtering
   * @param includeDeleted - If true, includes soft-deleted MR matches
   * @returns Array of MR match records matching the query
   */
  async findMRMatches(
    where: Record<string, unknown> = {},
    includeDeleted: boolean = false
  ) {
    return this.prisma.mRMatch.findMany({
      where: this.addSoftDeleteClause(where, includeDeleted),
    });
  }

  /**
   * Finds a single MR match by ID, excluding soft-deleted by default.
   *
   * @param id - The unique identifier of the MR match
   * @param includeDeleted - If true, can find soft-deleted MR matches
   * @returns The MR match record or null if not found
   */
  async findMRMatch(id: string, includeDeleted: boolean = false) {
    return this.prisma.mRMatch.findFirst({
      where: this.addSoftDeleteClause({ id }, includeDeleted),
    });
  }

  /**
   * Restores a soft-deleted MR match by clearing the deletedAt field.
   *
   * @param id - The unique identifier of the MR match to restore
   * @returns The updated MR match record with deletedAt cleared
   */
  async restoreMRMatch(id: string) {
    this.logger.info('Restoring soft-deleted MR match', { matchId: id });
    return this.prisma.mRMatch.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // ============================================================
  // Grand Prix (GP) Match Operations
  // ============================================================

  /**
   * Soft deletes a GP match by setting the deletedAt timestamp.
   * GP matches track 1v1 cup-based scoring with driver points
   * (9, 6, 3, 1 for 1st-4th place).
   *
   * @param id - The unique identifier of the GP match to soft delete
   * @returns The updated GP match record with deletedAt set
   */
  async softDeleteGPMatch(id: string) {
    this.logger.info('Soft deleting GP match', { matchId: id });
    return this.prisma.gPMatch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Finds multiple GP matches, excluding soft-deleted by default.
   *
   * @param where - Optional Prisma where clause for filtering
   * @param includeDeleted - If true, includes soft-deleted GP matches
   * @returns Array of GP match records matching the query
   */
  async findGPMatches(
    where: Record<string, unknown> = {},
    includeDeleted: boolean = false
  ) {
    return this.prisma.gPMatch.findMany({
      where: this.addSoftDeleteClause(where, includeDeleted),
    });
  }

  /**
   * Finds a single GP match by ID, excluding soft-deleted by default.
   *
   * @param id - The unique identifier of the GP match
   * @param includeDeleted - If true, can find soft-deleted GP matches
   * @returns The GP match record or null if not found
   */
  async findGPMatch(id: string, includeDeleted: boolean = false) {
    return this.prisma.gPMatch.findFirst({
      where: this.addSoftDeleteClause({ id }, includeDeleted),
    });
  }

  /**
   * Restores a soft-deleted GP match by clearing the deletedAt field.
   *
   * @param id - The unique identifier of the GP match to restore
   * @returns The updated GP match record with deletedAt cleared
   */
  async restoreGPMatch(id: string) {
    this.logger.info('Restoring soft-deleted GP match', { matchId: id });
    return this.prisma.gPMatch.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // ============================================================
  // Time Trial (TT) Entry Operations
  // ============================================================

  /**
   * Soft deletes a TT entry by setting the deletedAt timestamp.
   * TT entries store individual race times across 20 courses,
   * with qualification and multi-phase finals data.
   *
   * @param id - The unique identifier of the TT entry to soft delete
   * @returns The updated TT entry record with deletedAt set
   */
  async softDeleteTTEntry(id: string) {
    this.logger.info('Soft deleting TT entry', { entryId: id });
    return this.prisma.tTEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Finds multiple TT entries, excluding soft-deleted by default.
   *
   * @param where - Optional Prisma where clause for filtering
   * @param includeDeleted - If true, includes soft-deleted TT entries
   * @returns Array of TT entry records matching the query
   */
  async findTTEntries(
    where: Record<string, unknown> = {},
    includeDeleted: boolean = false
  ) {
    return this.prisma.tTEntry.findMany({
      where: this.addSoftDeleteClause(where, includeDeleted),
    });
  }

  /**
   * Finds a single TT entry by ID, excluding soft-deleted by default.
   *
   * @param id - The unique identifier of the TT entry
   * @param includeDeleted - If true, can find soft-deleted TT entries
   * @returns The TT entry record or null if not found
   */
  async findTTEntry(id: string, includeDeleted: boolean = false) {
    return this.prisma.tTEntry.findFirst({
      where: this.addSoftDeleteClause({ id }, includeDeleted),
    });
  }

  /**
   * Restores a soft-deleted TT entry by clearing the deletedAt field.
   *
   * @param id - The unique identifier of the TT entry to restore
   * @returns The updated TT entry record with deletedAt cleared
   */
  async restoreTTEntry(id: string) {
    this.logger.info('Restoring soft-deleted TT entry', { entryId: id });
    return this.prisma.tTEntry.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // ============================================================
  // Battle Mode (BM) Qualification Operations
  // ============================================================

  /**
   * Soft deletes a BM qualification record by setting the deletedAt timestamp.
   * BM qualifications track player standings in group round-robin phase.
   *
   * @param id - The unique identifier of the BM qualification to soft delete
   * @returns The updated BM qualification record with deletedAt set
   */
  async softDeleteBMQualification(id: string) {
    this.logger.info('Soft deleting BM qualification', { qualificationId: id });
    return this.prisma.bMQualification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Finds multiple BM qualifications, excluding soft-deleted by default.
   *
   * @param where - Optional Prisma where clause for filtering
   * @param includeDeleted - If true, includes soft-deleted BM qualifications
   * @returns Array of BM qualification records matching the query
   */
  async findBMQualifications(
    where: Record<string, unknown> = {},
    includeDeleted: boolean = false
  ) {
    return this.prisma.bMQualification.findMany({
      where: this.addSoftDeleteClause(where, includeDeleted),
    });
  }

  // ============================================================
  // Match Race (MR) Qualification Operations
  // ============================================================

  /**
   * Soft deletes an MR qualification record by setting the deletedAt timestamp.
   * MR qualifications track player standings in group round-robin phase.
   *
   * @param id - The unique identifier of the MR qualification to soft delete
   * @returns The updated MR qualification record with deletedAt set
   */
  async softDeleteMRQualification(id: string) {
    this.logger.info('Soft deleting MR qualification', { qualificationId: id });
    return this.prisma.mRQualification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Finds multiple MR qualifications, excluding soft-deleted by default.
   *
   * @param where - Optional Prisma where clause for filtering
   * @param includeDeleted - If true, includes soft-deleted MR qualifications
   * @returns Array of MR qualification records matching the query
   */
  async findMRQualifications(
    where: Record<string, unknown> = {},
    includeDeleted: boolean = false
  ) {
    return this.prisma.mRQualification.findMany({
      where: this.addSoftDeleteClause(where, includeDeleted),
    });
  }

  // ============================================================
  // Grand Prix (GP) Qualification Operations
  // ============================================================

  /**
   * Soft deletes a GP qualification record by setting the deletedAt timestamp.
   * GP qualifications track player driver point totals in group phase.
   *
   * @param id - The unique identifier of the GP qualification to soft delete
   * @returns The updated GP qualification record with deletedAt set
   */
  async softDeleteGPQualification(id: string) {
    this.logger.info('Soft deleting GP qualification', { qualificationId: id });
    return this.prisma.gPQualification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Finds multiple GP qualifications, excluding soft-deleted by default.
   *
   * @param where - Optional Prisma where clause for filtering
   * @param includeDeleted - If true, includes soft-deleted GP qualifications
   * @returns Array of GP qualification records matching the query
   */
  async findGPQualifications(
    where: Record<string, unknown> = {},
    includeDeleted: boolean = false
  ) {
    return this.prisma.gPQualification.findMany({
      where: this.addSoftDeleteClause(where, includeDeleted),
    });
  }
}

/**
 * Factory function that returns a singleton SoftDeleteManager instance.
 *
 * Uses the singleton pattern to ensure only one manager exists per
 * application lifecycle, matching the singleton pattern used by the
 * PrismaClient in '@/lib/prisma'.
 *
 * This approach avoids creating multiple manager instances during
 * development hot reloads and ensures consistent behavior.
 *
 * @param prisma - The PrismaClient instance to use
 * @returns The singleton SoftDeleteManager instance
 */
export function getSoftDeleteManager(prisma: PrismaClient): SoftDeleteManager {
  // Return existing instance if already created (singleton pattern)
  if (!softDeleteManagerInstance) {
    softDeleteManagerInstance = new SoftDeleteManager(prisma);
  }
  return softDeleteManagerInstance;
}

/**
 * Applies soft delete middleware to a PrismaClient instance.
 *
 * WARNING: This function is deprecated in favor of using SoftDeleteManager
 * directly. The middleware approach has several drawbacks:
 * - Implicit behavior makes debugging difficult
 * - Cannot be selectively disabled for specific queries
 * - Harder to test in isolation
 *
 * This function now only logs a warning directing developers to use
 * SoftDeleteManager instead of the middleware approach.
 *
 * @param _prisma - The PrismaClient instance (unused, kept for API compatibility)
 */
export function applySoftDeleteMiddleware(_prisma: PrismaClient): void {
  const logger = createLogger('soft-delete-middleware');

  // Log warning to guide developers toward the preferred approach.
  // SoftDeleteManager provides explicit, testable soft delete operations
  // rather than implicit middleware interception.
  logger.warn(
    'applySoftDeleteMiddleware is deprecated. Use SoftDeleteManager from getSoftDeleteManager() instead. ' +
    'The manager approach provides explicit control over soft delete filtering and is easier to test.'
  );
}

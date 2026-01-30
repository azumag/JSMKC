// Soft Delete Middleware for Prisma
// Provides automatic soft delete functionality for specified models
// Instead of physically deleting records, sets deletedAt timestamp

import { PrismaClient } from '@prisma/client';

export interface SoftDeleteOptions {
  includeDeleted?: boolean;
}

interface PrismaMiddlewareParams {
  model?: string;
  action: string;
  args: Record<string, unknown> & {
    data?: Record<string, unknown>;
    where?: Record<string, unknown>;
    includeDeleted?: boolean;
  };
  dataPath?: string[];
  runInTransaction?: boolean;
}

interface PrismaNextFunction {
  (params: PrismaMiddlewareParams): Promise<unknown>;
}

/**
 * Creates middleware that intercepts delete operations and converts them to soft deletes.
 * Also automatically filters out soft-deleted records from find queries.
 */
export function createSoftDeleteMiddleware() {
  return async (params: PrismaMiddlewareParams, next: PrismaNextFunction) => {
    // Models that support soft delete via deletedAt field
    const softDeleteModels = [
      'Player', 'Tournament', 'BMMatch', 'BMQualification',
      'MRMatch', 'MRQualification', 'GPMatch', 'GPQualification', 'TTEntry'
    ];

    if (params.model && softDeleteModels.includes(params.model)) {
      // Convert DELETE to UPDATE with deletedAt timestamp
      if (params.action === 'delete') {
        params.action = 'update';
        params.args['data'] = { deletedAt: new Date() };
      }

      // Convert deleteMany to updateMany with deletedAt timestamp
      if (params.action === 'deleteMany') {
        params.action = 'updateMany';
        if (params.args.data != undefined) {
          params.args.data['deletedAt'] = new Date();
        } else {
          params.args['data'] = { deletedAt: new Date() };
        }
      }

      // Automatically exclude soft-deleted records from queries
      // unless explicitly requested with includeDeleted flag
      if (['findMany', 'findFirst', 'findUnique'].includes(params.action)) {
        if (params.args?.includeDeleted !== true) {
          if (params.args.where) {
            params.args.where['deletedAt'] = null;
          } else {
            params.args.where = { deletedAt: null };
          }
        }
      }
    }

    return next(params);
  };
}

/**
 * Utility class providing explicit soft delete operations for each model.
 * Used when middleware approach is not available or when explicit control is needed.
 */
export class SoftDeleteUtils {
  constructor(private prisma: PrismaClient) {}

  // Soft delete operations for each model type
  async softDeletePlayer(id: string) {
    return this.prisma.player.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async softDeleteTournament(id: string) {
    return this.prisma.tournament.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async softDeleteBMMatch(id: string) {
    return this.prisma.bMMatch.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async softDeleteBMQualification(id: string) {
    return this.prisma.bMQualification.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async softDeleteMRMatch(id: string) {
    return this.prisma.mRMatch.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async softDeleteMRQualification(id: string) {
    return this.prisma.mRQualification.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async softDeleteGPMatch(id: string) {
    return this.prisma.gPMatch.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async softDeleteGPQualification(id: string) {
    return this.prisma.gPQualification.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  // Query functions that automatically exclude soft-deleted records
  async getPlayers(options: import('@prisma/client').Prisma.PlayerFindManyArgs = {}) {
    return this.prisma.player.findMany({
      ...options,
      where: {
        ...options.where,
        deletedAt: null
      }
    });
  }

  async getTournaments(options: import('@prisma/client').Prisma.TournamentFindManyArgs = {}) {
    return this.prisma.tournament.findMany({
      ...options,
      where: {
        ...options.where,
        deletedAt: null
      }
    });
  }

  // Recovery operations to restore soft-deleted records
  async restorePlayer(id: string) {
    return this.prisma.player.update({
      where: { id },
      data: { deletedAt: null }
    });
  }

  async restoreTournament(id: string) {
    return this.prisma.tournament.update({
      where: { id },
      data: { deletedAt: null }
    });
  }

  // Include deleted records in queries (for admin views)
  async getPlayersWithDeleted(options: import('@prisma/client').Prisma.PlayerFindManyArgs = {}) {
    return this.prisma.player.findMany(options);
  }

  async getTournamentsWithDeleted(options: import('@prisma/client').Prisma.TournamentFindManyArgs = {}) {
    return this.prisma.tournament.findMany(options);
  }

  async findPlayerWithDeleted(id: string) {
    return this.prisma.player.findUnique({
      where: { id }
    });
  }

  async findTournamentWithDeleted(id: string, options: Omit<import('@prisma/client').Prisma.TournamentFindUniqueArgs, 'where'> = {}) {
    return this.prisma.tournament.findUnique({
      where: { id },
      ...options
    });
  }
}

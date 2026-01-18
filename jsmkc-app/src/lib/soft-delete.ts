// Soft Delete Middleware for Prisma
// This provides automatic soft delete functionality for specified models

import { PrismaClient } from '@prisma/client';

export interface SoftDeleteOptions {
  includeDeleted?: boolean;
}

interface PrismaMiddlewareParams {
  model?: string;
  action: string;
  args: Record<string, unknown>;
  dataPath?: string[];
  runInTransaction?: boolean;
}

interface PrismaNextFunction {
  (params: PrismaMiddlewareParams): Promise<unknown>;
}

export function createSoftDeleteMiddleware() {
  return async (params: PrismaMiddlewareParams, next: PrismaNextFunction) => {
    // 対象モデルのチェック
    const softDeleteModels = [
      'Player', 'Tournament', 'BMMatch', 'BMQualification',
      'MRMatch', 'MRQualification', 'GPMatch', 'GPQualification', 'TTEntry'
    ];
    
    if (params.model && softDeleteModels.includes(params.model)) {
      // DELETE操作をUPDATE（ソフトデリート）に変換
      if (params.action === 'delete') {
        params.action = 'update';
        params.args['data'] = { deletedAt: new Date() };
      }
      
      // deleteMany操作をupdateManyに変換
      if (params.action === 'deleteMany') {
        params.action = 'updateMany';
        if (params.args.data != undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (params.args.data as any)['deletedAt'] = new Date();
        } else {
          params.args['data'] = { deletedAt: new Date() };
        }
      }
      
      // クエリ時に削除済みレコードを除外（明示的なincludeDeletedフラグがない場合）
      if (['findMany', 'findFirst', 'findUnique'].includes(params.action)) {
        // includeDeletedフラグがない場合はデフォルトで除外
        if (params.args?.includeDeleted !== true) {
          if (params.args.where) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (params.args.where as any)['deletedAt'] = null;
          } else {
            params.args.where = { deletedAt: null };
          }
        }
      }
    }
    
    return next(params);
  };
}

// Utility functions for soft delete operations
export class SoftDeleteUtils {
  constructor(private prisma: PrismaClient) {}

  // Soft delete functions
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

  async softDeleteTTEntry(id: string) {
    return this.prisma.tTEntry.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  // Query functions that automatically exclude deleted records
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

  // Recovery functions
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

  // Include deleted records queries
  async getPlayersWithDeleted(options: import('@prisma/client').Prisma.PlayerFindManyArgs = {}) {
    return this.prisma.player.findMany(options);
  }

  async getTournamentsWithDeleted(options: import('@prisma/client').Prisma.TournamentFindManyArgs = {}) {
    return this.prisma.tournament.findMany(options);
  }

  // Find single records with deleted included
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
// Soft Delete Middleware for Prisma
// This provides automatic soft delete functionality for specified models

export interface SoftDeleteOptions {
  includeDeleted?: boolean;
}

export function createSoftDeleteMiddleware() {
  return async (params: any, next: (params: any) => Promise<any>) => {
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
          params.args.data['deletedAt'] = new Date();
        } else {
          params.args['data'] = { deletedAt: new Date() };
        }
      }
      
      // クエリ時に削除済みレコードを除外（明示的なincludeDeletedフラグがない場合）
      if (['findMany', 'findFirst', 'findUnique'].includes(params.action)) {
        // includeDeletedフラグがない場合はデフォルトで除外
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

// Utility functions for soft delete operations
export class SoftDeleteUtils {
  constructor(private prisma: any) {}

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
  async getPlayers(options: any = {}) {
    return this.prisma.player.findMany({
      ...options,
      where: {
        ...options.where,
        deletedAt: null
      }
    });
  }

  async getTournaments(options: any = {}) {
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
  async getPlayersWithDeleted(options: any = {}) {
    return this.prisma.player.findMany(options);
  }

  async getTournamentsWithDeleted(options: any = {}) {
    return this.prisma.tournament.findMany(options);
  }

  // Find single records with deleted included
  async findPlayerWithDeleted(id: string) {
    return this.prisma.player.findUnique({
      where: { id }
    });
  }

  async findTournamentWithDeleted(id: string, options: any = {}) {
    return this.prisma.tournament.findUnique({
      where: { id },
      ...options
    });
  }
}
// Soft Delete Utilities for Prisma
// 設計書の「6.6 ソフトデリートの実装」に基づき実装

import { PrismaClient } from '@prisma/client';

// ソフトデリート用のユーティリティ関数
export class SoftDeleteManager {
  constructor(private prisma: PrismaClient) {}

  // ソフトデリート用のwhere句を生成
  private addSoftDeleteClause<T extends Record<string, unknown>>(where: T = {} as T, includeDeleted = false): T {
    if (includeDeleted) {
      return where;
    }
    return {
      ...where,
      deletedAt: null
    } as T;
  }

  // Player操作
  async softDeletePlayer(id: string) {
    return this.prisma.player.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async findPlayers(options: import('@prisma/client').Prisma.PlayerFindManyArgs = {}, includeDeleted = false) {
    return this.prisma.player.findMany({
      ...options,
      where: this.addSoftDeleteClause(options.where, includeDeleted)
    });
  }

  async findPlayer(id: string, options: Omit<import('@prisma/client').Prisma.PlayerFindUniqueArgs, 'where'> = {}, includeDeleted = false) {
    return this.prisma.player.findUnique({
      ...options,
      where: this.addSoftDeleteClause({ id }, includeDeleted)
    });
  }

  // Tournament操作
  async softDeleteTournament(id: string) {
    return this.prisma.tournament.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async findTournaments(options: import('@prisma/client').Prisma.TournamentFindManyArgs = {}, includeDeleted = false) {
    return this.prisma.tournament.findMany({
      ...options,
      where: this.addSoftDeleteClause(options.where, includeDeleted)
    });
  }

  async findTournament(id: string, options: Omit<import('@prisma/client').Prisma.TournamentFindUniqueArgs, 'where'> = {}, includeDeleted = false) {
    return this.prisma.tournament.findUnique({
      ...options,
      where: this.addSoftDeleteClause({ id }, includeDeleted)
    });
  }

  // BMMatch操作
  async softDeleteBMMatch(id: string) {
    return this.prisma.bMMatch.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async findBMMatches(options: import('@prisma/client').Prisma.BMMatchFindManyArgs = {}, includeDeleted = false) {
    return this.prisma.bMMatch.findMany({
      ...options,
      where: this.addSoftDeleteClause(options.where, includeDeleted)
    });
  }

  async findBMMatch(id: string, options: Omit<import('@prisma/client').Prisma.BMMatchFindUniqueArgs, 'where'> = {}, includeDeleted = false) {
    return this.prisma.bMMatch.findUnique({
      ...options,
      where: this.addSoftDeleteClause({ id }, includeDeleted)
    });
  }

  // MRMatch操作
  async softDeleteMRMatch(id: string) {
    return this.prisma.mRMatch.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async findMRMatches(options: import('@prisma/client').Prisma.MRMatchFindManyArgs = {}, includeDeleted = false) {
    return this.prisma.mRMatch.findMany({
      ...options,
      where: this.addSoftDeleteClause(options.where, includeDeleted)
    });
  }

  async findMRMatch(id: string, options: Omit<import('@prisma/client').Prisma.MRMatchFindUniqueArgs, 'where'> = {}, includeDeleted = false) {
    return this.prisma.mRMatch.findUnique({
      ...options,
      where: this.addSoftDeleteClause({ id }, includeDeleted)
    });
  }

  // GPMatch操作
  async softDeleteGPMatch(id: string) {
    return this.prisma.gPMatch.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async findGPMatches(options: import('@prisma/client').Prisma.GPMatchFindManyArgs = {}, includeDeleted = false) {
    return this.prisma.gPMatch.findMany({
      ...options,
      where: this.addSoftDeleteClause(options.where, includeDeleted)
    });
  }

  async findGPMatch(id: string, options: Omit<import('@prisma/client').Prisma.GPMatchFindUniqueArgs, 'where'> = {}, includeDeleted = false) {
    return this.prisma.gPMatch.findUnique({
      ...options,
      where: this.addSoftDeleteClause({ id }, includeDeleted)
    });
  }

  // TTEntry操作
  async softDeleteTTEntry(id: string) {
    return this.prisma.tTEntry.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async findTTEntries(options: import('@prisma/client').Prisma.TTEntryFindManyArgs = {}, includeDeleted = false) {
    return this.prisma.tTEntry.findMany({
      ...options,
      where: this.addSoftDeleteClause(options.where, includeDeleted)
    });
  }

  async findTTEntry(id: string, options: Omit<import('@prisma/client').Prisma.TTEntryFindUniqueArgs, 'where'> = {}, includeDeleted = false) {
    return this.prisma.tTEntry.findUnique({
      ...options,
      where: this.addSoftDeleteClause({ id }, includeDeleted)
    });
  }

  // BMQualification操作
  async softDeleteBMQualification(id: string) {
    return this.prisma.bMQualification.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async findBMQualifications(options: import('@prisma/client').Prisma.BMQualificationFindManyArgs = {}, includeDeleted = false) {
    return this.prisma.bMQualification.findMany({
      ...options,
      where: this.addSoftDeleteClause(options.where, includeDeleted)
    });
  }

  // MRQualification操作
  async softDeleteMRQualification(id: string) {
    return this.prisma.mRQualification.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async findMRQualifications(options: import('@prisma/client').Prisma.MRQualificationFindManyArgs = {}, includeDeleted = false) {
    return this.prisma.mRQualification.findMany({
      ...options,
      where: this.addSoftDeleteClause(options.where, includeDeleted)
    });
  }

  // GPQualification操作
  async softDeleteGPQualification(id: string) {
    return this.prisma.gPQualification.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  async findGPQualifications(options: import('@prisma/client').Prisma.GPQualificationFindManyArgs = {}, includeDeleted = false) {
    return this.prisma.gPQualification.findMany({
      ...options,
      where: this.addSoftDeleteClause(options.where, includeDeleted)
    });
  }

  // 復元操作
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

  async restoreBMMatch(id: string) {
    return this.prisma.bMMatch.update({
      where: { id },
      data: { deletedAt: null }
    });
  }

  async restoreMRMatch(id: string) {
    return this.prisma.mRMatch.update({
      where: { id },
      data: { deletedAt: null }
    });
  }

  async restoreGPMatch(id: string) {
    return this.prisma.gPMatch.update({
      where: { id },
      data: { deletedAt: null }
    });
  }

  async restoreTTEntry(id: string) {
    return this.prisma.tTEntry.update({
      where: { id },
      data: { deletedAt: null }
    });
  }
}

// デフォルトインスタンスをエクスポート（互換性のため）
let softDeleteManager: SoftDeleteManager | null = null;

export function getSoftDeleteManager(prisma: PrismaClient): SoftDeleteManager {
  if (!softDeleteManager || softDeleteManager['prisma'] !== prisma) {
    softDeleteManager = new SoftDeleteManager(prisma);
  }
  return softDeleteManager;
}

// 互換性のための関数（ミドルウェアが使えない場合の代替）
export function applySoftDeleteMiddleware(): void {
  console.warn('Using SoftDeleteManager instead of middleware due to Prisma version limitations.');
}
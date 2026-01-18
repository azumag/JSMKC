import { PrismaClient, Prisma } from '@prisma/client';

export class OptimisticLockError extends Error {
  constructor(message: string, public readonly currentVersion: number) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 100, // 100ms
  maxDelay: 1000, // 1秒
};

function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
  // ジッターを追加して複数クライアントの競合を分散
  return delay + Math.random() * config.baseDelay;
}

export async function updateWithRetry<T>(
  prisma: PrismaClient,
  updateFn: (tx: Prisma.TransactionClient) => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await prisma.$transaction(updateFn);
    } catch (error) {
      lastError = error as Error;
      
      // 楽観的ロックエラー以外は即座にリスロー
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || 
          !isOptimisticLockError(error)) {
        throw error;
      }

      // 最後の試行であればリスロー
      if (attempt === finalConfig.maxRetries) {
        throw error;
      }

      // 指数バックオフで待機
      const delay = calculateDelay(attempt, finalConfig);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

function isOptimisticLockError(error: Prisma.PrismaClientKnownRequestError): boolean {
  // Prismaのバージョン管理エラーを検出
  // 具体的なエラーコードはバージョンによるため、メッセージで判定
  return error.message.includes('Record to update not found') ||
         error.message.includes('version') ||
         error.code === 'P2025';
}

// Battle Mode スコア更新用ユーティリティ
export async function updateBMMatchScore(
  prisma: PrismaClient,
  matchId: string,
  expectedVersion: number,
  score1: number,
  score2: number,
  completed: boolean = false,
  rounds?: any[]
): Promise<{ version: number }> {
  return updateWithRetry(prisma, async (tx) => {
    const current = await tx.bMMatch.findUnique({
      where: { id: matchId }
    });

    if (!current) {
      throw new OptimisticLockError('Match not found', -1);
    }

    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(
        `Version mismatch: expected ${expectedVersion}, got ${current.version}`,
        current.version
      );
    }

    const updated = await tx.bMMatch.update({
      where: {
        id: matchId,
        version: expectedVersion
      },
      data: {
        score1,
        score2,
        completed,
        rounds,
        version: { increment: 1 }
      }
    });

    return { version: updated.version };
  });
}

// Match Race スコア更新用ユーティリティ
export async function updateMRMatchScore(
  prisma: PrismaClient,
  matchId: string,
  expectedVersion: number,
  score1: number,
  score2: number,
  completed: boolean = false,
  rounds?: any[]
): Promise<{ version: number }> {
  return updateWithRetry(prisma, async (tx) => {
    const current = await tx.mRMatch.findUnique({
      where: { id: matchId }
    });

    if (!current) {
      throw new OptimisticLockError('Match not found', -1);
    }

    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(
        `Version mismatch: expected ${expectedVersion}, got ${current.version}`,
        current.version
      );
    }

    const updated = await tx.mRMatch.update({
      where: {
        id: matchId,
        version: expectedVersion
      },
      data: {
        score1,
        score2,
        completed,
        rounds,
        version: { increment: 1 }
      }
    });

    return { version: updated.version };
  });
}

// Grand Prix スコア更新用ユーティリティ
export async function updateGPMatchScore(
  prisma: PrismaClient,
  matchId: string,
  expectedVersion: number,
  points1: number,
  points2: number,
  completed: boolean = false,
  races?: any[]
): Promise<{ version: number }> {
  return updateWithRetry(prisma, async (tx) => {
    const current = await tx.gPMatch.findUnique({
      where: { id: matchId }
    });

    if (!current) {
      throw new OptimisticLockError('Match not found', -1);
    }

    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(
        `Version mismatch: expected ${expectedVersion}, got ${current.version}`,
        current.version
      );
    }

    const updated = await tx.gPMatch.update({
      where: {
        id: matchId,
        version: expectedVersion
      },
      data: {
        points1,
        points2,
        completed,
        races,
        version: { increment: 1 }
      }
    });

    return { version: updated.version };
  });
}

// Time Trial エントリー更新用ユーティリティ
export async function updateTTEntry(
  prisma: PrismaClient,
  entryId: string,
  expectedVersion: number,
  data: {
    times?: any;
    totalTime?: number;
    rank?: number;
    eliminated?: boolean;
    lives?: number;
  }
): Promise<{ version: number }> {
  return updateWithRetry(prisma, async (tx) => {
    const current = await tx.tTEntry.findUnique({
      where: { id: entryId }
    });

    if (!current) {
      throw new OptimisticLockError('Entry not found', -1);
    }

    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(
        `Version mismatch: expected ${expectedVersion}, got ${current.version}`,
        current.version
      );
    }

    const updated = await tx.tTEntry.update({
      where: {
        id: entryId,
        version: expectedVersion
      },
      data: {
        ...data,
        version: { increment: 1 }
      }
    });

    return { version: updated.version };
  });
}
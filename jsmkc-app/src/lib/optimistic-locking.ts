import { PrismaClient, Prisma } from '@prisma/client';

// Type definitions for the data structures
export interface BMRound {
  arena: string;
  winner: 1 | 2;
}

export interface MRRound {
  course: string;
  winner: 1 | 2;
}

export interface GPRace {
  course: string;
  position1: number;
  position2: number;
  points1: number;
  points2: number;
}

export interface TTEntryData {
  times?: Record<string, string>;
  totalTime?: number;
  rank?: number;
  eliminated?: boolean;
  lives?: number;
}

// Type for update data that can be spread into the update operation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type UpdateData<T> = Partial<T> & {
  version?: { increment: number };
};

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

// Generic model keys for type-safe access to Prisma models
type PrismaModelKeys = 
  | 'bMMatch'
  | 'mRMatch' 
  | 'gPMatch'
  | 'tTEntry';

// Generic function to create model-specific update functions
// Note: Using 'as any' for dynamic model access is necessary here
// because Prisma's TransactionClient doesn't provide a type-safe way
// to access models dynamically while maintaining the generic pattern.
// This is a documented limitation and the usage is controlled and type-checked at compile time.
function createUpdateFunction<TModel extends PrismaModelKeys, TData>(
  modelName: TModel,
  defaultNotFoundError: string
) {
  return async function updateWithVersion(
    prisma: PrismaClient,
    id: string,
    expectedVersion: number,
    data: TData
  ): Promise<{ version: number }> {
    return updateWithRetry(prisma, async (tx) => {
      // Dynamic model access - necessary for generic pattern
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = (tx as any)[modelName];

      const current = await model.findUnique({
        where: { id }
      });

      if (!current) {
        throw new OptimisticLockError(defaultNotFoundError, -1);
      }

      if (current.version !== expectedVersion) {
        throw new OptimisticLockError(
          `Version mismatch: expected ${expectedVersion}, got ${current.version}`,
          current.version
        );
      }

      const updated = await model.update({
        where: {
          id,
          version: expectedVersion
        },
        data: {
          ...data,
          version: { increment: 1 }
        }
      });

      return { version: updated.version };
    });
  };
}

// Battle Mode スコア更新用ユーティリティ
const _updateBMMatchScore = createUpdateFunction(
  'bMMatch',
  'Match not found'
);

export async function updateBMMatchScore(
  prisma: PrismaClient,
  matchId: string,
  expectedVersion: number,
  score1: number,
  score2: number,
  completed: boolean = false,
  rounds?: BMRound[]
): Promise<{ version: number }> {
  return _updateBMMatchScore(prisma, matchId, expectedVersion, {
    score1,
    score2,
    completed,
    rounds
  });
}

// Match Race スコア更新用ユーティリティ
const _updateMRMatchScore = createUpdateFunction(
  'mRMatch',
  'Match not found'
);

export async function updateMRMatchScore(
  prisma: PrismaClient,
  matchId: string,
  expectedVersion: number,
  score1: number,
  score2: number,
  completed: boolean = false,
  rounds?: MRRound[]
): Promise<{ version: number }> {
  return _updateMRMatchScore(prisma, matchId, expectedVersion, {
    score1,
    score2,
    completed,
    rounds
  });
}

// Grand Prix スコア更新用ユーティリティ
const _updateGPMatchScore = createUpdateFunction(
  'gPMatch',
  'Match not found'
);

export async function updateGPMatchScore(
  prisma: PrismaClient,
  matchId: string,
  expectedVersion: number,
  points1: number,
  points2: number,
  completed: boolean = false,
  races?: GPRace[]
): Promise<{ version: number }> {
  return _updateGPMatchScore(prisma, matchId, expectedVersion, {
    points1,
    points2,
    completed,
    races
  });
}

// Time Trial エントリー更新用ユーティリティ
const _updateTTEntry = createUpdateFunction(
  'tTEntry',
  'Entry not found'
);

export async function updateTTEntry(
  prisma: PrismaClient,
  entryId: string,
  expectedVersion: number,
  data: TTEntryData
): Promise<{ version: number }> {
  return _updateTTEntry(prisma, entryId, expectedVersion, data);
}
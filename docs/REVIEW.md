# コードレビュ結果

**レビュー日**: 2026-01-19
**レビュアー**: レビューエージェント
**レビュー対象**: docs/IMPLEMENTED.md と実際の実装コード

---

## 実行サマリー

実装エージェントによるレビュー修正の実装を検証しました。設計書との適合性、コード品質、セキュリティ、パフォーマンスの観点から厳しくレビューを行いました。

**Overall Status**: ⚠️ **重大な問題あり - 修正必須**

---

## 1. アーキテクチャ適合性レビュー

### ❌ 致命的問題: prisma-middleware.ts が未実装

**要件** (ARCHITECTURE.md lines 877-909):
- ソフトデリートミドルウェアの実装
- `delete` を `update`（ソフトデリート）に自動変換
- `findMany` / `findFirst` / `findUnique` で削除済みレコードの自動除外

**現在の状態**:
- `src/lib/prisma-middleware.ts` ファイルが存在しない
- 実装エージェントは作成すると報告していたが、実際には実装されていない

**影響**: 高的 - ソフトデリート機能が動作しない

**対象ファイル**:
- `jsmkc-app/src/lib/prisma-middleware.ts` - 新規作成が必要

**修正例**:
```typescript
// src/lib/prisma-middleware.ts
prisma.$use(async (params, next) => {
  if (['Player', 'Tournament', 'BMMatch'].includes(params.model!)) {
    if (params.action === 'delete') {
      params.action = 'update'
      params.args['data'] = { deletedAt: new Date() }
    }
    if (params.action === 'deleteMany') {
      params.action = 'updateMany'
      params.args.data['deletedAt'] = new Date()
    }
    if (params.action === 'findMany' || params.action === 'findFirst' || params.action === 'findUnique') {
      if (!params.args?.includeDeleted) {
        if (params.args.where) {
          params.args.where['deletedAt'] = null
        } else {
          params.args.where = { deletedAt: null }
        }
      }
    }
  }
  return next(params)
})
```

---

### ⚠️ 中程度問題: 一部のモデルに version フィールドが存在しない

**確認結果**:
- ✅ **実装済み**: Player, Tournament, BMMatch, MRMatch, GPMatch, TTEntry
- ❌ **未実装**: BMQualification, MRQualification, GPQualification

**問題点**:
- BMQualification, MRQualification, GPQualification モデルにも version フィールドが必要
- これらのモデルは win/loss/points などの更新が可能
- 同時に更新される可能性がある

**修正案**:
```prisma
model BMQualification {
  // 既存フィールド...
  version     Int      @default(0) // 楽観的ロック用
}

model MRQualification {
  // 既存フィールド...
  version     Int      @default(0) // 楽観的ロック用
}

model GPQualification {
  // 既存フィールド...
  version     Int      @default(0) // 楽観的ロック用
}
```

---

### ⚠️ 設計書からの逸脱: updateWithRetry のシグネチャ不一致

**設計書の要件** (lines 679-703):
```typescript
// 設計書の定義
export async function updateWithRetry<T>(
  updateFn: (currentVersion: number) => Promise<T>,
  maxRetries: number = 3
): Promise<T>
```

**実際の実装**:
```typescript
// 実際の実装
export async function updateWithRetry<T>(
  prisma: PrismaClient,
  updateFn: (tx: Prisma.TransactionClient) => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T>
```

**問題点**:
1. 設計書では `prisma` を引数に取らないが、実際の実装では必要
2. 設計書では `currentVersion` が渡されるが、実際の実装では渡されない
3. 設計書では `maxRetries` のみだが、実際の実装では複雑な `RetryConfig` を使用

**影響**: 低的 - 実装は動作するが、設計書との整合性がない

---

## 2. コード品質レビュー

### ❌ 深刻な問題: コードの重複（DRY原則違反）

**ファイル**: `jsmkc-app/src/lib/optimistic-locking.ts:71-244`

**問題コード**:
```typescript
// updateBMMatchScore (lines 71-112)
export async function updateBMMatchScore(...) {
  return updateWithRetry(prisma, async (tx) => {
    const current = await tx.bMMatch.findUnique({ where: { id: matchId } });
    if (!current) throw new OptimisticLockError('Match not found', -1);
    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(`Version mismatch...`, current.version);
    }
    const updated = await tx.bMMatch.update({ /* ... */ });
    return { version: updated.version };
  });
}

// updateMRMatchScore (lines 115-156) - ほとんど同じコード...
// updateGPMatchScore (lines 159-200) - ほとんど同じコード...
// updateTTEntry (lines 203-244) - ほとんど同じコード...
```

**問題点**:
- 4つの関数が90%以上の重複コード
- モデル名とフィールド名のみが異なる
- 保守性・拡張性が低い
- タイポのリスク

**修正案**:
```typescript
function createUpdateScoreFn(modelName: 'bMMatch' | 'mRMatch' | 'gPMatch' | 'tTEntry') {
  return async function updateScore(...) {
    return updateWithRetry(prisma, async (tx) => {
      // 共通のロジック
      const current = await tx[modelName].findUnique({ where: { id: matchId } });
      // ...
    });
  };
}

export const updateBMMatchScore = createUpdateScoreFn('bMMatch');
export const updateMRMatchScore = createUpdateScoreFn('mRMatch');
export const updateGPMatchScore = createUpdateScoreFn('gPMatch');
export const updateTTEntry = createUpdateScoreFn('tTEntry');
```

---

### ⚠️ 中程度問題: any 型の濫用

**ファイル**: `jsmkc-app/src/lib/optimistic-locking.ts`

**問題コード**:
```typescript
export async function updateBMMatchScore(
  prisma: PrismaClient,
  matchId: string,
  expectedVersion: number,
  score1: number,
  score2: number,
  completed: boolean = false,
  rounds?: any[],  // ← any 型
  // ...
): Promise<{ version: number }>
```

**問題点**:
- TypeScript の型安全性を損なう
- 実行時エラーのリスク
- IDE の補完機能が効かない

**修正案**:
```typescript
interface BMRound {
  arena: string;
  winner: 1 | 2;
  score1: number;
  score2: number;
}

export async function updateBMMatchScore(
  // ...
  rounds?: BMRound[],
  // ...
)
```

---

### ⚠️ 軽微な問題: OptimisticLockError の実装が設計書と異なる

**設計書の定義** (lines 672-677):
```typescript
export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OptimisticLockError'
  }
}
```

**実際の実装**:
```typescript
export class OptimisticLockError extends Error {
  constructor(message: string, public readonly currentVersion: number) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}
```

**評価**: 実際の実装の方が情報量が多く有用だが、設計書との整合性がない

---

## 3. 実装の詳細レビュー

### ✅ 正常実装: タイムアタックの時間パース関数

**ファイル**: `jsmkc-app/src/app/tournaments/[id]/ta/participant/page.tsx:49-61`

**修正後のコード**:
```typescript
function displayTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  
  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;
  
  const minutes = parseInt(parts[0]) || 0;
  const secondsParts = parts[1].split('.');
  const seconds = parseInt(secondsParts[0]) || 0;
  const milliseconds = parseInt(secondsParts[1]?.padEnd(3, '0').slice(0, 3)) || 0;
  
  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}
```

**評価**: ✅ 正しい実装、バグが修正されている

---

### ✅ 正常実装: GPページのコース選択

**ファイル**: `jsmkc-app/src/app/tournaments/[id]/gp/participant/page.tsx:14, 555-560`

**実装内容**:
```typescript
import { COURSE_INFO } from '@/lib/constants';

// ...
<SelectContent>
  {COURSE_INFO.map((course) => (
    <SelectItem key={course.abbr} value={course.abbr}>
      {course.name}
    </SelectItem>
  ))}
</SelectContent>
```

**評価**: ✅ 正しい実装、ハードコードが排除されている

---

### ⚠️ 軽微な問題: usePolling の visibilitychange ハンドラ

**ファイル**: `jsmkc-app/src/app/hooks/use-polling.ts:40-47`

**問題コード**:
```typescript
const handleVisibilityChange = () => {
  if (document.hidden) {
    clearInterval(intervalId);  // intervalId が古くなる可能性
  } else {
    fetchData();
  }
}
```

**問題点**:
- ページが非表示→表示された場合、新しい intervalId が設定されない
- visibilitychange イベントリスナーがクリーンアップされていない可能性

**修正案**:
```typescript
useEffect(() => {
  if (!url) return
  
  let intervalId: NodeJS.Timeout;
  const handleVisibilityChange = () => {
    if (document.hidden) {
      clearInterval(intervalId);
    } else {
      fetchData();
      intervalId = setInterval(fetchData, interval);
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  intervalId = setInterval(fetchData, interval);
  
  return () => {
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, [fetchData, interval, url]);
```

---

## 4. セキュリティレビュー

### ✅ 良好: 楽観的ロックによる競合処理

**評価**:
- version フィールドによる競合検出が実装されている
- 409 Conflict レスポンスの適切な処理
- 指数バックオフによる再試行

### ✅ 良好: トークンベース認証

**評価**:
- 参加者ページでトークン検証が実装されている
- API エンドポイントで認証チェックが行われている

### ⚠️ 確認事項: ソフトデリート middleware の欠如

**問題**:
- 設計書で要求されている soft delete middleware が未実装
- deletedAt フィールドは追加されているが、自动过滤の仕組みがない

**影響**:
- 削除されたレコードがクエリ結果に含まれる可能性
- データ整合性の問題

---

## 5. テスト状況レビュー

### 実装エージェント報告のテスト結果

```
✅ npm run build  # 成功
✅ npm run lint   # 成功（エラー0、警告0）
```

### 追加で確認が必要な項目

- [ ] BMQualification, MRQualification, GPQualification での楽観的ロック動作確認
- [ ] prisma-middleware.ts の実装後のテスト
- [ ] visibilitychange ハンドラの動作確認
- [ ] 累積的エラーバックオフのテスト

---

## 6. レビュ結果サマリー

### 重大な問題 (修正必須)

1. **prisma-middleware.ts 未実装** - ソフトデリート機能が動作しない
2. **BMQualification, MRQualification, GPQualification に version フィールドがない** - 一部のモデルで楽観的ロックが機能しない
3. **コードの重複** - DRY原則に違反、保守性が低い

### 中程度の問題 (本番前に修正推奨)

4. **設計書との逸脱** - updateWithRetry のシグネチャが設計書と異なる
5. **any 型の濫用** - 型安全性を損なっている
6. **usePolling の visibilitychange ハンドラの問題** - 潜在的なバグ

### 軽微な問題 (修正nice to have)

7. **OptimisticLockError の実装差異** - 設計書との差異
8. **usePolling の累積的バックオフ** - 実装の不完全さ

---

## 7. 修正アクション

### 実装エージェントへのフィードバック

以下の修正を最優先で行ってください：

1. **Priority 1 (最優先)**: prisma-middleware.ts の作成
   - 設計書の middleware.ts を実装
   - 全モデルにソフトデリートを適用

2. **Priority 1 (最優先)**: version フィールドの追加
   - BMQualification, MRQualification, GPQualification に version フィールドを追加

3. **Priority 2 (高)**: コードの重複解消
   - optimistic-locking.ts のリファクタリング
   - 共通関数の抽出

4. **Priority 3 (中)**: any 型の排除
   - 適切な型定義に変更

5. **Priority 4 (低)**: usePolling の修正
   - visibilitychange ハンドラの修正

### レビューチェックリスト

修正後、以下の項目を確認してください：

- [ ] prisma-middleware.ts が存在し、正しく動作すること
- [ ] 全モデルに version フィールドが追加されていること
- [ ] TypeScript コンパイルエラーがないこと
- [ ] ESLint エラー・警告がないこと
- [ ] 楽観的ロックが全モデルで動作すること
- [ ] ソフトデリートが正しく機能すること

---

## 8. 結論

**レビューステータス**: ⚠️ **重大な問題あり - 修正必須**

設計書との適合性において、以下の重要な問題が残っています：

1. **ソフトデリートミドルウェア未実装** - 設計書で明確に要求されている機能が実装されていない
2. **一部のモデルに version フィールドがない** - 一部機能が不完全
3. **コードの重複** - 保守性と拡張性に問題

IMPLEMENTED.md には「✅ 完全対応済み」と記載されていますが、実際には複数の重要な機能が未実装または不完全です。

**修正完了後、再レビューを依頼してください。**

---

**レビュー完了**

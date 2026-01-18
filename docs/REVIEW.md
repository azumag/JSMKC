# コードレビュ結果

**レビュー日**: 2026-01-19
**レビュアー**: レビューエージェント
**アーキテクチャバージョン**: 12.0

---

## 実行サマリー

デザイン設計書 docs/ARCHITECTURE.md と実装エージェントによる実装 docs/IMPLEMENTED.md を厳密にレビューしました。

**Overall Status**: ❌ **重大な問題あり - 修正必須**

---

## 1. アーキテクチャ適合性レビュー

### ❌ 致命的問題: Optimistic Locking 未実装

**要件** (ARCHITECTURE.md lines 640-808):
- 全ての更新可能なモデルには楽観的ロック用の `version` フィールドが必要
- `updateWithRetry` 関数を指数バックオフと共に実装する必要がある
- APIエンドポイントはバージョンベースの条件付き更新を使用する必要がある

**現在の状態**:
- `BMMatch`, `MRMatch`, `GPMatch` モデルに `version` フィールドが存在しない
- `OptimisticLockError` クラスが実装されていない
- `updateWithRetry` ユーティリティ関数が見つからない
- 楽観的ロックミドルウェアが存在しない

**影響**: 高的 - 同時編集時にデータの破損や更新ロストの可能性

**対象ファイル**:
1. `prisma/schema.prisma` - Match モデルに `version Int @default(0)` を追加
2. `src/lib/optimistic-locking.ts` - 新規作成
3. 全ての PUT API ルートを更新して楽観的ロックを使用

**修正例**:
```typescript
// prisma/schema.prisma
model BMMatch {
  id          Int      @id @default(autoincrement())
  // ... existing fields ...
  version     Int      @default(0) // 楽観的ロック用
}

// src/lib/optimistic-locking.ts
export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OptimisticLockError'
  }
}

export async function updateWithRetry<T>(
  updateFn: (currentVersion: number) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  // ... implementation with exponential backoff
}
```

---

## 2. コード品質レビュー

### 深刻な問題: TypeScript型の安全性不足

#### 2.1 タイムアタックの時間パース関数にバグ

**ファイル**: `jsmkc-app/src/app/tournaments/[id]/ta/participant/page.tsx:48-61`

**問題コード**:
```typescript
function displayTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  
  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;
  
  const minutes = parseInt(parts[0]) || 0;
  const [, secondsStr] = parts[1].split('.');  // ← 問題: secondsStr は "SS.mmm" 全体
  const seconds = parseInt(secondsStr) || 0;    // ← 問題: "SS.mmm" をパースしようとしている
  const milliseconds = parseInt(secondsStr.split('.')[1]) || 0; // ← 問題
  
  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}
```

**修正案**:
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

#### 2.2 GPページのコース選択にハードコードされた値

**ファイル**: `jsmkc-app/src/app/tournaments/[id]/gp/participant/page.tsx:536-547`

**問題コード**:
```typescript
<SelectContent>
  {CUPS.map((cup) => (
    <SelectItem key={cup} value={cup} disabled>
      {cup} Cup
    </SelectItem>
  ))}
  {/* We'll need to add courses per cup - for now using generic courses */}
  <SelectItem value="Course1">Course 1</SelectItem>
  <SelectItem value="Course2">Course 2</SelectItem>
  <SelectItem value="Course3">Course 3</SelectItem>
  <SelectItem value="Course4">Course 4</SelectItem>
</SelectContent>
```

**問題点**:
- コメントアウトされたコードが残っている
- ハードコードされたコース名を使用している
- `COURSE_INFO` がインポートされていない

**修正案**:
```typescript
import { COURSE_INFO } from '@/lib/constants';

// SelectContent 内
<SelectContent>
  {COURSE_INFO.map((course) => (
    <SelectItem key={course.abbr} value={course.abbr}>
      {course.name}
    </SelectItem>
  ))}
</SelectContent>
```

### ⚠️ 中程度の問題: セキュリティ上の考慮事項

#### 3.1 トークン検証のセキュリティ

**ファイル**: 全ての participant ページ

**現在の実装**:
```typescript
const validateResponse = await fetch(`/api/tournaments/${tournamentId}/token/validate`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-tournament-token': token,
  },
});
```

**改善提案**:
- トークン検証失敗時に詳細なエラーメッセージを返さない
- レート制限が適切に適用されていることを確認
- IPアドレスベースのログが記録されていることを確認

#### 3.2 プレイヤー選択時の本人認証

**現在の実装**: プレイヤーが自分自身のプロフィールを選択する形式

**問題点**: プレイヤー選択が UI 上での自己宣言のみであり、API レベルで playerId を送信する際に本人確認が行われているか確認が必要

**確認事項**:
- `/api/tournaments/[id]/bm/match/[id]/report` エンドポイントで playerId の所有権検証が行われているか
- 他のレポート API エンドポイントでも同様の検証があるか

### ⚠️ 軽微な問題: ユーザビリティ

#### 4.1 エラー表示の改善

全ての participant ページで `setError` を使用しているが、エラーがクリアされるタイミングが不明確

**改善案**:
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    setError(null);
  }, 5000);
  return () => clearTimeout(timer);
}, [error]);
```

#### 4.2 ローディング状態の改善

ローディング状態がテキストのみであり、プログレスインジケーターがない

---

## 3. 設計書との適合性レビュー

### ✅ 実装済み

| 機能 | 状態 | ファイル |
|------|------|----------|
| トークンベース認証 | ✅ | 全 participant ページ |
| モバイルフレンドリーUI | ✅ | Tailwind CSS 使用 |
| ゲームモード選択UI | ✅ | participant/page.tsx |
| バトルモードスコア入力 | ✅ | bm/participant/page.tsx |
| マッチレース入力 | ✅ | mr/participant/page.tsx |
| グランプリ入力 | ✅ | gp/participant/page.tsx |
| タイムアタック入力 | ✅ | ta/participant/page.tsx |
| セキュリティ警告表示 | ✅ | Alert コンポーネント使用 |

### ❌ 未実装 / 問題あり

| 機能 | 状態 | 詳細 |
|------|------|------|
| 楽観的ロック | ❌ Missing | version フィールド未追加 |
| リアルタイム更新 (Polling) | ⚠️ 未確認 | usePolling フックが見当たらない |
| 運営負荷の軽減 | ⚠️ 部分実装 | 確認・修正UIが必要 |

### 📋 Architecture.md 適合性

**Section 5.7 (参加者スコア入力機能)**:
- ✅ 自己申告: 両プレイヤーが入力、一致で自動確定
- ✅ 認証なしアクセス: トーナメントURLで入力可能
- ✅ モバイルフレンドリーUI: レスポンシブデザイン
- ❌ 同時編集時の競合処理: 楽観的ロック未実装

**Section 6.3 (URLトークン仕様)**:
- ✅ 32文字Hex文字列: API側で実装
- ✅ 24時間有効期限: API側で管理
- ✅ レート制限: API側で実装
- ⚠️ 入力ログ: 確認が必要

---

## 4. セキュリティレビュー

### 重大な脆弱性なし ✅

- トークンが URL パラメータで送信されているが、HTTP Only Cookie での管理が推奨される
- 入力バリデーションが適切に行われている
- エラーメッセージが詳細すぎない

### 改善推奨事項

1. **CSP ヘッダーの確認**: 設計書で指定されている CSP が実装されているか確認
2. **入力サニタイゼーション**: プレイヤー名などの入力が適切にサニタイズされているか確認
3. **レート制限**: 設計書の10回/分が遵守されているか確認

---

## 5. テスト状況レビュー

### 現状

- 参加者UIのユニットテストが見つからない
- E2E テストが未実装
- TypeScript 型エラー: なし ✅
- ESLint エラー: なし ✅

### 推奨テスト項目

1. トークン検証フロー
2. プレイヤー選択とマッチ表示
3. スコア報告と競合検出
4. タイム入力のバリデーション
5. エラーハンドリング

---

## 6. レビュ結果サマリー

### 重大な問題 (修正必須)

1. **楽観的ロック未実装** - 設計書で要求されている version フィールドと updateWithRetry 関数を実装してください
2. **タイムアタックの時間パース関数にバグ** - displayTimeToMs 関数を修正してください
3. **GPページのコース選択がハードコード** - COURSE_INFO を使用するように修正してください

### 中程度の問題 (本番前に修正推奨)

4. **Polling の実装がない** - 設計書で指定されている usePolling フックを実装してください
5. **プレイヤー選択の本人確認** - API レベルで playerId の所有権検証を確認・実装してください

### 軽微な問題 (修正nice to have)

6. **エラー自動クリア機能**
7. **ローディング状態の改善**

---

## 7. 修正アクション

### 実装エージェントへのフィードバック

以下の修正を行ってください:

1. **Priority 1 (最優先)**: Optimistic Locking の実装
   - `prisma/schema.prisma` に version フィールドを追加
   - `src/lib/optimistic-locking.ts` を作成
   - 全てのスコア報告 API を更新

2. **Priority 2 (高)**: タイムアタックの時間パース関数を修正
   - `displayTimeToMs` 関数のロジックを修正

3. **Priority 3 (中)**: GPページのコース選択を修正
   - `COURSE_INFO` をインポート
   - ハードコードされた値を削除

4. **Priority 4 (中)**: Polling の実装
   - `usePolling` フックを実装
   - 参加者ページにポーリングを追加

### レビューチェックリスト

修正後、以下の項目を確認してください:

- [ ] TypeScript コンパイルエラーなし
- [ ] ESLint エラー・警告なし
- [ ] 楽観的ロックが動作することを確認
- [ ] 全ゲームモードでスコア報告が動作することを確認
- [ ] テストを追加・実行すること

---

## 8. 結論

**レビューステータス**: ❌ **重大な問題あり - 修正必須**

設計書に基づいた重要な機能（楽観的ロック）が未実装であり、また既存コードにバグが存在します。本番環境にデプロイする前に、必ず全ての重大な問題を修正してください。

修正完了後、再レビューを依頼してください。

---

**レビュー完了**

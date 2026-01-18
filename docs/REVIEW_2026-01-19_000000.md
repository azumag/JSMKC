# JSMKC 実装レビュードキュメント

作成日: 2026-01-19

## レビューの概要

設計書 docs/ARCHITECTURE.md に基づき、実装内容のレビューを実施しました。実装エージェントによる作業内容は docs/IMPLEMENTED.md として保存されるべきですが、本レビューではコードベースの直接レビューを行いました。

**レビューの結論**: ❌ **重大な問題が発見されたため、修正が必要**

---

## 重大な問題 (Critical Issues)

### 1. ESLintエラーが9件存在

以下のファイルで ESLint エラーが発生しており、コードの品質に影響を与えています:

**ファイル: `/jsmkc-app/src/app/api/tournaments/[id]/bm/match/[matchId]/report/route.ts`**
- 行 177: `stats` が再代入されていないため `const` を使用すべき (`prefer-const`)

**ファイル: `/jsmkc-app/src/app/api/tournaments/[id]/bm/route.ts`**
- 行 214: `p1Stats` が再代入されていないため `const` を使用すべき
- 行 232: `p2Stats` が再代入されていないため `const` を使用すべき

**ファイル: `/jsmkc-app/src/app/api/tournaments/[id]/gp/match/[matchId]/report/route.ts`**
- 行 75: `any` 型が使用されている (`@typescript-eslint/no-explicit-any`)
- 行 146: `any` 型が使用されている

**ファイル: `/jsmkc-app/src/app/api/tournaments/[id]/mr/route.ts`**
- 行 169: `p1Stats` が再代入されていないため `const` を使用すべき
- 行 186: `p2Stats` が再代入されていないため `const` を使用すべき

**ファイル: `/jsmkc-app/src/lib/audit-log.ts`**
- 行 10: `any` 型が使用されている
- 行 23: `any` 型が使用されている

**推奨アクション**: `npm run lint -- --fix` で自動的に修正可能なエラーを修正し、残りのエラーを手動で修正してください。

### 2. 認証チェックの不備

**問題**: Grand Prix の POST ルーター (`/jsmkc-app/src/app/api/tournaments/[id]/gp/route.ts`) に認証チェックがありません。

設計書では「トーナメント作成・編集・削除」に認証が必要と定義されていますが、GP のセットアップ（プレイヤー追加・グループ作成）は認証なしで実行可能です。

```typescript
// 現在の実装 (行 49-52)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;
    // 認証チェックがない ❌
```

**推奨アクション**: Battle Mode の実装を参考に、認証チェックを追加してください:

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  // ... 残りの実装
}
```

### 3. レート制限のメモリベース実装

**問題**: `/jsmkc-app/src/lib/rate-limit.ts` で実装されているレート制限はメモリベースの Map を使用していますが、Vercel などのサーバーレス環境では動作しません。

```typescript
// 現在の実装 (行 12)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
```

**問題点**:
- サーバーレス環境では複数のインスタンスが起動するため、各インスタンスのメモリが共有されない
- インスタンスが再起動するとレート制限のカウントがリセットされる
- 大量の同時接続がある場合、メモリ使用量が増加する

**推奨アクション**: 
- Vercel KV (Redis) または Upstash Redis を使用するよう変更
- または、architecturer で指定された `@upstash/ratelimit` と `@upstash/redis` を導入

---

## 中程度の問題 (Medium Issues)

### 4. 未使用の変数

複数のファイルで未使用の変数が検出されています:

| ファイル | 行 | 変数 | 重要度 |
|---------|-----|------|--------|
| `/jsmkc-app/src/app/api/tournaments/[id]/bm/route.ts` | 222 | `r2` | 中 |
| `/jsmkc-app/src/app/tournaments/[id]/bm/page.tsx` | 221 | `errorMessage` | 低 |
| `/jsmkc-app/src/app/tournaments/[id]/gp/page.tsx` | 274 | `errorMessage` | 低 |
| `/jsmkc-app/src/app/tournaments/[id]/mr/page.tsx` | 264 | `errorMessage` | 低 |
| `/jsmkc-app/src/components/tournament/double-elimination-bracket.tsx` | 167 | `roundNames` | 低 |
| `/jsmkc-app/src/lib/double-elimination.ts` | 167 | `loserMatch` | 低 |
| `/jsmkc-app/src/lib/rate-limit.ts` | 20 | `windowStart` | 低 |
| `/jsmkc-app/src/lib/rate-limit.ts` | 86 | `userAgent` | 低 |

**推奨アクション**: これらの変数を削除するか、コメントで意図を説明してください。

### 5. TypeScriptの型安全性の問題

**問題**: いくつかの場所で `any` 型が使用されています:

- `/jsmkc-app/src/lib/audit-log.ts`: `details` パラメータ
- `/jsmkc-app/src/app/api/tournaments/[id]/gp/match/[matchId]/report/route.ts`: API レスポンスの型

**推奨アクション**: 適切な型定義を使用してください:

```typescript
// audit-log.ts の推奨修正
export interface AuditLogParams {
  userId?: string;
  ipAddress: string;
  userAgent: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, unknown>; // any ではなく unknown を使用
}
```

### 6. エラーハンドリングの不整合

各 API ルートでエラーハンドリングの形式が統一されていません:

- 一部のルートでは `{ error: "メッセージ" }` を返す
- 一部のルートでは `{ success: false, error: "メッセージ" }` を返す
- 設計書では `{ success: false, error: "エラーメッセージ" }` が標準と定義されている

**影響を受けるファイル**:
- `/jsmkc-app/src/app/api/tournaments/[id]/bm/route.ts`
- `/jsmkc-app/src/app/api/tournaments/[id]/gp/route.ts`
- `/jsmkc-app/src/app/api/tournaments/[id]/mr/route.ts`

**推奨アクション**: 全ての API エラーレスポンスを統一された形式に修正してください。

---

## 軽微な問題 (Minor Issues)

### 7. 定数の命名規則の不一致

コードベース全体で定数の命名規則に一貫性がありません:

- 一部の場所では `UPPER_SNAKE_CASE` を使用
- 一部の場所では `camelCase` を使用

**例**:
```typescript
// 定数の例
const COURSES = ["MC1", "DP1", ...]; // PascalCase で定義されている
const CUPS = ["Mushroom", "Flower", ...]; // PascalCase で定義されている
const StageSchema = z.enum(["qualification", "finals"]); // PascalCase
```

**推奨アクション**: 定数は一貫して `UPPER_SNAKE_CASE` を使用するか、PascalCase を使用するか統一してください。

### 8. ドキュメントの欠如

以下のコンポーネント/関数に JSDoc コメントがありません:

- `/jsmkc-app/src/lib/hooks/usePolling.ts`
- `/jsmkc-app/src/lib/excel.ts`
- `/jsmkc-app/src/lib/rate-limit.ts`

**推奨アクション**: 公開 API には JSDoc コメントを追加してください。

---

## セキュリティ上の考慮事項

### 9. CSP ヘッダーの本番環境での設定

**問題**: `/jsmkc-app/src/middleware.ts` で CSP ヘッダーが動的に生成されていますが、`nonce` の値が response headers には設定されていません。これにより、本番環境でインラインスクリプトが実行されない可能性があります。

```typescript
// 現在の実装 (行 60-69)
if (process.env.NODE_ENV === 'production') {
  const nonce = generateNonce()
  response.headers.set('Content-Security-Policy', [
    `script-src 'self' 'nonce-${nonce}'`,
    // nonce はヘッダーでは設定されているが、React コンポーネントには渡されていない
  ]);
}
```

**推奨アクション**: nonce を React コンポーネントに渡す方法を確認するか、script-src に `'unsafe-inline'` を追加するか、別のアプローチを検討してください。

### 10. GitHub Organization メンバー検証の頻度

**問題**: `/jsmkc-app/src/lib/auth.ts` で GitHub Organization のメンバー検証がサインインごとに実行されています。これは API レート制限に達する可能性があります。

```typescript
// 現在の実装 (行 26-31)
const response = await fetch('https://api.github.com/user/orgs', {
  headers: {
    Authorization: `Bearer ${account.access_token}`,
    Accept: 'application/vnd.github.v3+json',
  },
});
```

**推奨アクション**: メンバー検証の結果をデータベースにキャッシュし、定期的に更新するアプローチを検討してください。

---

## パフォーマンス上の考慮事項

### 11. ポーリングによるサーバー負荷

**問題**: 3 秒間隔のポーリングが実装されていますが、同時接続ユーザー数が増加するとサーバー負荷が大きくなる可能性があります。

**設計書からの引用**:
> Polling方式（採用）: 3秒間隔でサーバーをポーリング
> - メリット: 実装がシンプル、Vercelで動作
> - デメリット: サーバー負荷増、更新遅延

**現在の実装**:
- 全員が同じ間隔でポーリングするため、負荷がスパイクする可能性がある
- ページが非表示の場合はポーリングを停止する最適化は実装されている (`usePolling.ts:86-98`)

**推奨アクション**:
- ポーリング間隔にランダムなジッターを追加して負荷を分散
- または、将来的に Pusher 等のリアルタイムサービスへの移行を検討

### 12. データベースクエリの最適化

**問題**: 一部の API ルーターで `Promise.all` が使用されていないため、データベースクエリが直列で実行されています。

**例** (`/jsmkc-app/src/app/api/tournaments/[id]/bm/route.ts`):
```typescript
// 直列実行 ❌
const player1Matches = await prisma.bMMatch.findMany({ ... });
const player2Matches = await prisma.bMMatch.findMany({ ... });
```

**推奨アクション**: `Promise.all` を使用して並列実行してください:

```typescript
// 並列実行 ✅
const [player1Matches, player2Matches] = await Promise.all([
  prisma.bMMatch.findMany({ ... }),
  prisma.bMMatch.findMany({ ... }),
]);
```

---

## アーキテクチャとの整合性

### 13. 実装済み機能の検証

設計書で「既に実装済みの機能」として記載されている項目と実際の実装を比較:

| 機能 | 設計書 | 実装状況 |
|------|--------|----------|
| プレイヤー管理 | ✅ 実装済み | ✅ 実装済み |
| トーナメント管理 | ✅ 実装済み | ✅ 実装済み |
| バトルモード予選 | ✅ 実装済み | ✅ 実装済み |
| バトルモード決勝 | ✅ 実装済み | ✅ 実装済み |
| タイムアタックAPI | ✅ 実装済み | ✅ 実装済み |
| 参加者スコア入力API | ✅ 実装済み | ✅ 実装済み |

### 14. 実装予定機能の検証

設計書で「実装予定」として記載されている項目と現在の実装を比較:

| 機能 | 設計書 | 実装状況 |
|------|--------|----------|
| タイムアタックUI | ❌ 未実装 | ✅ 実装済み |
| マッチレース（予選・決勝） | ❌ 未実装 | ✅ 実装済み |
| グランプリ（予選・決勝） | ❌ 未実装 | ✅ 実装済み |
| 参加者スコア入力UI | ❌ 未実装 | ✅ 実装済み |
| リアルタイム順位表示 | ❌ 未実装 | ✅ 実装済み |
| 結果エクスポート（Excel） | ❌ 未実装 | ✅ 実装済み |

**結論**: 設計書で「実装予定」とされていた機能は全て実装されています。

---

## 推奨される修正の優先順位

| 優先度 | 項目 | 修正estimated時間 |
|--------|------|------------------|
| P0 (即座) | ESLint エラーの修正 | 30分 |
| P0 (即座) | GP POST ルーターへの認証追加 | 15分 |
| P1 (24時間以内) | レート制限の Redis 対応 | 2時間 |
| P1 (24時間以内) | `any` 型の型安全性向上 | 1時間 |
| P2 (週内) | エラーハンドリングの統一 | 1時間 |
| P2 (週内) | 未使用変数の削除 | 30分 |
| P3 (随時) | 定数命名規則の統一 | 1時間 |
| P3 (随時) | JSDoc コメントの追加 | 2時間 |

---

## まとめ

実装されたコードは基本的な機能が動作し、設計書で求められた主要機能は実装されています。しかし、以下の問題を修正する必要があります:

1. **即座に修正すべき**: ESLint エラーと認証チェックの不備
2. **速やかに修正すべき**: レート制限のインフラ対応と型の安全性
3. **品質向上として修正すべき**: コードの一貫性とドキュメント

これらの修正を行わない場合、本番環境での動作に影響を与える可能性があります。実装エージェントにフィードバックを行い、修正を依頼することを推奨します。

---

## チェックリスト

- [ ] ESLint エラーを全て修正 (9件)
- [ ] GP POST ルーターに認証を追加
- [ ] レート制限を Redis 対応に修正
- [ ] `any` 型を適切な型に修正
- [ ] API エラーレスポンス形式を統一
- [ ] 未使用変数を削除
- [ ] CSP nonce の対応を検証
- [ ] データベースクエリの並列化を適用

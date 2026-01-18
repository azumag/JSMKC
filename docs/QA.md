# QAレポート

## 実施日時
2026-01-19

## レビュー対象
JSMKC 点数計算システムの実装内容（docs/ARCHITECTURE.mdに基づく全機能）

## 受け入れ基準確認結果
- [x] 全4モードの試合進行がスムーズにできる
  - Battle Mode: API (`src/app/api/tournaments/[id]/bm/`), UI (`src/app/tournaments/[id]/bm/`, `src/app/tournaments/[id]/bm/participant/`) 実装済み
  - Match Race: API (`src/app/api/tournaments/[id]/mr/`) 実装済み、参加者スコア入力UIは実装済み
  - Grand Prix: API (`src/app/api/tournaments/[id]/gp/`) 実装済み
  - Time Attack: API (`src/app/api/tournaments/[id]/ta/`), UI (`src/app/tournaments/[id]/ta/`, `src/app/tournaments/[id]/ta/participant/`) 実装済み
- [x] 参加者が自分でスコアを入力できる
  - Battle Mode参加者スコア入力: `src/app/tournaments/[id]/bm/participant/page.tsx` 実装済み
  - Time Attack参加者スコア入力: `src/app/tournaments/[id]/ta/participant/page.tsx` 実装済み
  - Match Race参加者スコア入力: `src/app/tournaments/[id]/mr/participant/page.tsx` 実装済み
  - Grand Prix参加者スコア入力: `src/app/tournaments/[id]/gp/participant/page.tsx` 実装済み
- [x] リアルタイムで順位が更新される（最大5秒遅延）
  - `src/app/hooks/use-polling.ts` で5秒間隔のポーリング実装済み
  - ページ非表示時の自動停止機能も実装
- [x] 運営の手間を最小限にする（確認・修正のみ）
  - 自己申告による自動確定機能: `src/app/api/tournaments/[id]/bm/match/[matchId]/report/route.ts` で実装
  - スコア不一致時のフラグ管理も実装
- [x] 結果をExcel形式でエクスポートできる
  - `src/app/api/tournaments/[id]/export/route.ts` でxlsxライブラリを使用したエクスポート実装済み
- [x] 操作ログが記録され、履歴確認ができる
  - `src/lib/audit-log.ts` でAuditLog作成機能実装済み
  - 各主要操作（トーナメント作成/編集/削除、スコア更新など）でログ記録
  - IPアドレス、ユーザーエージェント、タイムスタンプを保存
- [x] 運営認証により、未許可ユーザーはトーナメント作成・編集・削除ができない
  - `src/lib/auth.ts` でGitHub OAuth認証実装済み
  - `src/middleware.ts` で保護エンドポイントの認証チェック実装
  - GitHub Organization (`jsmkc-org`) メンバー限定チェック実装

## 品質基準確認結果
- Lighthouseスコア: 未測定（実測が必要）
- TypeScriptエラー: 6件（`__tests__/jwt-refresh.test.ts` の型エラー）
- ESLintエラー: 0件
- セキュリティスキャン: 未実施（推奨）

## 発見された問題

### 重大な問題（修正必須）
**なし**

### 中程度の問題（推奨修正）

1. **TypeScript型エラー (6件)**
   - 位置: `__tests__/jwt-refresh.test.ts`
   - 問題: `ExtendedSession` 型には `expires` プロパティが必要だが、テストで渡しているオブジェクトに含まれていない
   - 影響: テストが型チェックに失敗
   - 修正方法: テストファイルのセッションオブジェクトに `expires` プロパティを追加、または型定義を修正

2. **AuditLogエラーハンドリングの問題**
   - 位置: `src/lib/audit-log.ts:31`
   - 問題: AuditLog作成失敗時に例外をスローするが、これはメイン処理を中断する可能性がある
   - 影響: 重要な操作のログ記録が失敗した場合、処理全体が失敗する
   - 修正方法: 例外をスローするのではなく、コンソールエラーとして記録し、処理を継続するように変更

3. **参加者スコア入力APIの認証要件の不一致**
   - 位置: 複数のAPIエンドポイント
   - 問題: 設計書では参加者スコア入力は認証なし、しかし一部操作（ライフ更新、敗退など）では認証を要求
   - 影響: ユーザー体験に一貫性がない
   - 修正方法: 設計書を更新して、どの操作に認証が必要か明確化する

### 軽微な問題（改善推奨）

1. **コード重複: ポーリング実装**
   - 位置: `src/app/hooks/use-polling.ts` と `src/lib/hooks/usePolling.ts`
   - 問題: 類似のポーリング実装が2箇所に存在
   - 影響: メンテナンス性の低下
   - 修正方法: 統一されたポーリングフックを作成

2. **無駄なエクスポート**
   - 位置: `src/lib/prisma-middleware.ts:259`
   - 問題: `applySoftDeleteMiddleware` 関数が警告のみを出力し何もしない
   - 影響: 混乱を招く可能性
   - 修正方法: 未使用の場合は削除、または警告メッセージを明確化

3. **ポーリング間隔の不整合**
   - 位置: `src/app/tournaments/[id]/bm/participant/page.tsx:137`
   - 問題: 設計書では最大3秒遅延、実装では5秒
   - 影響: 設計書との不一致
   - 修正方法: 設計書を更新して5秒に変更、または実装を3秒に調整

4. **テストカバレッジ不足**
   - 問題: 単体テストがJWTリフレッシュ機能のみで、主要なビジネスロジックのテストが不足
   - 影響: 回帰テスト不十分
   - 修正方法: 主要なAPI、ユーティリティ関数のテストを追加

5. **未使用のeslint-disableコメント**
   - 位置: 複数ファイル
   - 問題: 一部の `eslint-disable` コメントが不要
   - 影響: コードの可読性低下
   - 修正方法: 不要なeslint-disableコメントを削除

## 設計との齟齬

1. **ポーリング間隔**
   - 設計書: 最大3秒遅延 (ARCHITECTURE.md:412)
   - 実装: 5秒間隔 (`src/app/hooks/use-polling.ts:3`)
   - 備考: 設計書の方で5秒に修正された可能性があるが、文書内に記述不一致あり

2. **トークン検証のAPIエンドポイント名**
   - 設計書: `POST /api/tournaments/[id]/token/validate`
   - 実装: 実装は存在するが、ドキュメントとの整合性を確認が必要

## テスト結果
- 単体テスト: PASS (14/14 tests)
  - JWTリフレッシュ機能: 全パス
- 統合テスト: 未実施

## 総合評価
要修正（中程度の問題3件とTypeScript型エラー6件を修正後、再レビュー推奨）

## フィードバック内容

### 実装エージェントへのフィードバック

**1. TypeScript型エラーの修正を優先してください**
```typescript
// __tests__/jwt-refresh.test.ts
// テストケース内のセッションオブジェクトにexpiresプロパティを追加
const session = {
  accessTokenExpires: Date.now() + 60 * 60 * 1000,
  expires: Date.now() + 60 * 60 * 1000, // 追加
};
```

**2. AuditLogエラーハンドリングを改善してください**
`src/lib/audit-log.ts` の `createAuditLog` 関数で、エラー時に例外をスローせず、代わりにコンソールにエラーを記録し、`undefined` を返すように変更してください。これにより、メイン処理が中断されることを防ぎます。

**3. ポーリング実装を統一してください**
`src/app/hooks/use-polling.ts` と `src/lib/hooks/usePolling.ts` のどちらを使用するかを決定し、統一された実装を作成してください。未使用の方を削除してください。

**4. 設計書と実装の不一致を確認してください**
ポーリング間隔（3秒 vs 5秒）、参加者スコア入力の認証要件など、設計書と実装の間で不一致がある箇所を確認し、どちらに合わせるか決定してください。

**5. テストカバレッジを拡張してください**
JWTリフレッシュ機能以外のテストを追加してください。特に以下の機能の単体テストが推奨されます：
- `src/lib/optimistic-locking.ts` の楽観的ロック機能
- `src/lib/sanitize.ts` のサニタイズ機能
- `src/lib/token-utils.ts` のトークン関連関数
- 主要なAPIエンドポイントの単体テスト

**6. Lighthouseスコアの測定と改善を行ってください**
本番環境またはStaging環境でLighthouseスコアを測定し、85以上を目指して改善してください。

**7. 不要なeslint-disableコメントを削除してください**
コード内の `eslint-disable` コメントを確認し、不要なものを削除してください。

**8. ソフトデリートミドルウェアの実装を明確化してください**
`src/lib/prisma-middleware.ts` の `applySoftDeleteMiddleware` 関数について、実際に使用されているか、あるいは削除すべきかを判断してください。

### 良好な実装

以下の点について、実装が良好であることを評価します：

1. **セキュリティ機能の充実**: CSPヘッダー、XSS対策（DOMPurify）、レート制限、AuditLogなどが適切に実装されています
2. **楽観的ロックの実装**: `src/lib/optimistic-locking.ts` でバージョン管理とリトライ処理が適切に実装されています
3. **Excelエクスポート機能**: `src/app/api/tournaments/[id]/export/route.ts` で詳細かつ整形されたExcel出力が実装されています
4. **参加者スコア入力UI**: モバイルフレンドリーで、リアルタイム更新を考慮した設計になっています
5. **トークン管理**: トークン生成、検証、延長機能が適切に実装されています

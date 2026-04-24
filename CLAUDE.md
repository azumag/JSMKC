# CLAUDE.md

# BASE
- research the industry-standard approach to this problem use it to guide yours"
- Detailed comments must be included in the source code to justify the implementation of such logic
- use T-wada TDD
- 機能実装時は、必ずE2Eシナリオを追加し、対応するe2eテストを更新すること

## Review
- コードの重複や簡潔性、無駄なファイルを作っていないかどうか、使いやすさ、セキュリティリスク、コ>ストなどのあらゆる点について厳しく指摘してください
- レビュー修正した後は再度レビューを実施し、レビューの指摘が完全にクリアされるまで、修正とレビュ>ーを繰り返せ
- テストに失敗したら、作業に関係なくとも、修正すること

## review aspects
- Code quality and best practices
- Potential bugs and edge cases
- Performance implications
- Security considerations
- **コードの簡潔性**: 過度な抽象化や複雑化を避ける
- 単体テストのカバレッジは十分か？
- YAGNI の原則に乗っ取り、過剰な実装と設計を避ける

# Project Overview

JSMKC (Japan SMK Championship) is a tournament management and scoring system for competitive SMK events. Built with Next.js 16 (App Router) and React 19.

## SRC
under `./smkc-score-app`

### E2E Test Loop (定期E2Eテスト)

本番環境 https://smkc.bluemoon.works/ に対して定期的にE2Eテストを実施し、問題を発見・修正・デプロイ・検証する。

### E2Eテストの実行方法

**セッション管理**: Playwright永続プロファイルのセッションをそのまま使う。テスト中にログイン/ログアウトは**絶対に行わない**。認証なし確認（TC-107等）は `https` モジュールでブラウザ外から行う。

#### スクリプト化済みTC
- `node e2e/tc-all.js` で全TCを一括実行（セッション維持）
- FAILした場合のみClaudeが手動で再確認・修正

#### 未スクリプト化TC（新規追加されたもの）
- Claudeが `E2E_TEST_CASES.md` のシナリオを読み、Playwright永続プロファイルで手動実行
- **PASSしたTCは `e2e/tc-all.js` に追加し、次回以降は自動実行に移行**

#### フロー
1. `e2e/tc-all.js` を実行して既存TC全体を確認
2. 未スクリプト化TCがあればClaude手動実行
3. 手動PASSしたTC → `e2e/tc-all.js` に追加、commit
4. 修正を行った場合は関連するTCを重点的に確認

### ブラウザ認証（Playwright）

- Chrome for Testing ではなく **Playwright永続プロファイル** を使用
- 初回のみDiscord OAuthで手動認証が必要。以降はセッションcookieが保持される

```js
// smkc-score-app/ ディレクトリから実行（playwright が devDependencies にある）
const { chromium } = require('playwright');
const browser = await chromium.launchPersistentContext(
  '/tmp/playwright-smkc-profile',
  { headless: false, viewport: { width: 1280, height: 720 } }
);
```

セッション切れ時は自動でサインインページを開き、Discordログインボタンをクリック→ユーザーに認証を促す。

### テスト内容

**【重要】表示テストだけでなく、フルトーナメントワークフローを実行すること。**

各ループで以下の2段階を実行する:

#### Phase A: フルトーナメントワークフロー

テスト用データを作成し、大会の一通りの流れを実行して検証する。終了後にテストデータはクリーンアップする。

1. **プレイヤー作成** (8名)
2. **トーナメント作成**
3. **BM予選**: セットアップ → 全試合スコア入力 → 順位表確認
4. **BM決勝**: ブラケット作成 → QF4試合スコア入力 (best-of-9, max=5) → ブラケット確認
5. **MR予選**: セットアップ → 全試合スコア入力 → 順位表確認
6. **GP予選**: セットアップ → 全試合スコア入力 (5レース, ドライバーポイント) → 順位表確認
7. **TA予選**: エントリー追加 → 全20コースタイム入力 → 順位表確認
8. **総合ランキング**: API確認
9. **ページ表示検証**: 全モードページ + Overall + BM Finals でコンテンツが表示されること
10. **クリーンアップ**: トーナメント・プレイヤー削除

#### Phase B: 既存データ検証 + セキュリティ + CRUD

1. **ページの中身と動作確認** (HTTPステータスコード200だけでは不十分):
   - 「Failed to fetch」「500」「再試行」エラーが表示されていないこと
   - トーナメント名・モード名・ボタン等のコンテンツが実際に表示されていること
   - 8秒以上待ってから判定（fetchWithRetry のリトライ時間を考慮）
2. **プレイヤーCRUD**: 追加・編集・パスワードリセット・削除が動作すること
3. **パスワード漏洩チェック**: APIレスポンスに `password` フィールドが含まれないこと
4. **セキュリティヘッダー**: CSP, X-Frame-Options 等がホームページにも付与されていること
5. **パフォーマンス**: 各APIの応答時間 (3回平均)、1000ms超を SLOW として報告

#### Phase C: GitHub Issue修正 (問題なし時)

E2Eテストが全パスし、修正すべき問題がない場合:

1. `gh issue list --state open --limit 10` で未解決issueを確認（**resolvedラベル付きは対象外**）
2. 優先度の高いissueを1つ選んで修正（大型でも避けない）
3. テスト追加 → 修正 → レビュー → コミット → デプロイ → E2E再検証
4. 解決したissueに **`resolved` ラベルを付与**（closeはしない）

```bash
gh issue list --state open --limit 10
gh issue view <number>
# 解決時:
gh issue edit <number> --add-label resolved
```

### デプロイ

```bash
cd smkc-score-app && npm run deploy
```

### コードレビュー

修正を行った場合、コミット前に必ずレビューを依頼すること。

```
Agent(subagent_type="tdd-test-reviewer", prompt="変更内容をレビューして...")
```

レビュー観点:
- 変更の妥当性と副作用
- テストカバレッジ
- CLAUDE.md の review aspects に準拠しているか
- レビュー指摘が出たら修正→再レビューを繰り返し、全てクリアしてからコミット

### 既知の問題

- **D1 インタラクティブトランザクション非対応**: `prisma.$transaction(async (tx) => {...})` は使用不可。直接クエリで代替（optimistic-locking.ts参照）
- **API レスポンス形式**: `createSuccessResponse()` は `{ success: true, data: {...} }` でラップする。フロントエンドで `.data ?? json` でアンラップが必要
- **BM決勝スコア検証**: 予選 (max=4, sum=4) と決勝 (best-of-9, max=5) で異なるバリデータを使用。`validateFinalsScores` config で切り替え

## 禁止コマンド

- `pkill -f "chromium"` は禁止。ブラウザプロセスの誤殺リスクがある。Playwrightプロファイルの問題は `rm -f /tmp/playwright-smkc-profile/SingletonLock` で対応すること。

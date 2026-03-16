# CLAUDE.md

# BASE
- research the industry-standard approach to this problem use it to guide yours"
- Detailed comments must be included in the source code to justify the implementation of such logic
- use T-wada TDD

## Review
- 作業内容は subagent を用いて厳しい自己レビューを実施すること
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

## E2E Test Loop (定期E2Eテスト)

本番環境 https://smkc.bluemoon.works/ に対して定期的にE2Eテストを実施し、問題を発見・修正・デプロイ・検証する。

### 起動方法

```
/loop 6h 本番のhttps://smkc.bluemoon.works/でE2Eテストを行って、問題を発見し修正せよ。パフォーマンスが異常に遅い部分にも気を配って修正すること。修正後はデプロイして、本番で治っていることを確認すること。
```

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

**【重要】ページの中身と動作を必ず確認すること。HTTPステータスコード200だけでは不十分。**

各ページで以下を検証：
- 「Failed to fetch」「500」「再試行」エラーが表示されていないこと
- トーナメント名・モード名・ボタン等のコンテンツが実際に表示されていること
- 「読み込み中」が消えていること（ローディング完了）
- 8秒以上待ってから判定（fetchWithRetry のリトライ時間を考慮）

1. **モードページ内容確認**: TA/BM/MR/GP 各ページでデータが正常に読み込まれること
2. **プレイヤーCRUD**: 追加・編集・パスワードリセット・削除が動作すること
3. **パスワード漏洩チェック**: APIレスポンスに `password` フィールドが含まれないこと
4. **セキュリティヘッダー**: CSP, X-Frame-Options 等がホームページにも付与されていること
5. **パフォーマンス**: 各ページの読み込み時間、異常に遅い箇所の調査
6. **修正→デプロイ→本番検証** のサイクルを1ループ内で完結させる

### デプロイ

```bash
cd smkc-score-app && npm run deploy
```

### 既知の問題

- **Workers 間欠 1101 エラー**: PrismaNeon コールドスタートで ~10-20% の確率で Worker がクラッシュする。layout.tsx にリトライロジック（最大3回、500ms間隔）を追加済み
- **API レスポンス形式**: `createSuccessResponse()` は `{ success: true, data: {...} }` でラップする。フロントエンドで `.data ?? json` でアンラップが必要

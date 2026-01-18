# JSMKC 点数計算システム アーキテクチャ設計書

## 1. システム概要

### 1.1 システム目的
Japan Super Mario Kart Championship (JSMKC) の大会運営における点数計算・順位管理を行うシステム

### 1.2 技術スタック

| レイヤ | 技術 | 用途 |
|--------|------|------|
| フロントエンド | Next.js 16 (App Router) | Reactフレームワーク |
| | TypeScript | 型安全な開発 |
| | Tailwind CSS | スタイリング |
| | shadcn/ui | UIコンポーネントライブラリ |
| | Radix UI | アクセシビリティ基盤 |
| バックエンド | Next.js API Routes | REST API |
| | Prisma ORM | データベースアクセス |
| データベース | PostgreSQL (Neon) | データストア |
| デプロイ | Vercel | ホスティング |
| フォーム管理 | React Hook Form | フォーム管理 |
| バリデーション | Zod | スキーマバリデーション |

### 1.3 デプロイ環境
- 本番環境: Vercel (Neon PostgreSQL)
- 開発環境: ローカル (Neon PostgreSQL)

---

## 2. 機能要件

### 2.1 既に実装済みの機能
- [x] プレイヤー管理（登録・編集・削除）
- [x] トーナメント管理（作成・管理）
- [x] バトルモード予選（グループ分け、総当たり対戦表、スコア入力、勝ち点自動計算）
- [x] バトルモード決勝（ダブルエリミネーション）
- [x] タイムアタックAPI（コース別タイム入力、合計タイム自動計算）
- [x] 参加者スコア入力API（自己申告、確認）

### 2.2 実装予定の機能
- [ ] タイムアタックUI
- [ ] マッチレース（予選・決勝）
- [ ] グランプリ（予選・決勝）
- [ ] 参加者スコア入力UI
- [ ] リアルタイム順位表示（Server-Sent Events or WebSocket）
- [ ] 結果エクスポート（Excel/PDF）
- [ ] 履歴管理
- [ ] 使用キャラクター記録

---

## 3. 非機能要件

### 3.1 パフォーマンス要件
- 同時アクセス: 最大48人（プレイヤー+運営）
- ページ読み込み時間: 2秒以内
- APIレスポンス時間: 500ms以内

### 3.2 セキュリティ要件
- 参加者スコア入力: 認証なし（トーナメントURLでアクセス可能）
- データベース接続: SSL/TLS必須
- 環境変数管理: Vercel環境変数または `.env.local`
- 入力バリデーション: Zodによるサーバーサイドバリデーション

### 3.3 使いやすさ要件
- モバイルフレンドリーUI（スマートフォンでの操作に最適化）
- 運営負荷の軽減（参加者によるスコア入力）
- リアルタイム更新（順位表の即時反映）

---

## 4. 受け入れ基準

### 4.1 完了条件
1. 全4モードの試合進行がスムーズにできる
2. 参加者が自分でスコアを入力できる
3. リアルタイムで順位が更新される
4. 運営の手間を最小限にする（確認・修正のみ）
5. 結果をエクスポートできる

### 4.2 品質基準
- Lighthouseスコア: 90以上
- TypeScriptエラー: なし
- ESLintエラー: なし

---

## 5. 設計方針

### 5.1 開発方針
- **モノリシックアーキテクチャ**: フロントエンドとバックエンドをNext.jsで統合
- **シンプルさ優先**: 必要最小限の技術スタック
- **進化的開発**: 既存機能をベースに段階的に実装

### 5.2 UI/UXの方向性
- shadcn/uiコンポーネントによる一貫性のあるデザイン
- モバイルファーストのレスポンシブデザイン
- 直感的な操作フロー

### 5.3 アーキテクチャの方向性
- **プレゼンテーションコンポーネントとロジック分離**: UIコンポーネントとビジネスロジックの分離
- **API RoutesによるRESTful API**: Next.js App RouterのAPI Routesを使用
- **Prismaによる型安全なデータアクセス**: TypeScriptとの統合による型安全性

---

## 6. アーキテクチャの決定

### 6.1 フロントエンドアーキテクチャ

#### Next.js App Router
- ルーティング: ファイルベースルーティング
- Server Components: データフェッチとレンダリング
- Client Components: インタラクティブなUI

#### Component構成
```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Home
│   ├── players/           # Player management pages
│   ├── tournaments/       # Tournament pages
│   └── api/               # API routes
├── components/
│   ├── ui/               # shadcn/ui components
│   └── tournament/       # Tournament-specific components
└── lib/
    ├── prisma.ts         # Prisma client
    ├── utils.ts          # Utility functions
    ├── constants.ts      # Constants (courses, etc.)
    └── double-elimination.ts # Double elimination logic
```

#### 状態管理
- ローカルステート: React useState/useReducer
- フォーム状態: React Hook Form + Zod
- サーバーステート: Server Componentsから直接データフェッチ

### 6.2 バックエンドアーキテクチャ

#### API Routes
- RESTful API設計
- HTTPメソッド: GET, POST, PUT, DELETE
- エラーハンドリング: 統一されたエラーレスポンス形式

#### APIエンドポイント構造
```
/api/players/              # プレイヤー管理
/api/tournaments/          # トーナメント管理
/api/tournaments/[id]/bm/  # バトルモード
/api/tournaments/[id]/mr/  # マッチレース
/api/tournaments/[id]/gp/  # グランプリ
/api/tournaments/[id]/ta/  # タイムアタック
```

### 6.3 データベース設計

#### PostgreSQL (Neon)
- Serverless PostgreSQL
- 自動スケーリング
- バックアップ・復元

#### スキーマ設計
- **Player**: プレイヤー情報
- **Tournament**: トーナメント情報
- **Course/Arena**: コース/アリーナ情報
- **各モードのMatch/Qualificationモデル**: 対戦・予選情報

#### リレーション設計
- Player ↔ Match: One-to-Many
- Tournament ↔ Match: One-to-Many
- Cascading Delete: トーナメント削除時に関連データも削除

---

## 7. プロジェクト構造

```
jsmkc-app/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── migrations/        # Migration files
├── src/
│   ├── app/
│   │   ├── page.tsx       # Home page
│   │   ├── layout.tsx     # Root layout
│   │   ├── globals.css    # Global styles
│   │   ├── players/       # Player management
│   │   ├── tournaments/   # Tournament management
│   │   └── api/           # API routes
│   ├── components/
│   │   ├── ui/            # shadcn/ui components
│   │   └── tournament/    # Tournament-specific components
│   └── lib/
│       ├── prisma.ts      # Prisma client singleton
│       ├── utils.ts       # Utility functions
│       ├── constants.ts   # Constants (courses, etc.)
│       └── double-elimination.ts # Double elimination logic
├── public/                # Static assets
└── package.json
```

---

## 8. API設計

### 8.1 REST APIのエンドポイント

#### Players
- `GET /api/players` - 全プレイヤー取得
- `POST /api/players` - プレイヤー作成
- `PUT /api/players/[id]` - プレイヤー更新
- `DELETE /api/players/[id]` - プレイヤー削除

#### Tournaments
- `GET /api/tournaments` - 全トーナメント取得
- `POST /api/tournaments` - トーナメント作成
- `GET /api/tournaments/[id]` - トーナメント詳細取得
- `PUT /api/tournaments/[id]` - トーナメント更新

#### Battle Mode
- `GET /api/tournaments/[id]/bm/qualification` - 予選データ取得
- `POST /api/tournaments/[id]/bm/qualification` - 予選作成
- `POST /api/tournaments/[id]/bm/match/[matchId]` - マッチ更新
- `POST /api/tournaments/[id]/bm/finals` - 決勝作成

#### Time Trial
- `GET /api/tournaments/[id]/ta/entries` - エントリー取得
- `POST /api/tournaments/[id]/ta/entries` - エントリー作成
- `PUT /api/tournaments/[id]/ta/entries/[entryId]` - エントリー更新

### 8.2 リクエスト/レスポンス形式

#### 成功レスポンス
```json
{
  "success": true,
  "data": {...}
}
```

#### エラーレスポンス
```json
{
  "success": false,
  "error": "エラーメッセージ"
}
```

---

## 9. UIコンポーネント構成

### 9.1 shadcn/uiコンポーネント
- Button, Input, Label, Card, Dialog, Select, Table, Tabs, AlertDialog
- Radix UIベースのアクセシビリティ対応コンポーネント

### 9.2 カスタムコンポーネント
- `DoubleEliminationBracket` - ダブルエリミネーションブラケット表示
- `MatchCard` - 対戦カード
- `PlayerSelect` - プレイヤー選択
- `ScoreInput` - スコア入力

---

## 10. トレードオフの検討

### 10.1 技術選定の理由

#### Next.js (App Router)
**メリット**
- フロントエンドとバックエンドを1つのプロジェクトで管理
- Server Componentsによるパフォーマンス最適化
- Vercelとの統合による簡単なデプロイ

**デメリット**
- バックエンドがNode.jsに依存
- 複雑なAPIロジックになると管理が難しくなる可能性

**採用理由**: シンプルさ優先、開発効率の向上

#### PostgreSQL (Neon)
**メリット**
- Serverlessでスケーリングが容易
- Prismaとの統合が容易
- バックアップ・復元が自動

**デメリット**
- 接続数に制限がある
- ローカル開発で外部DBに依存

**採用理由**: コスト効率、運用の手間削減

#### 認証なしの参加者スコア入力
**メリット**
- 参加者にとって簡単にアクセス可能
- 実装がシンプル

**デメリット**
- 不正アクセスのリスク
- 入力ログが必要

**採用理由**: シンプルさ優先、URL共有で十分運用可能

### 10.2 設計上のトレードオフ

#### モノリシック vs マイクロサービス
- **採用**: モノリシック（Next.js）
- **理由**: スケールが小さい（最大48人）、開発・運用コスト削減

#### SPA vs SSR
- **採用**: SSR (Next.js Server Components)
- **理由**: SEO不要だが、パフォーマンスとデータフェッチの簡素化

#### リアルタイム更新方式
- **検討**: Server-Sent Events (SSE), WebSocket, Polling
- **採用予定**: Server-Sent Events
- **理由**: シンプルで効率的、一方向のデータフローで十分

---

## 11. 開発の優先順位

1. タイムアタックUI（APIは実装済み）
2. 参加者スコア入力UI（APIは実装済み）
3. マッチレース（予選・決勝）
4. グランプリ（予選・決勝）
5. リアルタイム順位表示（SSE）
6. 結果エクスポート（Excel/PDF）
7. 履歴管理
8. 使用キャラクター記録

---

## 12. リスク管理

### 12.1 技術的リスク
- **PostgreSQL接続数制限**: プリズマの接続プールで対応
- **リアルタイム更新の複雑さ**: SSEでシンプルに実装

### 12.2 セキュリティリスク
- **認証なしアクセス**: URLの秘匿と入力ログで対応
- **SQLインジェクション**: Prisma ORMで自動防止

### 12.3 運用リスク
- **データ損失**: Neonの自動バックアップで対応
- **ダウンタイム**: Vercelの自動スケーリングで対応

---

## 13. 改訂履歴

| バージョン | 日付 | 内容 |
|------------|------|------|
| 1.0 | 2026-01-18 | 初版作成 |

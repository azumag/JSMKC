# JSMKC 点数計算システム

Japan Super Mario Kart Championship (JSMKC) の大会運営における点数計算・順位管理を行うシステム

## 概要

JSMKC2024 およびそれ以降の大会で使用される大会管理システム。

## 競技モード

- **タイムアタック**: タイム計測による順位決定
- **バトル**: 1vs1対戦（風船を割り合うバトル）
- **vsマッチレース**: 1vs1対戦（レース対決）
- **vsグランプリ**: 1vs1対戦（カップ戦でドライバーズポイント勝負）

## 技術スタック

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS, Radix UI
- **Authentication**: NextAuth v5
- **Database**: Prisma
- **Testing**: Jest, Testing Library

## 開発

```bash
# インストール
cd jsmkc-app
npm install

# 開発サーバー起動
npm run dev

# テスト実行
npm test

# リントチェック
npm run lint

# ビルド
npm run build
```

## プロジェクト構成

```
jsmkc-app/
├── src/
│   ├── app/              # Next.js App Router
│   ├── lib/              # 共通ライブラリ
│   └── types/            # TypeScript型定義
├── __tests__/            # テストファイル
├── docs/                 # ドキュメント
└── prisma/               # Prismaスキーマ
```

## ドキュメント

- [要件定義書](./docs/requirements.md)
- [アーキテクチャ](./docs/ARCHITECTURE.md)

## ライセンス

MIT

## 現在のタスク (2026-01-21)
なし

## 現在の実装状況 (2026-01-20)

### ✅ 実装済み
- タイムアタック機能（敗者復活ラウンド、ライフ制トーナメント）
- バトルモード予選
- マッチレース予選
- vsグランプリ予選
- 参加者スコア入力機能
- ✅ エクスポートルートTypeScriptコンパイルエラー修正（Issue #15）
- ✅ usePollingフック互換性問題修正（Issue #16）
- ✅ JWTコールバック型エラー修正（Issue #17）
- ✅ ESLint 'any'型警告修正（Issue #18）
- ✅ ESLint警告修正：未使用のインポートと変数を削除（Issue #20）
- ✅ Next.js 16 proxy規約への移行（Issue #21）
- ✅ APIルート入力サニタイゼーション追加（Issue #22）
- ✅ ブラケットタイプ誤字修正（Issue #23）
- ✅ TAビジネスロジック単体テスト追加（Issue #26）
- ✅ APIルートリファクタリングとテストカバレッジ改善（Issue #25）
- ✅ SessionProvider未ラップによるクライアントエラー修正（Issue #28）
- ✅ ブラケットタイプ誤字修正（Issue #30）
- ✅ ライブラリモジュール単体テスト追加（Issue #31 - 部分完了）
- ✅ TC-008未認証保護ページアクセス修正（Issue #27）
- ✅ トークン検証13の単体テスト修正（Issue #33）
- ✅ xlsxパッケージのセキュリティ脆弱性修正（Issue #34）
- ✅ 認証バイパス修正（Issue #35）
- ✅ データベースページネーション - 主要エンドポイント（Issue #36、#37 部分完了）
- ✅ N+1クエリ最適化（Issue #38）
- ✅ ビルドエラー修正：重複するsearchParams宣言と型エラー（Issue #39）
- ✅ ダブルエリミネーションブラケットUIアクセシビリティとレスポンシブ向上（Issue #40）
- ✅ プリズマミドルウェアとエラーハンドリング実装済み（SoftDeleteManager、標準エラーレスポンス関数）
- ✅ 全ページの読み込み状態改善（Issue #43）
   - LoadingSpinner、LoadingSkeleton、LoadingOverlayコンポーネント作成
   - loading-types.tsによる型定義と状態管理
   - 18ページ以上のローディングUI改善（スケルトン表示、オーバーレイ対応）

### ✅ 実装済み
- E2Eテスト実装（Issue #32）
   - ✅ Playwrightインストールと設定
   - ✅ playwright.config.ts作成
   - ✅ テストファイル作成（auth.spec.ts, players.spec.ts, profile.spec.ts, tournaments.spec.ts, game-modes.spec.ts）
   - ✅ describe → test.describe修正
   - ✅ テストケースを実際のアプリケーション構造に合わせて更新
   - ✅ デザインドキュメント作成（docs/E2E_TEST_DESIGN.md）
   - ✅ package.jsonにE2Eテストスクリプト追加
   - ⚠️ 一部のテストはアプリケーションの完全実装やテストデータ設定が必要
   - ⚠️ CI/CDパイプラインへの統合は次回に実施
- ライブラリモジュール単体テスト追加（Issue #31 - 部分完了）
   - ✅ rate-limit.tsモジュール（63テスト追加）
   - ✅ ブラケットタイプ定義（14テスト追加）
   - 🚧 prisma-middleware.ts、error-handling.ts他（未実装）
- バトルモード・マッチレース ダブルエリミネーション（Issue #11）
   - ✅ バックエンドAPI（ブランケット生成、マッチ作成・更新）
   - 🚧 フロントエンドUI（JSX構造修正が必要 - Issue #13）

### 📋 既知の問題
なし

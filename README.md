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

## 完了したタスク (2026-01-21)
✅ [Issue #52: テストカバレッジの大幅な改善が必要](https://github.com/azumag/JSMKC/issues/52)
- 優先度1および2のすべてのタスク完了
- 中核機能のカバレッジ: 80%以上達成
- 全テストパス: 475個

## 完了したタスク (2026-01-21)
✅ [Issue #58: standings-cache.tsのテストカバレッジ改善](https://github.com/azumag/JSMKC/issues/58)
- 達成カバレッジ: 100% statements, 100% branches, 100% functions, 100% lines（目標: 80%以上）
- 全38テストがパス
- 親Issue: #52 テストカバレッジの大幅な改善が必要

## 完了したタスク (2026-01-21)
✅ [Issue #57: optimistic-locking.tsのテストカバレッジ改善](https://github.com/azumag/JSMKC/issues/57)
- 達成カバレッジ: 97.77% statements, 92.3% branches, 100% functions（目標: 80%以上）
- 全28テストがパス
- 親Issue: #52 テストカバレッジの大幅な改善が必要

## 完了したタスク (2026-01-21)
✅ [Issue #56: soft-delete.tsのテストカバレッジ改善](https://github.com/azumag/JSMKC/issues/56)
- 達成カバレッジ: 81.08% statements, 100% branches（目標: 80%以上）
- 全54テストがパス
- 親Issue: #52 テストカバレッジの大幅な改善が必要

## 完了したタスク (2026-01-21)
✅ [Issue #55: double-elimination.tsのテストカバレッジ改善](https://github.com/azumag/JSMKC/issues/55)
- 達成カバレッジ: 81.13% statements, 80% lines（目標: 80%以上）
- 全30テストがパス
- 親Issue: #52 テストカバレッジの大幅な改善が必要

## 完了したタスク (2026-01-21)
✅ [Issue #64: jwt-refresh.test.tsの失敗テスト6件の修正](https://github.com/azumag/JSMKC/issues/64)
- 全38テストがパス
- カバレッジ: 88.88% statements, 82.05% branches, 100% functions, 90.69% lines（向上）
- 親Issue: #52 テストカバレッジの大幅な改善が必要

## 完了したタスク (2026-01-21)
✅ [Issue #63: tournament/promotion.tsのテストカバレッジ改善（Issue #52の一部）](https://github.com/azumag/JSMKC/issues/63)
- 達成カバレッジ: 100% statements, 100% branches, 100% functions, 100% lines（目標: 80%以上）
- 全17テストがパス
- 親Issue: #52 テストカバレッジの大幅な改善が必要

## 完了したタスク (2026-01-21)
✅ [Issue #65: コアラブラリモジュールの単体テスト実装（pagination, password-utils, score-validation, sanitize）](https://github.com/azumag/JSMKC/issues/65)
- pagination.ts: 100% statements, 100% lines (21 tests)
- password-utils.ts: 94.11% statements, 93.75% lines (23 tests)
- score-validation.ts: 100% statements, 100% lines (44 tests)
- sanitize.ts: 100% statements, 100% lines (51 tests)
- 親Issue: #52 テストカバレッジの大幅な改善が必要（完了）

## 完了したタスク (2026-01-21)
✅ [Issue #54: promotion.tsのテストカバレッジ改善](https://github.com/azumag/JSMKC/issues/54)
- 達成カバレッジ: 100%（目標: 80%以上）
- 全17テストがパス
- 親Issue: #52 テストカバレッジの大幅な改善が必要

## 現在の実装状況 (2026-01-21)

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
- ✅ スキップされたレート制限テストの完了（Issue #50）
- ✅ 依存パッケージの更新（Issue #51）
   - Next.js 16.1.1 → 16.1.4
   - Prisma 6.19.1 → 6.19.2
   - @types/react 19 → 19.2.9
   - react-hook-form 7.70.0 → 7.71.1
   - @testing-library/react 14.2.1 → 16.3.2

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
- ライブラリモジュール単体テスト追加（Issue #31 - 完了）
   - ✅ rate-limit.tsモジュール（63テスト追加）
   - ✅ ブラケットタイプ定義（14テスト追加）
   - ✅ prisma-middleware.ts（52テスト追加）
   - ✅ error-handling.ts（32テスト追加）
- バトルモード・マッチレース ダブルエリミネーション（Issue #11）
   - ✅ バックエンドAPI（ブランケット生成、マッチ作成・更新）
   - 🚧 フロントエンドUI（JSX構造修正が必要 - Issue #13）

### 📋 既知の問題
なし

## Development Workflow

### 0. find issues ✓
- Retrieved issue #67: トークン関連ユーティリティのテストカバレッジ改善（token-utils, token-validation）

### 1. Design Architect ✓
- High-level system design for implementing comprehensive test coverage for token utilities
- Detailed technical specifications:
  - **token-utils.ts**: Create new test file with coverage for 5 functions (generateTournamentToken, isValidTokenFormat, isTokenValid, getTokenExpiry, extendTokenExpiry, getTokenTimeRemaining)
  - **token-validation.ts**: Improve existing test file to cover uncovered lines (87-88, 92-96, 110-139, 168)
  - Target: 80%+ coverage for both files
  - Test cases: edge cases, error handling, boundary conditions, crypto API mocking, Prisma mocking

### 2. Implementation ✓
- Created new test file: token-utils.test.ts with 56 tests
- Improved existing test file: token-validation.test.ts with 30 tests
- Added comprehensive edge case coverage and security tests
- Mocked NextResponse.json for middleware testing

### 3. Review ✓
- Fixed failing tests for regex case-sensitivity expectations
- Fixed middleware test mocking approach
- No remaining issues to block progress

### 4. Quality Review ✓
- All acceptance criteria met: 80%+ coverage, all tests pass, no regressions
- Coverage results: token-utils (100% statements), token-validation (94.44% statements)
- Comprehensive audit completed successfully
- All 687 tests passing (including 86 new token-related tests)
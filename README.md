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
- ⚠️ ブラケットタイプ誤字修正（部分完了）（Issue #23）
- ✅ TAビジネスロジック単体テスト追加（Issue #26）

### 🚧 実装中
- APIルートリファクタリングとテストカバレッジ改善（Issue #25）
   - ✅ TAルートファイル縮小（967→587行、39%削減）
   - ✅ promotion.tsモジュール作成
   - ✅ TAビジネスロジック単体テスト（28テスト追加）
   - 🚧 APIルート統合テスト（未実装）
   - 🚧 APIドキュメント作成（未実装）
- バトルモード・マッチレース ダブルエリミネーション（Issue #11）
   - ✅ バックエンドAPI（ブランケット生成、マッチ作成・更新）
   - 🚧 フロントエンドUI（JSX構造修正が必要 - Issue #13）

### 📋 既知の問題
- Time AttackページのJSX構造問題（Issue #13）
- ⚠️ 残りのブラケットタイプ誤字を手動修正（Issue #24 - 部分完了）

# 次の実装計画（GitHub Issue対応）

**Date**: 2026-01-19
**担当**: プロジェクトマネージャー

---

## 現状分析

### GitHubオープンIssue（5件）

1. **create new tornament で unauthorized になる**
   - トーナメント作成時の認証エラー
   - 優先度: 中

2. **[auth][error] MissingSecret**
   - 認証シークレットの未設定エラー
   - 優先度: 高

3. **READMEを追加**
   - READMEドキュメントが不在
   - 優先度: 低

4. **REDISはアーキテクチャに入っていないので入れないようにして**（重複）
   - Redis設定がArchitecture.mdに含まれていない
   - 優先度: 低

5. **REDISはアーキテクチャに入っていないので入れないようにして**（重複）
   - 重複イシュー

### 既に実装済み機能（IMPLEMENTED.md/Q&A.mdより）

✅ 重大問題（3件）:
- GitHub OAuth Refresh Token機能
- Edge Runtime互換性修正
- Nonce伝播実装

✅ Architecture.md要件:
- 認証（GitHub/Google OAuth）
- JWT Refresh Token（1時間アクセストークン、24時間refresh）
- トーナメントトークンシステム
- レート制限（スコア入力、ポーリング、トークン検証）
- CSPポリシー（nonce、strict-dynamic）
- ソフトデリート、楽観的ロック
- XSSサニタイズ

✅ ビルド・Lint:
- ビルド成功
- Lint成功（未使用変数は軽微問題）

---

## 実装計画

### 優先度分類

#### 高優先（GitHub Issue対応）

1. **README.md作成**
   - プロジェクト概要
   - インストール手順
   - 環境変数
   - 実行方法
   - デプロイ手順

2. **認証シークレット設定の確認と修正**
   - AUTH_GOOGLE_ID/SECRETの確認
   - GITHUB_CLIENT_ID/SECRETの確認
   - NEXTAUTH_SECRETの確認
   - .env.exampleファイルの作成

3. **Redis設定の確認と修正**
   - @upstash/ratelimitと@upstash/redisの使用確認
   - Architecture.mdと実装の整合性確認
   - 実装済みのRedisフォールバック機能の維持

4. **トーナメント作成時の認証エラー調査**
   - トーナメント作成APIの認証ミドルウェア確認
   - エラーメッセージの確認
   - auth関数の確認

#### 中優先（コード品質改善）

1. **Jest設定の修正**
   - ts-nodeのインストール
   - TypeScript設定の確認
   - 基本テストの追加（主要APIルート）

2. **環境変数命名の一貫性**
   - GitHub: GITHUB_CLIENT_ID/SECRET → AUTH_GITHUB_ID/SECRET
   - Google: AUTH_GOOGLE_ID/SECRET（既存）
   - 統一された命名規則

3. **Zodバリデーションの完全実装**
   - 全APIエンドポイントにZodスキーマ適用
   - 型安全な入力検証

4. **コード重複の削減**
   - 共通ユーティリティ関数の抽出
   - エラーハンドリングの統一

5. **APIドキュメントの追加**
   - OpenAPI/Swagger仕様の作成
   - API使用例の追加

---

## Architecture.mdとの整合性確認

### セキュリティ

| 項目 | Architecture.md要件 | 実装状況 | 対応必要 |
|------|---------------------|----------|------|
| Redisレート制限 | @upstash/ratelimit使用 | ⚠️ 要確認 | Architecture.mdには記載あり、実装もあり |
| 環境変数設定 | .env.exampleで管理 | ⚠️ 要確認 | 既存だが統一性に問題あり |

### 認証

| 項目 | Architecture.md要件 | 実装状況 | GitHub Issue |
|------|---------------------|----------|------|
| GitHub OAuth | 組織済み | ✅ | Issue 2, 4に関連 |
| Google OAuth | 組織済み | ✅ | - |
| Refresh Token | 実装済み | ✅ | - |
| Organization検証 | 実装済み | ✅ | - |

---

## アーキテクチャエージェントへの依頼内容

**依頼内容**:
1. Architecture.mdと実装の齟齬確認（Redisが含まれているか？）
2. GitHub Issue（5件）への対処計画
3. 既存実装機能の動作確認（トーナメント作成認証）
4. ドキュメント化の方向性提案（README、APIドキュメント）

**質問**:
1. Redisレート制限はArchitecture.mdに明示的に含まれているか？
2. 含まれていない場合、どのような対応が推奨されるか？
3. 実装済みの@upstash/ratelimitコードはEdge Runtime互換か？
4. トーナメント作成APIの認証エラーの原因は何か？

**実装依頼**:
1. README.mdの作成（セットアップ手順、環境変数、実行方法など）
2. .env.exampleファイルの作成（必須変数リストと説明）
3. 環境変数の一貫性確認と必要な修正
4. トーナメント作成APIのデバッグと認証ミドルウェアの確認
5. GitHub Issueの調査と必要な修正
6. 必要に応じて、新しい機能の実装追加
7. 既存コードのレビューと品質改善

---

## 実装順序

### フェーズ1：調査と設計（即座実施）
1. Architecture.mdのRedisセクションを確認
2. 現在実装のrate-limit.tsをレビュー
3. トーナメント作成APIを確認
4. GitHub Issueの詳細を確認

### フェーズ2：実装（主要タスク）
1. README.mdの作成
2. .env.exampleの作成
3. 環境変数の一貫性修正
4. Redis設定の確認とドキュメント化
5. トーナメント作成認証の修正
6. Jest設定の修正と基本テスト追加
7. GitHub Issueの修正またはクローズ

### フェーズ3：検証とドキュメント化
1. ビルドとLintの確認
2. APIテストの実施
3. APIドキュメントの追加（OpenAPI/Swagger）
4. 最終レビュー

---

## 優先度一覧

1. **【高】README.md作成** - ユーザー体験向上
2. **【高】認証シークレット設定の確認と修正** - セキュリティ確保
3. **【高】トーナメント作成認証エラーの調査と修正** - GitHub Issue 1対応
4. **【中】Redis設定の確認とドキュメント化** - Architecture整合性確保
5. **【中】Jest設定の修正と基本テスト追加** - テストカバレッジ向上
6. **【中】環境変数命名の一貫性** - メンテナンス性向上
7. **【中】Zodバリデーションの完全実装** - 入力検証強化
8. **【低】APIドキュメントの追加** - ユーザビリティ向上

---

## 成功基準

各タスクの完了基準：
1. README.md: プロジェクト概要、インストール手順、実行方法を含む
2. .env.example: 全必須変数と説明が含まれる
3. Redis: Architecture.mdと整合し、ドキュメント化される
4. GitHub Issues: 5件すべて対処またはクローズされる
5. ビルド・Lint: 成功を維持
6. Architecture適合: 全要件を満たす

---

**担当者**: プロジェクトマネージャー
**日付**: 2026-01-19
**ステータス**: 計画完了、実装エージェント依頼へ
# JSMKC 点数計算システム アーキテクチャ設計書

## 機能要件（何を実現するか）

### システム目的
Japan Super Mario Kart Championship (JSMKC) の大会運営における点数計算・順位管理を行うシステム

### 対象大会
- JSMKC2024 およびそれ以降の大会

### 既に実装済みの機能
- [x] プレイヤー管理（登録・編集・削除）
- [x] トーナメント管理（作成・管理）
- [x] バトルモード予選（グループ分け、総当たり対戦表、スコア入力、勝ち点自動計算）
- [x] バトルモード決勝（ダブルエリミネーション）
- [x] タイムアタックAPI（コース別タイム入力、合計タイム自動計算）
- [x] 参加者スコア入力API（自己申告、確認）

### 実装予定の機能
- [ ] タイムアタックUI
- [ ] マッチレース（予選・決勝）
- [ ] グランプリ（予選・決勝）
- [ ] 参加者スコア入力UI
- [ ] リアルタイム順位表示
- [ ] 結果エクスポート（Excel優先）
- [ ] 使用キャラクター記録（戦略分析用）

### タイムアタック機能
- コース別タイム入力
- 合計タイム自動計算
- 予選順位自動計算
- 敗者復活ラウンド管理
- ライフ制トーナメント管理
- ライフリセット自動処理

### バトル/マッチレース機能
- グループ分け機能
- 総当たり対戦表生成
- コース別勝敗入力
- 勝ち点自動計算
- 敗者復活ラウンド管理
- ダブルエリミネーショントーナメント管理

### vsグランプリ機能
- カップ選択
- ドライバーズポイント入力/計算
- 勝敗判定

### 共通機能
- リアルタイム順位表示
- 結果エクスポート
- 履歴管理

### 参加者スコア入力機能
- 対戦終了後の自己申告（両プレイヤーが入力、一致で自動確定）
- リアルタイム順位表更新
- 運営負荷の軽減（確認・修正のみ）
- 認証なしアクセス（トーナメントURLで入力可能）
- モバイルフレンドリーUI
- 同時編集時の競合処理

---

## 非機能要件（パフォーマンス、セキュリティなど）

### パフォーマンス要件
- 同時アクセス: 最大48人（プレイヤー+運営）
- ページ読み込み時間: 3秒以内（DB接続含む）
- APIレスポンス時間: 1秒以内（DB接続含む）

**根拠**: Next.js Server Components + Prisma + Vercel Edge Networkの組み合わせで、静的ページは1秒以内、動的ページは2-3秒が一般的（Next.js公式ドキュメント参照）

### セキュリティ要件

#### 運営認証
- **認証方式**: GitHub OAuth (NextAuth.js)
- **認証対象**: 以下の操作のみ認証を要求
  - トーナメント作成・編集・削除
  - プレイヤー編集・削除
  - マッチ結果の編集・削除
  - トークン発行・無効化
- **許可ユーザー**: GitHub Organizationのメンバーのみ（`jsmkc-org`）
- **セッション管理**: JWT、有効期限24時間
- **認証ミドルウェア**: NextAuth.jsの`authMiddleware`で保護エンドポイントを指定

#### 参加者スコア入力
- 認証なし（トーナメントURL + トークンでアクセス）
- URLトークン仕様:
  - 生成: crypto.randomBytes(32)で32文字のHex文字列
  - 有効期限: 24時間（大会期間中は延長可能）
  - 発行数: 1トーナメントにつき1つ
  - 無効化: 運営のみ可能（認証済みユーザー）
- URL漏洩対策:
  - トークン無効化機能
  - レート制限: 1IPあたり10回/分（Redis/Vercel KV）
  - 入力ログ: IPアドレス、ユーザーエージェント、タイムスタンプを保存（90日間）
  - IP制限（オプション）: 運営が特定IPのみ許可する設定
  - CAPTCHA（オプション）: 不正入力回数が多い場合

#### その他セキュリティ
- データベース接続: SSL/TLS必須
- 環境変数管理: Vercel環境変数
- 入力バリデーション: Zodによるサーバーサイドバリデーション
- SQLインジェクション対策: Prisma ORMによるパラメータ化クエリ
- セキュリティヘッダー:
  - CSPヘッダー: 外部スクリプトの制限（XSS対策）
  - X-Frame-Options: クリックジャッキング対策
  - X-Content-Type-Options: MIMEタイプスニッフィング対策

### 使いやすさ要件
- モバイルフレンドリーUI（スマートフォンでの操作に最適化）
- 運営負荷の軽減（参加者によるスコア入力、確認・修正のみ）
- リアルタイム更新（順位表の即時反映、最大3秒遅延）

---

## 受け入れ基準（完了条件）

### 完了条件
1. 全4モードの試合進行がスムーズにできる
2. 参加者が自分でスコアを入力できる
3. リアルタイムで順位が更新される（最大3秒遅延）
4. 運営の手間を最小限にする（確認・修正のみ）
5. 結果をExcel形式でエクスポートできる
6. 操作ログが記録され、履歴確認ができる
7. 運営認証により、未許可ユーザーはトーナメント作成・編集・削除ができない

### 品質基準
- Lighthouseスコア: 85以上（サードパーティスクリプト考慮）
- TypeScriptエラー: なし
- ESLintエラー: なし
- セキュリティスキャン: 高度な問題なし

---

## 設計方針の確認

### 開発方針
- **モノリシックアーキテクチャ**: フロントエンドとバックエンドをNext.jsで統合
- **シンプルさ優先**: 必要最小限の技術スタック
- **進化的開発**: 既存機能をベースに段階的に実装
- **将来の拡張性**: 将来のスケーリングを考慮した設計（モジュール化、データ正規化）

### UI/UXの方向性
- shadcn/uiコンポーネントによる一貫性のあるデザイン
- モバイルファーストのレスポンシブデザイン
- 直感的な操作フロー（ステップ形式の誘導）

### アーキテクチャの方向性
- **プレゼンテーションコンポーネントとロジック分離**: UIコンポーネントとビジネスロジックの分離
- **API RoutesによるRESTful API**: Next.js App RouterのAPI Routesを使用
- **Prismaによる型安全なデータアクセス**: TypeScriptとの統合による型安全性
- **データベース移行の容易性**: Prismaのマイグレーション機能活用、標準SQL対応

### 技術スタック

| レイヤ | 技術 | 用途 |
|--------|------|------|
| フロントエンド | Next.js 15.x (App Router) | Reactフレームワーク |
| | TypeScript | 型安全な開発 |
| | Tailwind CSS | スタイリング |
| | shadcn/ui | UIコンポーネントライブラリ |
| | Radix UI | アクセシビリティ基盤 |
| | NextAuth.js | 運営認証 |
| バックエンド | Next.js API Routes | REST API |
| | Prisma ORM | データベースアクセス |
| データベース | PostgreSQL (Neon) | データストア |
| デプロイ | Vercel | ホスティング |
| フォーム管理 | React Hook Form | フォーム管理 |
| バリデーション | Zod | スキーマバリデーション |
| Excel出力 | xlsx (SheetJS) | エクスポート |

### デプロイ環境
- 本番環境: Vercel (Neon PostgreSQL)
- 開発環境: ローカル (Neon PostgreSQL)

---

## アーキテクチャの決定

### フロントエンドアーキテクチャ

#### Next.js App Router
- ルーティング: ファイルベースルーティング
- Server Components: データフェッチとレンダリング（初期表示）
- Client Components: インタラクティブなUI（リアルタイム更新）

#### 状態管理
- ローカルステート: React useState/useReducer
- フォーム状態: React Hook Form + Zod
- サーバーステート: Server Componentsから直接データフェッチ
- リアルタイム更新: Polling（3秒間隔）

### バックエンドアーキテクチャ

#### API Routes
- RESTful API設計
- HTTPメソッド: GET, POST, PUT, DELETE
- エラーハンドリング: 統一されたエラーレスポンス形式

#### エラーハンドリング
**HTTPステータスコード定義**:
| ステータスコード | 用途 |
|----------------|------|
| 200 | 成功 |
| 400 | バリデーションエラー |
| 401 | 認証エラー |
| 403 | 認可エラー |
| 404 | リソース未検出 |
| 429 | レート制限超過 |
| 502 | データベース接続エラー |
| 503 | メンテナンス中 |
| 504 | データベースタイムアウト |
| 500 | サーバーエラー |

#### 認証
- **運営認証**: GitHub OAuth (NextAuth.js v5)
  - 許可ユーザー: GitHub Organizationのメンバー（`jsmkc-org`）
  - セッション管理: JWT、有効期限24時間
  - 保護対象API: トーナメント作成・編集・削除、プレイヤー編集・削除、マッチ結果編集・削除、トークン発行・無効化

#### リアルタイム更新の実装
**課題**: Vercelのサーバーレス環境ではSSEの継続接続が制限される

**実装方案**:
1. **Polling方式（採用）**: 3秒間隔でサーバーをポーリング
   - メリット: 実装がシンプル、Vercelで動作
   - デメリット: サーバー負荷増、更新遅延
2. **SSE方式（将来検討）**: Pusher等のマネージドサービス利用
   - メリット: リアルタイム性が高い
   - デメリット: コスト増、外部依存

**結論**: Polling方式で実装、必要に応じてPusher移行

#### APIエンドポイント構造
```
/api/players/              # プレイヤー管理
/api/tournaments/          # トーナメント管理
/api/tournaments/[id]/bm/  # バトルモード
/api/tournaments/[id]/mr/  # マッチレース
/api/tournaments/[id]/gp/  # グランプリ
/api/tournaments/[id]/ta/  # タイムアタック
/api/auth/[...nextauth]    # 運営認証
```

### データベース設計

#### PostgreSQL (Neon)
- Serverless PostgreSQL
- 自動スケーリング
- バックアップ・復元（7日間保持）
- **外部バックアップ**: Neonの自動バックアップ（7日間）に加え、週1回のCSVエクスポートをS3またはローカルに保存

#### スキーマ設計
- **Player**: プレイヤー情報
- **Tournament**: トーナメント情報（トークン含む）
- **Course/Arena**: コース/アリーナ情報
- **各モードのMatch/Qualificationモデル**: 対戦・予選情報
- **AuditLog**: 操作ログ（IP、ユーザーエージェント、タイムスタンプ、操作内容）
- **Account/Session/VerificationToken**: NextAuth.jsの認証関連モデル

#### AuditLogモデル
```prisma
model AuditLog {
  id          Int      @id @default(autoincrement())
  userId      Int?     // 運営ユーザーID（参加者の場合はnull）
  ipAddress   String
  userAgent   String
  action      String   // 操作内容: "CREATE_TOURNAMENT", "UPDATE_MATCH", etc.
  targetId    Int?     // 対象のID（Tournament、Player、Matchなど）
  targetType  String?  // 対象の型
  timestamp   DateTime @default(now())
  details     Json?    // 追加の詳細情報
}
```

#### 履歴管理の仕様
- **記録対象操作**:
  - トーナメント作成/編集/削除
  - プレイヤー作成/編集/削除
  - マッチ結果の変更（誰がいつ変更したか）
  - トークンの無効化
  - 運営ユーザーのログイン/ログアウト
- **保存期間**: 90日間
- **変更履歴の表示UI**: 各リソース詳細ページに「変更履歴」タブを追加

#### リレーション設計
- Player ↔ Match: One-to-Many
- Tournament ↔ Match: One-to-Many
- Tournament ↔ AuditLog: One-to-Many
- Account/Session/VerificationToken: NextAuth.js標準スキーマ
- Cascading Delete: トーナメント削除時に関連データも削除

### プロジェクト構造

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
│   │   ├── api/           # API routes
│   │   └── auth/          # NextAuth.js routes
│   ├── components/
│   │   ├── ui/            # shadcn/ui components
│   │   └── tournament/    # Tournament-specific components
│   ├── lib/
│   │   ├── prisma.ts      # Prisma client singleton
│   │   ├── utils.ts       # Utility functions
│   │   ├── constants.ts   # Constants (courses, etc.)
│   │   ├── double-elimination.ts # Double elimination logic
│   │   └── auth.ts         # NextAuth.js config
│   └── middleware.ts      # Auth middleware
├── public/                # Static assets
└── package.json
```

### API設計

#### REST APIのエンドポイント

**Players**
- `GET /api/players` - 全プレイヤー取得（認証不要）
- `POST /api/players` - プレイヤー作成（認証不要）
- `PUT /api/players/[id]` - プレイヤー更新（認証必須）
- `DELETE /api/players/[id]` - プレイヤー削除（認証必須）

**Tournaments**
- `GET /api/tournaments` - 全トーナメント取得（認証不要）
- `POST /api/tournaments` - トーナメント作成（認証必須）
- `GET /api/tournaments/[id]` - トーナメント詳細取得（認証不要）
- `PUT /api/tournaments/[id]` - トーナメント更新（認証必須）
- `DELETE /api/tournaments/[id]` - トーナメント削除（認証必須）
- `POST /api/tournaments/[id]/token/regenerate` - トークン再発行（認証必須）

**Battle Mode**
- `GET /api/tournaments/[id]/bm/qualification` - 予選データ取得（認証不要）
- `POST /api/tournaments/[id]/bm/qualification` - 予選作成（認証必須）
- `POST /api/tournaments/[id]/bm/match/[matchId]` - マッチ更新（認証不要、参加者スコア入力）
- `PUT /api/tournaments/[id]/bm/match/[matchId]` - マッチ編集（認証必須）
- `DELETE /api/tournaments/[id]/bm/match/[matchId]` - マッチ削除（認証必須）
- `POST /api/tournaments/[id]/bm/finals` - 決勝作成（認証必須）

**Time Trial**
- `GET /api/tournaments/[id]/ta/entries` - エントリー取得（認証不要）
- `POST /api/tournaments/[id]/ta/entries` - エントリー作成（認証不要、参加者スコア入力）
- `PUT /api/tournaments/[id]/ta/entries/[entryId]` - エントリー更新（認証必須）

**Auth**
- `GET /api/auth/[...nextauth]` - NextAuth.js認証ルート

#### リクエスト/レスポンス形式

**成功レスポンス**
```json
{
  "success": true,
  "data": {...}
}
```

**エラーレスポンス**
```json
{
  "success": false,
  "error": "エラーメッセージ"
}
```

---

## トレードオフの検討

### 技術選定の理由

#### Next.js (App Router)
**メリット**
- フロントエンドとバックエンドを1つのプロジェクトで管理
- Server Componentsによるパフォーマンス最適化
- Vercelとの統合による簡単なデプロイ

**デメリット**
- バックエンドがNode.jsに依存
- 複雑なAPIロジックになると管理が難しくなる可能性
- リアルタイム更新の実装に制限がある

**採用理由**: シンプルさ優先、開発効率の向上、将来の拡張性確保（モジュール化）

#### PostgreSQL (Neon)
**メリット**
- Serverlessでスケーリングが容易
- Prismaとの統合が容易
- バックアップ・復元が自動
- 標準SQL対応、移行の容易性確保

**デメリット**
- 接続数に制限がある（接続プールで対応）
- ローカル開発で外部DBに依存
- バックアップ期間が7日間のみ（外部バックアップで対応）

**採用理由**: コスト効率、運用の手間削減、将来のデータベース移行の容易性

#### GitHub OAuth (NextAuth.js)
**メリット**
- 認証インフラの構築不要
- 運営メンバー管理が容易（GitHub Organization）
- 標準的なOAuth 2.0プロトコル

**デメリット**
- GitHubアカウント必須
- 外部依存

**採用理由**: シンプルさ優先、運営メンバー管理が容易、セキュリティ確保

#### 認証なしの参加者スコア入力
**メリット**
- 参加者にとって簡単にアクセス可能
- 実装がシンプル
- 運用コストが低

**デメリット**
- 不正アクセスのリスク（URLトークン、レート制限、入力ログ、CAPTCHAで軽減）
- 入力ログが必要（実装済み）

**採用理由**: シンプルさ優先、URL共有で十分運用可能、リスク対策実装

### 設計上のトレードオフ

#### モノリシック vs マイクロサービス
- **採用**: モノリシック（Next.js）
- **理由**: スケールが小さい（最大48人）、開発・運用コスト削減
- **将来の拡張性**: モジュール化により、将来の分割を考慮

#### SPA vs SSR
- **採用**: SSR (Next.js Server Components)
- **理由**: SEO不要だが、パフォーマンスとデータフェッチの簡素化

#### リアルタイム更新方式
- **検討**: Server-Sent Events (SSE), WebSocket, Polling
- **採用**: Polling方式（3秒間隔）
- **理由**: シンプルで効率的、Vercelで動作
- **将来の拡張性**: 必要に応じてPusher等のマネージドサービスへ移行可能

### コスト分析

#### Vercelコスト見積もり（月額）
| プラン | 料金 | 推定使用量 | 月額コスト |
|--------|------|-----------|-----------|
| Hobby | $0 | 無料枠内 | $0 |
| Pro | $20 | 超過時 | $20 |

**無料枠範囲内収束の根拠**:
- 帯域: 100GB/月（大会期間のみ集中、通常は低使用）
- ビルド: 6,000分/月（開発期間集中、本番は安定）
- 関数実行: 100GB時間/月
  - Polling: 48人×(60秒/3秒)=960回/時間×24時間×2日大会=46,080回
  - 各ポーリングのCPU時間: 約100ms（データベースクエリを含む）
  - CPU時間合計: 46,080回×0.1秒=4,608秒≈1.28GB時間
  - 各ポーリングのメモリ使用量: 512MB
  - メモリ時間合計: 46,080回×0.5GB×0.1秒≈2,304GB秒≈0.00064GB時間
  - 合計: 約1.28GB時間/月、十分余裕

**必要なライブラリ**:
```bash
npm install next-auth @upstash/ratelimit @upstash/redis xlsx @vercel/analytics
```

**注意**: `@vercel/analytics`はVercel専用、他プラットフォームでは動作しない

**コスト超過時の対応**:
- 関数実行時間が100GB時間を超過した場合、以下の対策を実施:
  1. Polling間隔を3秒→5秒に延長
  2. Pusher等のマネージドサービスへの移行を検討
  3. Vercel Proプランへの移行（$20/月）

#### Neonコスト見積もり（月額）
| プラン | 料金 | 推定使用量 | 月額コスト |
|--------|------|-----------|-----------|
| Free | $0 | 無料枠内 | $0 |
| Scale | $19 | 超過時 | $19 |

**無料枠範囲内収束の根拠**:
- ストレージ: 0.5GB（プレイヤー数×トーナメント数=余裕）
- データ転送: 32GB/月（大会期間のみ集中）
- コンピューティング: 300時間/月（大会期間のみアクティブ）

#### 代替案との比較
| 構成 | 月額コスト | メリット | デメリット |
|------|-----------|----------|-----------|
| Vercel + Neon | $0 | デプロイ簡易、運用コスト低 | スケーリング制限 |
| Vercel + Supabase | $0 | 認証機能付属、リアルタイム機能強 | 学習コスト増 |
| AWS (RDS + Lambda) | $50-100 | スケーリング柔軟 | 運用コスト高、設定複雑 |

**結論**: 免費枠内で運用可能、拡張性確保

---

## 改訂履歴

| バージョン | 日付 | 内容 |
|------------|------|------|
| 11.0 | 2026-01-19 | アーキテクチャ構造を再整理（機能要件、非機能要件、受け入れ基準、設計方針、アーキテクチャ決定、トレードオフ検討） |
| 10.0 | 2026-01-18 | CSPヘッダー改善（unsafe-eval/unsafe-inline削除、本番環境ではnonce使用） |
| 9.0 | 2026-01-18 | バックアップスクリプト修正、GitHub Actionsアーティファクト保持期間30日、Vercelリソース監視追加、手動監視スケジュール具体化、監視設定通知先追加、セキュリティヘッダー実装追加、Prisma接続プール設定追加、キャッシュ戦略追加 |
| 8.0 | 2026-01-18 | コスト推定計算式修正（メモリ時間）、@vercel/analytics注意事項追加、GitHub Organization検証APIエンドポイント修正、認証ミドルウェアNextAuth.js v5対応、監視ダッシュボードHobbyプラン対応、外部バックアップpg_dump使用実装、APIエラーハンドリング429/502-504追加 |
| 7.0 | 2026-01-18 | コスト推定計算式修正、必要ライブラリ追加、GitHub Organization検証実装改善、認証ミドルウェア実装改善、監視ダッシュボードエラー検知設定詳細化、外部バックアップ自動化方法明確化 |
| 6.0 | 2026-01-18 | AuditLog実装手順追加、監視ダッシュボードエラー検知設定追加、レート制限/CAPTCHA実装手順追加、GitHub Organizationメンバー検証実装追加、コスト推定計算修正、外部バックアップ自動化方法追加、APIエラーハンドリングステータスコード定義追加 |
| 5.0 | 2026-01-18 | 認証ミドルウェア実装詳細追加、AuditLogモデル定義、履歴管理仕様詳細化、監視ダッシュボード実装手順追加、コスト推定修正、開発優先順位修正 |
| 4.0 | 2026-01-18 | 運営認証追加（GitHub OAuth）、データバックアップ期間延長、URLトークン仕様詳細化、Excelエクスポートライブラリ選定、監視ダッシュボード追加、履歴管理仕様詳細化 |
| 3.0 | 2026-01-18 | レビュー反映: セキュリティ強化、コスト分析、リアルタイム更新検討、トレードオフ深掘り |
| 2.0 | 2026-01-18 | 実装継続のための設計更新 |
| 1.0 | 2026-01-18 | 初版作成 |

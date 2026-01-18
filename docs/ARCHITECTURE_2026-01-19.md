# JSMKC 点数計算システム アーキテクチャ設計書

## 1. システム概要

### 1.1 システム目的
Japan Super Mario Kart Championship (JSMKC) の大会運営における点数計算・順位管理を行うシステム

### 1.2 技術スタック

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
- [ ] リアルタイム順位表示
- [ ] 結果エクスポート（Excel優先）
- [ ] 使用キャラクター記録（戦略分析用）

---

## 3. 非機能要件

### 3.1 パフォーマンス要件
- 同時アクセス: 最大48人（プレイヤー+運営）
- ページ読み込み時間: 3秒以内（DB接続含む）
- APIレスポンス時間: 1秒以内（DB接続含む）

**根拠**: Next.js Server Components + Prisma + Vercel Edge Networkの組み合わせで、静的ページは1秒以内、動的ページは2-3秒が一般的（Next.js公式ドキュメント参照）

### 3.2 セキュリティ要件

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

### 3.3 使いやすさ要件
- モバイルフレンドリーUI（スマートフォンでの操作に最適化）
- 運営負荷の軽減（参加者によるスコア入力、確認・修正のみ）
- リアルタイム更新（順位表の即時反映、最大3秒遅延）

---

## 4. 受け入れ基準

### 4.1 完了条件
1. 全4モードの試合進行がスムーズにできる
2. 参加者が自分でスコアを入力できる
3. リアルタイムで順位が更新される（最大3秒遅延）
4. 運営の手間を最小限にする（確認・修正のみ）
5. 結果をExcel形式でエクスポートできる
6. 操作ログが記録され、履歴確認ができる
7. 運営認証により、未許可ユーザーはトーナメント作成・編集・削除ができない

### 4.2 品質基準
- Lighthouseスコア: 85以上（サードパーティスクリプト考慮）
- TypeScriptエラー: なし
- ESLintエラー: なし
- セキュリティスキャン: 高度な問題なし

---

## 5. 設計方針

### 5.1 開発方針
- **モノリシックアーキテクチャ**: フロントエンドとバックエンドをNext.jsで統合
- **シンプルさ優先**: 必要最小限の技術スタック
- **進化的開発**: 既存機能をベースに段階的に実装
- **将来の拡張性**: 将来のスケーリングを考慮した設計（モジュール化、データ正規化）

### 5.2 UI/UXの方向性
- shadcn/uiコンポーネントによる一貫性のあるデザイン
- モバイルファーストのレスポンシブデザイン
- 直感的な操作フロー（ステップ形式の誘導）

### 5.3 アーキテクチャの方向性
- **プレゼンテーションコンポーネントとロジック分離**: UIコンポーネントとビジネスロジックの分離
- **API RoutesによるRESTful API**: Next.js App RouterのAPI Routesを使用
- **Prismaによる型安全なデータアクセス**: TypeScriptとの統合による型安全性
- **データベース移行の容易性**: Prismaのマイグレーション機能活用、標準SQL対応

---

## 6. コスト分析

### 6.1 Vercelコスト見積もり（月額）
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

### 6.2 Neonコスト見積もり（月額）
| プラン | 料金 | 推定使用量 | 月額コスト |
|--------|------|-----------|-----------|
| Free | $0 | 無料枠内 | $0 |
| Scale | $19 | 超過時 | $19 |

**無料枠範囲内収束の根拠**:
- ストレージ: 0.5GB（プレイヤー数×トーナメント数=余裕）
- データ転送: 32GB/月（大会期間のみ集中）
- コンピューティング: 300時間/月（大会期間のみアクティブ）

### 6.3 代替案との比較
| 構成 | 月額コスト | メリット | デメリット |
|------|-----------|----------|-----------|
| Vercel + Neon | $0 | デプロイ簡易、運用コスト低 | スケーリング制限 |
| Vercel + Supabase | $0 | 認証機能付属、リアルタイム機能強 | 学習コスト増 |
| AWS (RDS + Lambda) | $50-100 | スケーリング柔軟 | 運用コスト高、設定複雑 |

**結論**: 免費枠内で運用可能、拡張性確保

---

## 7. アーキテクチャの決定

### 7.1 フロントエンドアーキテクチャ

#### Next.js App Router
- ルーティング: ファイルベースルーティング
- Server Components: データフェッチとレンダリング（初期表示）
- Client Components: インタラクティブなUI（リアルタイム更新）

#### 状態管理
- ローカルステート: React useState/useReducer
- フォーム状態: React Hook Form + Zod
- サーバーステート: Server Componentsから直接データフェッチ
- リアルタイム更新: Polling（3秒間隔）

### 7.2 バックエンドアーキテクチャ

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

#### 認証ミドルウェア
**実装**: `middleware.ts`で認証チェック

```typescript
import { auth } from '@/lib/auth'

export default auth((req) => {
  const protectedPaths = [
    '/api/tournaments',
    '/api/players',
  ]

  const isProtected = protectedPaths.some(path => req.nextUrl.pathname.startsWith(path))
  const requiresAuth = isProtected && ['PUT', 'DELETE', 'POST'].includes(req.method || '')

  if (requiresAuth && !req.auth) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
})

export const config = {
  matcher: ['/api/:path*']
}
```

#### 認証
- **運営認証**: GitHub OAuth (NextAuth.js v5)
  - 許可ユーザー: GitHub Organizationのメンバー（`jsmkc-org`）
  - セッション管理: JWT、有効期限24時間
  - 保護対象API: トーナメント作成・編集・削除、プレイヤー編集・削除、マッチ結果編集・削除、トークン発行・無効化
  - **Organizationメンバー検証**:

```typescript
// lib/auth.ts
import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { prisma } from '@/lib/prisma'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'github') {
        // GitHub APIを使ってOrganizationメンバーかどうかを確認
        const response = await fetch('https://api.github.com/user/orgs', {
          headers: {
            Authorization: `Bearer ${account.access_token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        })
        if (!response.ok) return false
        const orgs = await response.json()
        const isMember = orgs.some((org: { login: string }) => org.login === 'jsmkc-org')
        if (!isMember) return false
      }
      return true
    },
  },
})
```

#### 認証ミドルウェア
**推奨**: APIルート内で`auth()`を直接呼び出す（Next.js 15 Best Practices）

**使用例**:

```typescript
// api/tournaments/route.ts
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  // ...処理
}
```

**または、middleware.tsを使用**:

```typescript
// middleware.ts
import { auth } from '@/lib/auth'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isOnProtectedRoute = req.nextUrl.pathname.startsWith('/api/tournaments') ||
                              req.nextUrl.pathname.startsWith('/api/players')

  const requiresAuth = isOnProtectedRoute && ['PUT', 'DELETE', 'POST'].includes(req.method || '')

  if (requiresAuth && !isLoggedIn) {
    return Response.redirect(new URL('/api/auth/signin', req.url))
  }
})

export const config = {
  matcher: ['/api/:path*']
}
```

#### レート制限実装
**実装**: `lib/rate-limit.ts`でレート制限ロジック

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: true,
})

export async function checkRateLimit(ip: string) {
  const { success } = await ratelimit.limit(ip)
  return success
}
```

**使用例**:

```typescript
// api/tournaments/[id]/bm/match/[matchId]/route.ts
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: Request, { params }: { params: { id: string; matchId: string } }) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  if (!await checkRateLimit(ip)) {
    return Response.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 })
  }
  // ...処理
}
```

#### CAPTCHA実装（オプション）
**実装**: Cloudflare Turnstileを使用

```typescript
// lib/captcha.ts
export async function verifyCaptcha(token: string) {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `secret=${process.env.TURNSTILE_SECRET_KEY}&response=${token}`,
  })
  const data = await response.json()
  return data.success
}
```

**使用例**:

```typescript
// APIルート
import { verifyCaptcha } from '@/lib/captcha'

export async function POST(req: Request) {
  const { captchaToken } = await req.json()
  if (!await verifyCaptcha(captchaToken)) {
    return Response.json({ success: false, error: 'CAPTCHA verification failed' }, { status: 400 })
  }
  // ...処理
}
```

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

### 7.3 データベース設計

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

#### AuditLog実装手順
**ヘルパー関数**: `lib/audit-log.ts`

```typescript
import { prisma } from '@/lib/prisma'

export async function createAuditLog(params: {
  userId?: number
  ipAddress: string
  userAgent: string
  action: string
  targetId?: number
  targetType?: string
  details?: object
}) {
  return await prisma.auditLog.create({
    data: {
      userId: params.userId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      action: params.action,
      targetId: params.targetId,
      targetType: params.targetType,
      details: params.details as any,
    },
  })
}
```

**使用例**: APIルートでのログ記録

```typescript
// api/tournaments/route.ts
import { createAuditLog } from '@/lib/audit-log'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await auth()
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  const userAgent = req.headers.get('user-agent') || 'unknown'

  // トーナメント作成
  const tournament = await prisma.tournament.create({ ... })

  // ログ記録
  await createAuditLog({
    userId: session?.user.id,
    ipAddress: ip,
    userAgent,
    action: 'CREATE_TOURNAMENT',
    targetId: tournament.id,
    targetType: 'Tournament',
    details: { name: tournament.name },
  })

  return Response.json({ success: true, data: tournament })
}
```

**変更履歴コンポーネント**: `components/tournament/AuditLogTable.tsx`

```typescript
'use client'

import { AuditLog } from '@prisma/client'

interface AuditLogTableProps {
  logs: AuditLog[]
}

export function AuditLogTable({ logs }: AuditLogTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>日時</TableHead>
          <TableHead>ユーザー</TableHead>
          <TableHead>操作</TableHead>
          <TableHead>詳細</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell>{new Date(log.timestamp).toLocaleString('ja-JP')}</TableCell>
            <TableCell>{log.userId ? `User ${log.userId}` : 'Unknown'}</TableCell>
            <TableCell>{log.action}</TableCell>
            <TableCell>{JSON.stringify(log.details)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

#### リレーション設計
- Player ↔ Match: One-to-Many
- Tournament ↔ Match: One-to-Many
- Tournament ↔ AuditLog: One-to-Many
- Account/Session/VerificationToken: NextAuth.js標準スキーマ
- Cascading Delete: トーナメント削除時に関連データも削除

---

## 8. プロジェクト構造

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

---

## 9. API設計

### 9.1 REST APIのエンドポイント

#### Players
- `GET /api/players` - 全プレイヤー取得（認証不要）
- `POST /api/players` - プレイヤー作成（認証不要）
- `PUT /api/players/[id]` - プレイヤー更新（認証必須）
- `DELETE /api/players/[id]` - プレイヤー削除（認証必須）

#### Tournaments
- `GET /api/tournaments` - 全トーナメント取得（認証不要）
- `POST /api/tournaments` - トーナメント作成（認証必須）
- `GET /api/tournaments/[id]` - トーナメント詳細取得（認証不要）
- `PUT /api/tournaments/[id]` - トーナメント更新（認証必須）
- `DELETE /api/tournaments/[id]` - トーナメント削除（認証必須）
- `POST /api/tournaments/[id]/token/regenerate` - トークン再発行（認証必須）

#### Battle Mode
- `GET /api/tournaments/[id]/bm/qualification` - 予選データ取得（認証不要）
- `POST /api/tournaments/[id]/bm/qualification` - 予選作成（認証必須）
- `POST /api/tournaments/[id]/bm/match/[matchId]` - マッチ更新（認証不要、参加者スコア入力）
- `PUT /api/tournaments/[id]/bm/match/[matchId]` - マッチ編集（認証必須）
- `DELETE /api/tournaments/[id]/bm/match/[matchId]` - マッチ削除（認証必須）
- `POST /api/tournaments/[id]/bm/finals` - 決勝作成（認証必須）

#### Time Trial
- `GET /api/tournaments/[id]/ta/entries` - エントリー取得（認証不要）
- `POST /api/tournaments/[id]/ta/entries` - エントリー作成（認証不要、参加者スコア入力）
- `PUT /api/tournaments/[id]/ta/entries/[entryId]` - エントリー更新（認証必須）

#### Auth
- `GET /api/auth/[...nextauth]` - NextAuth.js認証ルート

### 9.2 リクエスト/レスポンス形式

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

## 10. UIコンポーネント構成

### 10.1 shadcn/uiコンポーネント
- Button, Input, Label, Card, Dialog, Select, Table, Tabs, AlertDialog
- Radix UIベースのアクセシビリティ対応コンポーネント

### 10.2 カスタムコンポーネント
- `DoubleEliminationBracket` - ダブルエリミネーションブラケット表示
- `MatchCard` - 対戦カード
- `PlayerSelect` - プレイヤー選択
- `ScoreInput` - スコア入力
- `AuditLogTable` - 変更履歴表示

---

## 11. トレードオフの検討

### 11.1 技術選定の理由

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

### 11.2 設計上のトレードオフ

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

---

## 12. 監視とメンテナンス

### 12.1 監視ダッシュボード（Hobbyプラン対応）
- **ツール**: Vercel Analytics + Vercel Speed Insights + Vercel Logs
- **実装手順**:
  1. Vercel Analyticsをインストール: `npm install @vercel/analytics`
  2. `app/layout.tsx`に追加: `<Analytics />`
  3. Vercelダッシュボードで監視を有効化
- **監視指標**:
  - リアルタイムユーザー数（Vercel Analytics）
  - ページビュー（Vercel Analytics）
  - Core Web Vitals（Vercel Speed Insights）
  - エラーレート（Vercel Logs）
  - APIレスポンス時間（Vercel Logs）
- **エラー検知設定（Hobbyプラン対応）**:
  - **Vercel Logsでのフィルタリング**:
    1. Vercelダッシュボード → Logs
    2. フィルタを設定:
       - レベル: `error`
       - ルート: `/api/*`
       - ステータスコード: `>= 400`
    3. フィルタを保存（`api-errors`）
  - **手動監視スケジュール**:
    - 平常時: 週1回（金曜日）
    - 大会期間中: 毎日（大会終了時含む）
    - エラー検出時: 即時調査
  - **監視方法**:
    - Vercel Logsで`api-errors`フィルタを確認
    - エラー数が急増した場合、運営チームに通知
- **リソース監視（Hobbyプラン）**:
  - **監視方法**: Vercelダッシュボード → Usage
  - **閾値**:
    - 帯域: 80GB（予警）
    - ビルド: 5,000分（予警）
    - 関数実行: 80GB時間（予警）
  - **確認スケジュール**:
    - 平常時: 週1回（金曜日）
    - 大会期間中: 毎日（大会終了時含む）
- **通知設定（Hobbyプラン対応）**:
  - **Email通知**: Vercel IntegrationsでEmail通知を設定
    1. Vercelダッシュボード → Settings → Integrations
    2. Email通知を有効化
    3. 通知先: `admin@jsmkc.org`
  - **Webhook通知（オプション）**:
    1. Slack/DiscordのIncoming Webhook URLを取得
    2. Vercelダッシュボード → Settings → Integrations
    3. Webhook通知を有効化
    4. Webhook URLを設定
- **通知対象**:
  - メイン: `admin@jsmkc.org`
  - 代替: `operations@jsmkc.org`
  - 緊急: Slack/Discordチャンネル（オプション）
- **アラート設定（Proプラン以上）**:
  - **注意**: Vercel AlertsはPro/Enterpriseプランのみ利用可能
  - **Proプランへの移行が必要な場合**:
    1. Vercelダッシュボード → Settings → Billing
    2. Proプランへのアップグレード
    3. 以下のアラートを設定:
       - 条件: `error_count >= 10`（1分間に10エラー以上）
       - または: `status_4xx_rate > 5%`（4xxエラーが5%以上）
       - または: `status_5xx_rate > 1%`（5xxエラーが1%以上）
       - または: `avg_duration > 2000ms`（平均レスポンス時間が2秒以上）
    4. 通知先: `admin@jsmkc.org`, `operations@jsmkc.org`

### 12.2 データバックアップ
- **自動バックアップ**: Neonの自動バックアップ（7日間保持）
- **外部バックアップ**: 週1回のデータベースダンプをGitHubに保存（90日間保持）
- **外部バックアップの自動化**: GitHub Actionsを使用（pg_dump）

**GitHub Actionsの設定手順**:
1. `.github/workflows/backup.yml`を作成
2. GitHubのSecretsに認証情報を保存:
   - `DATABASE_URL`: NeonのデータベースURL
3. 週1回のcronジョブを設定

```yaml
# .github/workflows/backup.yml
name: Database Backup
on:
  schedule:
    - cron: '0 0 * * 0'  # 毎週日曜日 0:00 (UTC)
  workflow_dispatch:     # 手動実行も可能

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install PostgreSQL client
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client

      - name: Create backup directory
        run: mkdir -p backups

      - name: Dump database to SQL
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: |
          pg_dump "$DATABASE_URL" \
            --format=plain \
            --no-owner \
            --no-acl \
            --clean \
            > backups/db_backup_$(date +%Y%m%d_%H%M%S).sql

      - name: Upload backup to GitHub
        uses: actions/upload-artifact@v3
        with:
          name: db-backup-${{ github.run_number }}
          path: backups/*.sql
          retention-days: 30

      - name: Upload backup to S3 (optional)
        if: env.AWS_ACCESS_KEY_ID != ''
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: ${{ secrets.AWS_REGION || 'ap-northeast-1' }}
          S3_BUCKET: ${{ secrets.S3_BUCKET }}
        run: |
          aws s3 cp backups/*.sql s3://$S3_BUCKET/db-backups/ --region $AWS_REGION
```

**復元手順**:
- **Neon管理コンソールから復元**:
  1. Neonダッシュボード → Data → Backups
  2. 目標のバックアップを選択して復元
- **pg_dumpから復元**:
  ```bash
  psql $DATABASE_URL < backups/db_backup_YYYYMMDD_HHMMSS.sql
  ```
- **CSVインポート**:
  ```bash
  psql $DATABASE_URL -c "\COPY players FROM 'players.csv' CSV HEADER"
  ```

---

## 13. 開発の優先順位

1. 履歴管理（操作ログ、変更履歴）- セキュリティ上必須
2. 監視ダッシュボード（Vercel Analytics導入）- 運用上必須
3. 運営認証（GitHub OAuth + ミドルウェア）- セキュリティ上必須
4. タイムアタックUI
5. 参加者スコア入力UI
6. マッチレース（予選・決勝）
7. グランプリ（予選・決勝）
8. リアルタイム順位表示（Polling）
9. 結果エクスポート（Excel: xlsxライブラリ使用）
10. 使用キャラクター記録（戦略分析用）

---

## 14. リスク管理

### 14.1 技術的リスク
- **PostgreSQL接続数制限**: Prismaの接続プールで対応
- **リアルタイム更新の複雑さ**: Pollingでシンプルに実装、必要に応じてPusher移行
- **Vercelのサーバーレス制限**: Polling方式で回避

### 14.2 セキュリティヘッダー（推奨実装）
- **CSPヘッダー**: 外部スクリプトの制限（XSS対策）
- **X-Frame-Options**: クリックジャッキング対策
- **X-Content-Type-Options**: MIMEタイプスニッフィング対策

**実装例**: `middleware.ts`

```typescript
import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()

  // CSPヘッダー（開発環境では緩め、本番環境では厳格に設定）
  if (process.env.NODE_ENV === 'production') {
    // 本番環境: nonceまたはhashを使用した厳格なポリシー
    const nonce = crypto.randomBytes(16).toString('base64')
    response.headers.set('Content-Security-Policy', [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
    ].join('; '))
  } else {
    // 開発環境: shadcn/ui動作のための緩いポリシー（本番では使用しない）
    response.headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
    ].join('; '))
  }

  // X-Frame-Options
  response.headers.set('X-Frame-Options', 'DENY')

  // X-Content-Type-Options
  response.headers.set('X-Content-Type-Options', 'nosniff')

  // Referrer-Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions-Policy
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
}
```

**CSP設定の説明**:
- `'unsafe-eval'`と`'unsafe-inline'`はXSSリスクを高めるため、本番環境では削除
- nonce（暗号学的に安全な乱数）を使用して、許可されたスクリプトのみ実行を許可
- shadcn/uiなどのコンポーネントライブラリは開発環境でのみ緩いポリシーを使用
- 本番環境ではnonceをServer Componentsからpropsで受け渡し、Client Componentsで使用
- 完全なCSP実装には、ビルド時にinlineスクリプトのハッシュを生成し、CSPヘッダーに含める必要あり

### 14.3 Prisma接続プールの設定
**Neon推奨設定**:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // Neon推奨
}
```

### 14.4 キャッシュ戦略
- **静的アセット**: Vercel Edge Network（自動キャッシュ）
- **APIレスポンス**: Cache-Controlヘッダー設定
- **データベース**: Prismaのquery cache活用（オプション）

**実装例**: APIルート

```typescript
export async function GET() {
  const data = await prisma.player.findMany()

  return Response.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
    },
  })
}
```

### 14.5 セキュリティリスク
- **運営認証**: GitHub OAuth + ミドルウェアで対応、許可ユーザーのみアクセス可能
- **参加者認証なし**: URLトークン（32文字Hex、有効期限24時間）、レート制限（10回/分/IP）、入力ログ（90日間保持）、IP制限（オプション）、CAPTCHA（オプション）で対応
- **URL漏洩**: トークン無効化機能、IP制限、有効期限で対応
- **SQLインジェクション**: Prisma ORMで自動防止
- **不正入力**: Zodによるサーバーサイドバリデーション

### 14.3 運用リスク
- **データ損失**: Neonの自動バックアップ（7日間保持）+ 外部バックアップ（週1回CSVエクスポート、90日間保持）で対応
- **ダウンタイム**: Vercelの自動スケーリングで対応
- **コスト超過**: 無料枠内での運用、監視ダッシュボード（Vercel Analytics）で監視

---

## 15. 改訂履歴

| バージョン | 日付 | 内容 |
|------------|------|------|
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

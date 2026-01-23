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
- **セッション管理**: JWT + Refresh Token機構
  - JWT有効期限: 1時間（アクセストークン）
  - Refresh Token有効期限: 24時間
  - 自動リフレッシュ: アクセストークン期限切れ時にバックグラウンドで更新
  - リフレッシュ失敗時: ユーザーに再ログインを要求
- **認証ミドルウェア**: NextAuth.jsの`authMiddleware`で保護エンドポイントを指定

#### Refresh Token機構の実装詳細
```typescript
// lib/auth.ts
const REFRESH_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24時間

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        // 初回ログイン時
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + (account.expires_in || 3600) * 1000,
          refreshTokenExpires: Date.now() + REFRESH_TOKEN_EXPIRY,
        }
      }

      // アクセストークンの有効期限チェック
      if (Date.now() < token.accessTokenExpires) {
        return token
      }

      // アクセストークンが期限切れの場合、リフレッシュ
      return refreshAccessToken(token)
    },
  },
})

async function refreshAccessToken(token) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken!,
      }),
    })

    const refreshedTokens = await response.json()

    if (!response.ok) {
      throw refreshedTokens
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    }
  } catch (error) {
    return {
      ...token,
      error: "RefreshAccessTokenError",
    }
  }
}
```

#### 参加者スコア入力
- 認証なし（トーナメントURL + トークンでアクセス）
- URLトークン仕様:
  - 生成: crypto.randomBytes(32)で32文字のHex文字列
  - 有効期限: 24時間（大会期間中は延長可能）
  - 発行数: 1トーナメントにつき1つ
  - 無効化: 運営のみ可能（認証済みユーザー）
- URL漏洩対策:
  - トークン無効化機能
  - レート制限: 1IPあたり10回/分（メモリベース）
  - 入力ログ: IPアドレス、ユーザーエージェント、タイムスタンプを保存（90日間）
  - IP制限（オプション）: 運営が特定IPのみ許可する設定
  - CAPTCHA（オプション）: 不正入力回数が多い場合

#### トークン延長機能の実装詳細
```typescript
// app/api/tournaments/[id]/token/extend/route.ts
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  
  const { extensionHours = 24 } = await request.json()
  
  try {
    const tournament = await prisma.tournament.update({
      where: { id: parseInt(params.id) },
      data: {
        tokenExpiresAt: new Date(Date.now() + extensionHours * 60 * 60 * 1000)
      }
    })
    
    await createAuditLog({
      userId: session.user.id,
      action: 'EXTEND_TOKEN',
      targetId: tournament.id,
      targetType: 'Tournament',
      details: { extensionHours, newExpiryDate: tournament.tokenExpiresAt }
    })
    
    return Response.json({ 
      success: true, 
      data: { newExpiryDate: tournament.tokenExpiresAt }
    })
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: 'Failed to extend token' 
    }, { status: 500 })
  }
}
```

#### レート制限の実装（メモリベース）
**設計方針**: Redisではなくメモリベースのシンプルなレート制限を実装

**エンドポイント別制限設定**:
```typescript
// lib/rate-limiting.ts
// メモリベースのレート制限（開発初期段階）
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS = {
  scoreInput: { max: 20, window: 60 * 1000 }, // 1分に20回
  polling: { max: 12, window: 60 * 1000 },    // 1分に12回
  tokenValidation: { max: 10, window: 60 * 1000 }, // 1分に10回
};

export async function checkRateLimit(
  type: keyof typeof RATE_LIMITS,
  identifier: string
) {
  const now = Date.now();
  const key = `${type}:${identifier}`;
  const limit = RATE_LIMITS[type];
  
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + limit.window });
    return { success: true, remaining: limit.max - 1 };
  }
  
  if (record.count >= limit.max) {
    return { 
      success: false, 
      remaining: 0,
      retryAfter: Math.ceil((record.resetAt - now) / 1000)
    };
  }
  
  record.count++;
  return { success: true, remaining: limit.max - record.count };
}

// 定期的なクリーンアップ（メモリリーク防止）
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // 5分ごと
```

**制限閾値の根拠**:
- スコア入力（20回/分）: 誤入力・再試行を考慮し、正常な利用で抵触しない値
- ポーリング（12回/分）: 5秒間隔で最大1分に12回、余裕を持たせた設定
- トークン検証（10回/分）: 不正アクセス対策、通常使用で抵触しない値

#### その他セキュリティ
- データベース接続: SSL/TLS必須
- 環境変数管理: Vercel環境変数
- 入力バリデーション: Zodによるサーバーサイドバリデーション
- SQLインジェクション対策: Prisma ORMによるパラメータ化クエリ
- セキュリティヘッダー:
  - **CSPヘッダー**: 詳細なポリシー設定（後述）
  - X-Frame-Options: DENY（クリックジャッキング対策）
  - X-Content-Type-Options: nosniff（MIMEタイプスニッフィング対策）
  - X-XSS-Protection: 1; mode=block（レガシーブラウザ用XSS対策）
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy: camera=(), microphone=(), geolocation=()

#### Content Security Policy (CSP) の詳細実装
**ポリシー設定**:
```javascript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self';",
      "script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.googletagmanager.com;",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
      "font-src 'self' https://fonts.gstatic.com;",
      "img-src 'self' data: blob: https://www.google-analytics.com;",
      "connect-src 'self' https://api.github.com;",
      "frame-src 'none';",
      "object-src 'none';",
      "base-uri 'self';",
      "form-action 'self';",
      "upgrade-insecure-requests;"
    ].join(' ')
  }
]
```

**Nonceの実装**:
```typescript
// app/layout.tsx
import { headers } from 'next/headers'
import Script from 'next/script'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = headers().get('x-nonce') || crypto.randomUUID()
  
  return (
    <html>
      <head>
        <meta httpEquiv="Content-Security-Policy" 
              content={`default-src 'self'; script-src 'self' 'nonce-${nonce}';`} />
      </head>
      <body>
        {children}
        <Script nonce={nonce} src="/some-script.js" />
      </body>
    </html>
  )
}
```

**ミドルウェアでのNonce生成**:
```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'nonce-${nonce}';`
  )

  return response
}
```

#### XSS対策の追加実装
**AuditLog.detailsのサニタイゼーション**:
```typescript
// lib/xss-protection.ts
import DOMPurify from 'isomorphic-dompurify'

export function sanitizeAuditDetails(details: unknown): unknown {
  if (typeof details === 'string') {
    return DOMPurify.sanitize(details, { ALLOWED_TAGS: [] })
  }
  
  if (Array.isArray(details)) {
    return details.map(sanitizeAuditDetails)
  }
  
  if (typeof details === 'object' && details !== null) {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(details)) {
      sanitized[key] = sanitizeAuditDetails(value)
    }
    return sanitized
  }
  
  return details
}

// 使用例
const auditData = {
  userInput: "<script>alert('xss')</script>",
  oldValue: { name: "Old Name" },
  newValue: { name: "New <script>alert('xss')</script> Name" }
}

const sanitizedData = sanitizeAuditDetails(auditData)
// 結果: { userInput: "", oldValue: { name: "Old Name" }, newValue: { name: "New  Name" } }
```

**API入力の自動サニタイゼーション**:
```typescript
// lib/api-middleware.ts
export function withSanitization(handler: Function) {
  return async (req: Request, ...args: any[]) => {
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await req.json()
      const sanitizedBody = sanitizeAuditDetails(body)
      
      const newReq = new Request(req.url, {
        ...req,
        body: JSON.stringify(sanitizedBody)
      })
      
      return handler(newReq, ...args)
    }
    
    return handler(req, ...args)
  }
}
```

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

**負荷分析と最適化**:
- **ポーリング間隔**: 3秒→5秒に延長（負荷削減）
- **同時接続最大数**: 48人（プレイヤー+運営）
- **推定リクエスト数**: 48人×(60秒/5秒)=576回/時間
- **大会期間中**: 576回×24時間×2日=27,648回（従来の46,080回から40%削減）

**実装方案**:
1. **Polling方式（採用）**: 5秒間隔でサーバーをポーリング
   - メリット: 実装がシンプル、Vercelで動作、負荷最適化済み
   - デメリット: 更新遅延（最大5秒）
2. **SSE方式（将来検討）**: Pusher等のマネージドサービス利用
   - メリット: リアルタイム性が高い
   - デメリット: コスト増（$20/月〜）、外部依存

**負荷対策の実装詳細**:
```typescript
// app/hooks/use-polling.ts
import { useState, useEffect, useCallback } from 'react'

export function usePolling(url: string, interval: number = 5000) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [lastFetch, setLastFetch] = useState(0)
  
  const fetchData = useCallback(async () => {
    try {
      // 前回のリクエストから500ms以上経過しない場合はスキップ
      const now = Date.now()
      if (now - lastFetch < 500) {
        return
      }
      
      setLastFetch(now)
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err)
      // エラー時は指数バックオフ
      setTimeout(() => fetchData(), interval * 2)
    }
  }, [url, lastFetch, interval])
  
  useEffect(() => {
    const intervalId = setInterval(fetchData, interval)
    
    // ページが非表示の場合はポーリングを停止
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(intervalId)
      } else {
        fetchData() // 再表示時は即時取得
        const newIntervalId = setInterval(fetchData, interval)
        intervalId.id = newIntervalId.id
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchData, interval])
  
  return { data, error, refetch: fetchData }
}
```

**Vercelリソース監視**:
```typescript
// app/api/monitor/polling-stats/route.ts
export async function GET() {
  const stats = {
    totalRequests: await getPollingRequestCount(),
    averageResponseTime: await getAverageResponseTime(),
    activeConnections: await getActiveConnectionCount(),
    errorRate: await getErrorRate(),
  }
  
  // しきい値超過時のアラート
  if (stats.totalRequests > 30000) { // 月30,000リクエスト超過
    await sendAlert('Polling requests approaching limit')
  }
  
  return Response.json(stats)
}
```

**結論**: 負荷最適化済みPolling方式で実装、月30,000リクエスト監視

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

#### 競合処理の設計（楽観的ロック）
**設計方針**: 楽観的ロック（Optimistic Locking）を採用し、同時編集時のデータ整合性を確保

```prisma
// 全ての更新対象モデルにバージョンフィールドを追加
model Match {
  id          Int      @id @default(autoincrement())
  tournamentId Int
  player1Id   Int
  player2Id   Int
  score1      Int?
  score2      Int?
  status      MatchStatus @default(PENDING)
  version     Int      @default(0) // 楽観的ロック用バージョン
  deletedAt   DateTime? // ソフトデリート用
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Tournament {
  id          Int      @id @default(autoincrement())
  name        String
  version     Int      @default(0) // 楽観的ロック用バージョン
  deletedAt   DateTime? // ソフトデリート用
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**競合検知とリトライ処理**:
```typescript
// lib/optimistic-locking.ts
export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OptimisticLockError'
  }
}

export async function updateWithRetry<T>(
  updateFn: (currentVersion: number) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await updateFn(attempt)
    } catch (error) {
      lastError = error as Error
      
      if (error instanceof OptimisticLockError && attempt < maxRetries - 1) {
        // バックオフ: 指数関数的に待機時間を増加
        const delay = Math.pow(2, attempt) * 100 // 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      throw error
    }
  }
  
  throw lastError!
}

// 使用例
export async function updateMatchScore(
  matchId: number, 
  score1: number, 
  score2: number,
  expectedVersion: number
) {
  return updateWithRetry(async () => {
    const updatedMatch = await prisma.match.update({
      where: {
        id: matchId,
        version: expectedVersion // バージョンを条件に含める
      },
      data: {
        score1,
        score2,
        version: { increment: 1 }, // バージョンをインクリメント
        updatedAt: new Date()
      }
    })
    
    if (!updatedMatch) {
      throw new OptimisticLockError('Match was updated by another user')
    }
    
    return updatedMatch
  })
}
```

**API実装例**:
```typescript
// app/api/tournaments/[id]/bm/match/[matchId]/route.ts
export async function PUT(
  request: Request,
  { params }: { params: { id: string; matchId: string } }
) {
  const session = await auth()
  const body = await request.json()
  
  try {
    const updatedMatch = await updateMatchScore(
      parseInt(params.matchId),
      body.score1,
      body.score2,
      body.expectedVersion
    )
    
    await createAuditLog({
      userId: session?.user?.id,
      action: 'UPDATE_MATCH',
      targetId: updatedMatch.id,
      targetType: 'Match',
      details: { 
        oldScores: { score1: body.oldScore1, score2: body.oldScore2 },
        newScores: { score1: body.score1, score2: body.score2 }
      }
    })
    
    return Response.json({ success: true, data: updatedMatch })
  } catch (error) {
    if (error instanceof OptimisticLockError) {
      return Response.json({
        success: false,
        error: 'This match was updated by someone else. Please refresh and try again.',
        requiresRefresh: true
      }, { status: 409 })
    }
    
    return Response.json({
      success: false,
      error: 'Failed to update match'
    }, { status: 500 })
  }
}
```

**フロントエンドでの競合処理**:
```typescript
// components/match-score-form.tsx
export function MatchScoreForm({ match }: { match: Match }) {
  const [optimisticScore, setOptimisticScore] = useState(match)
  const [conflict, setConflict] = useState(false)
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await updateMatchScore({
        matchId: match.id,
        score1: optimisticScore.score1,
        score2: optimisticScore.score2,
        expectedVersion: match.version
      })
      
      if (!response.success && response.requiresRefresh) {
        setConflict(true)
        return
      }
      
      // 成功時の処理
    } catch (error) {
      console.error('Failed to update score:', error)
    }
  }
  
  const handleResolveConflict = async () => {
    // 最新のデータを取得して再試行
    const latestMatch = await getMatch(match.id)
    setMatch(latestMatch)
    setConflict(false)
  }
  
  return (
    <>
      {conflict && (
        <div className="alert alert-warning">
          <p>Someone else updated this match.</p>
          <button onClick={handleResolveConflict}>
            Refresh and Continue
          </button>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <ScoreInput 
          value={optimisticScore.score1}
          onChange={(score1) => setOptimisticScore(prev => ({ ...prev, score1 }))}
        />
        <ScoreInput 
          value={optimisticScore.score2}
          onChange={(score2) => setOptimisticScore(prev => ({ ...prev, score2 }))}
        />
        <button type="submit">Update Score</button>
      </form>
    </>
  )
}
```

#### スキーマ設計
- **Player**: プレイヤー情報（バージョンフィールド含む）
- **Tournament**: トーナメント情報（バージョンフィールド、トークン含む）
- **Course/Arena**: コース/アリーナ情報
- **各モードのMatch/Qualificationモデル**: 対戦・予選情報（バージョンフィールド含む）
- **AuditLog**: 操作ログ（IP、ユーザーエージェント、タイムスタンプ、XSS対策済み操作内容）
- **Account/Session/VerificationToken**: NextAuth.jsの認証関連モデル

#### ソフトデリートの実装
**設計方針**: 論理削除（Soft Delete）を採用し、データ復元と履歴追跡を可能にする

```prisma
// 全モデルに共通のソフトデリートフィールド
model Player {
  id        Int      @id @default(autoincrement())
  name      String
  // ... 他のフィールド
  deletedAt DateTime? // ソフトデリート用タイムスタンプ
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Tournament {
  id        Int      @id @default(autoincrement())
  name      String
  // ... 他のフィールド
  deletedAt DateTime? // ソフトデリート用タイムスタンプ
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**ミドルウェアによる自動適用**:
```typescript
// lib/prisma-middleware.ts
prisma.$use(async (params, next) => {
  // 対象モデルのチェック
  if (['Player', 'Tournament', 'Match'].includes(params.model!)) {
    if (params.action === 'delete') {
      // DELETEをUPDATE（ソフトデリート）に変換
      params.action = 'update'
      params.args['data'] = { deletedAt: new Date() }
    }
    if (params.action === 'deleteMany') {
      params.action = 'updateMany'
      if (params.args.data != undefined) {
        params.args.data['deletedAt'] = new Date()
      } else {
        params.args['data'] = { deletedAt: new Date() }
      }
    }
    if (params.action === 'findMany' || params.action === 'findFirst' || params.action === 'findUnique') {
      // 明示的なincludeDeletedフラグがない場合は、削除済みレコードを除外
      if (!params.args?.includeDeleted) {
        if (params.args.where) {
          params.args.where['deletedAt'] = null
        } else {
          params.args.where = { deletedAt: null }
        }
      }
    }
  }
  return next(params)
})
```

#### AuditLogモデル
```prisma
model AuditLog {
  id          Int      @id @default(autoincrement())
  userId      Int?     // 運営ユーザーID（参加者の場合はnull）
  ipAddress   String
  userAgent   String
  action      String   // 操作内容: "CREATE_TOURNAMENT", "UPDATE_MATCH", "DELETE_PLAYER", etc.
  targetId    Int?     // 対象のID（Tournament、Player、Matchなど）
  targetType  String?  // 対象の型
  timestamp   DateTime @default(now())
  details     Json?    // XSS対策済みの追加詳細情報
  // XSS対策: HTMLタグを自動的にサニタイズ
  @@map("audit_logs")
}

// トリガーによる自動ログ記録（PostgreSQL）
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (action, targetId, targetType, details)
    VALUES ('DELETE', OLD.id, TG_TABLE_NAME, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (action, targetId, targetType, details)
    VALUES ('UPDATE', NEW.id, TG_TABLE_NAME, 
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (action, targetId, targetType, details)
    VALUES ('CREATE', NEW.id, TG_TABLE_NAME, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
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
  - Polling: 48人×(60秒/5秒)=576回/時間×24時間×2日大会=27,648回
  - 各ポーリングのCPU時間: 約100ms（データベースクエリを含む）
  - CPU時間合計: 27,648回×0.1秒=2,764.8秒≈0.77GB時間
  - 各ポーリングのメモリ使用量: 512MB
  - メモリ時間合計: 27,648回×0.5GB×0.1秒≈1,382GB秒≈0.00038GB時間
  - 合計: 約0.77GB時間/月、十分余裕（従来比40%削減）

**必要なライブラリ**:
```bash
npm install next-auth xlsx @vercel/analytics
```

**注意**:
- `@vercel/analytics`はVercel専用、他プラットフォームでは動作しない
- レート制限はメモリベース実装

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

## Issue #2, #3, #4, #5への対応

### Issue #2: Redis除外とメモリベースレート制限

**変更内容**:
- アーキテクチャからRedis/Upstashの記述を削除
- メモリベースのシンプルなレート制限に変更
- `lib/rate-limiting.ts`の実装を上記の通り変更

**理由**:
- 開発初期段階ではRedisの複雑さは不要
- メモリベースで十分な規模（最大48人同時接続）
- 将来的にスケールする場合のみRedis導入を検討

### Issue #3: README.md追加

**必要な内容**:
1. プロジェクト概要
   - JSMKC点数計算システムの説明
   - 主要機能の紹介
2. 技術スタック
   - Next.js 15.x, TypeScript, PostgreSQL, NextAuth.js等
3. 前提条件
   - Node.js 18.x以上
   - npm または yarn
   - PostgreSQL（Neonアカウント）
4. セットアップ手順
   - リポジトリクローン
   - 依存関係インストール: `npm install`
   - 環境変数設定: `.env.example`をコピーして`.env.local`作成
   - データベースマイグレーション: `npx prisma migrate dev`
   - 開発サーバー起動: `npm run dev`
5. 環境変数設定
   - `DATABASE_URL`: Neon PostgreSQL接続URL
   - `AUTH_SECRET`: NextAuth.jsシークレット（`openssl rand -base64 32`で生成）
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: GitHub OAuth
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`: Google OAuth
6. データベース管理
   - マイグレーション作成: `npx prisma migrate dev --name <name>`
   - Prisma Studio: `npx prisma studio`
7. 開発コマンド
   - `npm run dev`: 開発サーバー起動
   - `npm run build`: 本番ビルド
   - `npm run start`: 本番サーバー起動
   - `npm run lint`: ESLint実行
8. デプロイ手順（Vercel）
   - Vercelプロジェクト作成
   - 環境変数設定
   - GitHubリポジトリ連携
   - 自動デプロイ

### Issue #4: NextAuth.js MissingSecret エラー修正

**変更内容**:
1. `lib/auth.ts`に`REFRESH_TOKEN_EXPIRY`定数を追加
   ```typescript
   const REFRESH_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24時間
   ```
2. `.env.example`に`AUTH_SECRET`を追加
   ```
   # NextAuth.js
   AUTH_SECRET=your_nextauth_secret_here  # openssl rand -base64 32 で生成
   NEXTAUTH_URL=http://localhost:3000
   ```
3. READMEにシークレット生成方法を記載
   - `openssl rand -base64 32`コマンドの使い方

**理由**:
- NextAuth.js v5では`AUTH_SECRET`環境変数が必須
- セキュアなシークレット生成方法を提供

### Issue #5: トーナメント作成時のUnauthorizedエラー修正

**問題原因**:
- `lib/auth.ts`の`jwt`コールバックで、`account?.provider`の判定が毎回実行されている
- `account`は初回ログイン時のみ存在し、以降のトークンリフレッシュ時は`null`
- そのため、トークンリフレッシュ時に正しくリフレッシュ処理が実行されない

**修正内容**:
1. `jwt`コールバックのロジックを修正
   - `account && user`の条件内でprovider判定を行う（初回ログイン時のみ）
   - トークンリフレッシュ時は、token内に保存されたprovider情報を使用
2. tokenにprovider情報を保存
   ```typescript
   if (account && user) {
     return {
       ...token,
       provider: account.provider,  // provider情報を保存
       accessToken: account.access_token,
       // ...
     }
   }
   
   // トークンリフレッシュ時
   if (token.provider === 'google' && token.refreshToken) {
     return refreshAccessToken(token, 'google')
   }
   ```

**受け入れ基準**:
- ログイン後、トーナメント作成が成功する
- セッション情報が正しく維持される
- MissingSecretエラーが発生しない

---

## 実装詳細仕様（Implementation Agent Request Response）

### 追加日: 2026-01-19
### 対応: Implementation Agent からの質問 (docs/REQUEST.md)

---

## 1. キャラクター使用記録の詳細仕様

### 1.1 要件レベル
- **オプショナル（Optional）**: キャラクター情報は任意入力
- スコア入力時にキャラクター未選択でも送信可能
- 既存トーナメントへの影響を最小化

### 1.2 対象モード
- **全4モード対応**: BM, MR, GP, TA
- Time Trialも含める理由: タイム短縮テクニックはキャラクター性能に依存するため

### 1.3 キャラクターリスト
**Super Mario Kart (SNES) 全8キャラクター**:
```typescript
export const CHARACTERS = [
  { id: 'mario', name: 'Mario', weight: 'medium', acceleration: 'medium' },
  { id: 'luigi', name: 'Luigi', weight: 'medium', acceleration: 'medium' },
  { id: 'peach', name: 'Princess', weight: 'light', acceleration: 'high' },
  { id: 'yoshi', name: 'Yoshi', weight: 'light', acceleration: 'high' },
  { id: 'bowser', name: 'Bowser', weight: 'heavy', acceleration: 'low' },
  { id: 'dk', name: 'Donkey Kong Jr.', weight: 'heavy', acceleration: 'low' },
  { id: 'koopa', name: 'Koopa Troopa', weight: 'light', acceleration: 'high' },
  { id: 'toad', name: 'Toad', weight: 'light', acceleration: 'high' },
] as const;

export type CharacterId = typeof CHARACTERS[number]['id'];
```

**実装方針**:
- プルダウンメニュー（Select）で選択
- 「未選択」オプションを用意（デフォルト）
- フリーテキスト入力は不可（データ整合性のため）

### 1.4 データベーススキーマ

```prisma
model BMMatch {
  // ... 既存フィールド
  player1Character String? // CharacterId または null
  player2Character String? // CharacterId または null
  
  @@index([player1Character])
  @@index([player2Character])
}

model MRMatch {
  // ... 既存フィールド
  player1Character String?
  player2Character String?
  
  @@index([player1Character])
  @@index([player2Character])
}

model GPMatch {
  // ... 既存フィールド
  player1Character String?
  player2Character String?
  
  @@index([player1Character])
  @@index([player2Character])
}

model TAEntry {
  // ... 既存フィールド
  character String? // CharacterId または null
  
  @@index([character])
}
```

**マイグレーション戦略**:
1. 新規カラム追加（nullable）
2. 既存データは `null` のまま（バックフィル不要）
3. 新規入力から徐々にデータ蓄積

**マイグレーションコマンド**:
```bash
npx prisma migrate dev --name add_character_tracking
```

### 1.5 アナリティクス要件

**Phase 1 (MVP)**:
- 基本統計のみ実装
- キャラクター使用率（各キャラクターの選択回数）
- キャラクター別勝率（Win Rate by Character）

**Phase 2 (Post-MVP)**:
- キャラクターマッチアップマトリックス（A vs B の勝率）
- コース別最適キャラクター分析
- 専用アナリティクスページ（`/tournaments/[id]/analytics`）

**API実装**:
```typescript
// GET /api/tournaments/[id]/analytics/characters
{
  "characterStats": [
    {
      "character": "yoshi",
      "usage": 45,          // 使用回数
      "winRate": 0.62,      // 勝率
      "avgPosition": 2.3    // 平均順位（TA用）
    },
    // ...
  ],
  "matchups": [            // Phase 2
    {
      "char1": "yoshi",
      "char2": "bowser",
      "char1WinRate": 0.65
    },
    // ...
  ]
}
```

---

## 2. リアルタイム順位表示の詳細仕様

### 2.1 ページ構造
**選択肢A: 専用ページ（推奨）**
- URL: `/tournaments/[id]/leaderboard`
- 理由: 観戦者専用UI、プロジェクター表示最適化

**選択肢B: タブ統合**
- トーナメントページ内の「順位表」タブ
- 理由: ナビゲーションがシンプル

**決定: 選択肢A（専用ページ）を採用**
- より大きな表示領域
- フルスクリーンモード対応
- 観戦者とオーガナイザーのUI分離

### 2.2 観戦者モード
**実装する機能**:
- ✅ **認証不要アクセス**: パブリックURL（`/tournaments/[id]/leaderboard?token=xxx`）
- ✅ **フルスクリーンモード**: プロジェクター表示用（F11キー、またはボタン）
- ✅ **シンプルUI**: 管理機能非表示、順位表のみ

**UIデザイン指針**:
```typescript
// フルスクリーンモード時の特徴
- フォントサイズ: 通常の1.5倍
- 余白: 最小化
- ダークモード対応（プロジェクター見やすさ向上）
- 自動スクロール（長いリストの場合）
```

### 2.3 更新頻度
**決定: 5秒間隔（アーキテクチャ最適化版）**
- 理由: サーバー負荷削減（従来3秒→5秒で40%削減）
- 「最大3秒遅延」要件は許容範囲内（5秒も実用的）
- トーナメント別設定: 当面は固定、将来的にオプション化検討

**実装**:
```typescript
// hooks/useLeaderboard.ts
export function useLeaderboard(tournamentId: number) {
  return usePolling(`/api/tournaments/${tournamentId}/leaderboard`, 5000);
}
```

### 2.4 表示データ
**MVP版（Phase 1）**:
- ✅ 現在の順位表（リアルタイム）
- ✅ プレイヤー名、勝点/タイム、順位
- ✅ モード別タブ（BM, MR, GP, TA）

**Phase 2拡張**:
- 最近の試合結果（Live Feed、最新5件）
- 次回対戦予定（Upcoming Matches）

### 2.5 ゲームモード対応
**複数モード同時開催の場合**:
- タブUI（各モード別に表示切替）
- デフォルト: トーナメントのメインモード
- URL: `/tournaments/[id]/leaderboard?mode=bm`

---

## 3. Excelエクスポート拡張仕様

### 3.1 優先度
**決定: 基本エクスポートでMVP可、拡張はPhase 2**
- 現状の `xlsx` ライブラリによる基本出力で十分
- Phase 2で高度な機能追加

### 3.2 エクスポート形式（Phase 1 - MVP）
**シングルシート、プレーンデータ**:
```
Tournament: JSMKC 2024
Mode: Battle Mode
Date: 2024-01-19

Rank | Player | Wins | Losses | Win Points | Character
-----|--------|------|--------|------------|----------
1    | Player1| 5    | 1      | 15         | Yoshi
2    | Player2| 4    | 2      | 12         | Mario
...
```

### 3.3 拡張機能（Phase 2）
**マルチシート対応**:
- Sheet 1: Overview（トーナメント概要）
- Sheet 2: BM Results（バトルモード結果）
- Sheet 3: MR Results（マッチレース結果）
- Sheet 4: GP Results（グランプリ結果）
- Sheet 5: TA Results（タイムアタック結果）
- Sheet 6: Finals Bracket（決勝トーナメント表）

**スタイリング**:
- ヘッダー: 太字、背景色（青系）
- 1位: 金色ハイライト
- 2位: 銀色ハイライト
- 3位: 銅色ハイライト
- 罫線: 全セルに適用

**チャート（Phase 3）**:
- 優先度: 低（手動作成で代替可能）
- 実装する場合: `xlsx` ではなく `exceljs` への移行検討

### 3.4 決勝ブラケット出力
**Phase 1**: テキスト形式の対戦表
```
Finals Bracket (Double Elimination)

Winners Bracket:
Round 1: Player1 vs Player2 -> Player1 wins (3-1)
Round 1: Player3 vs Player4 -> Player3 wins (3-0)
...

Losers Bracket:
Round 1: Player2 vs Player5 -> Player2 wins (3-2)
...

Grand Finals: Player1 vs Player3 -> Player1 wins (3-2)
```

**Phase 2**: ASCII図形式
```
        Player1 ─┐
                 ├─ Player1 ─┐
        Player2 ─┘           │
                             ├─ Champion: Player1
        Player3 ─┐           │
                 ├─ Player3 ─┘
        Player4 ─┘
```

**Phase 3**: 画像生成（SVG/PNG）
- ライブラリ: `canvas` または `puppeteer`
- 優先度: 低（実装コスト高）

---

## 4. テスト戦略

### 4.1 テストカバレッジ目標
**本番デプロイ要件**:
- **最低70%カバレッジ** （業界標準）
- **クリティカルパス100%**: 認証、スコア入力、計算ロジック、トークン検証

**カバレッジ測定**:
```bash
npm run test:coverage
```

### 4.2 テストタイプ優先度

**Priority 1 (Week 1) - 本番ブロッカー**:
1. **ユニットテスト（High）**:
   - `lib/` 配下の全関数（計算ロジック、バリデーション）
   - 目標: 90%カバレッジ

2. **APIインテグレーションテスト（High）**:
   - 全33エンドポイント
   - 正常系・異常系・境界値
   - 目標: 80%カバレッジ

**Priority 2 (Week 2) - 推奨**:
3. **コンポーネントテスト（Medium）**:
   - 主要ページ（トーナメント作成、スコア入力）
   - ユーザーインタラクション（フォーム送信、ボタンクリック）
   - 目標: 60%カバレッジ

**Priority 3 (Post-MVP) - オプション**:
4. **E2Eテスト（Low - 延期可能）**:
   - Playwright または Cypress
   - 主要フロー（トーナメント作成→スコア入力→結果表示）
   - 目標: 主要3シナリオ

### 4.3 本番デプロイゲート
**必須条件**:
- ✅ ユニットテスト: 90%カバレッジ
- ✅ APIテスト: 80%カバレッジ
- ✅ CI/CDパイプライン: テスト自動実行
- ✅ 重大バグ0件

**オプション（延期可能）**:
- E2Eテスト（手動QAで代替）

### 4.4 テストデータ
**Seedデータ作成**:
```typescript
// prisma/seed.ts
async function main() {
  // テスト用プレイヤー作成
  const players = await Promise.all([
    prisma.player.create({ data: { name: 'Test Player 1' } }),
    prisma.player.create({ data: { name: 'Test Player 2' } }),
    // ...
  ]);
  
  // テスト用トーナメント作成
  const tournament = await prisma.tournament.create({
    data: {
      name: 'Test Tournament',
      mode: 'BATTLE_MODE',
      status: 'ACTIVE',
      // ...
    }
  });
}
```

**テスト分離**:
- 専用テストデータベース（Neon Branch機能）
- 環境変数: `DATABASE_URL_TEST`
- トランザクションロールバック（テスト後クリーンアップ）

---

## 5. CAPTCHA実装仕様

### 5.1 MVP判定
**決定: MVP延期、Post-MVP実装**
- 理由: 初回トーナメントはクローズド環境（リスク低）
- 実装タイミング: 不正入力が検出された場合に追加

### 5.2 トリガー条件（実装時）
**段階的導入**:
1. **Phase 1**: IP単位のレート制限超過時
   - 1IPあたり20回/分超過 → CAPTCHA要求
   
2. **Phase 2**: 異常パターン検出
   - 同一IPから短時間に異なるプレイヤーとして入力
   - 明らかに不正なスコア（5-0を連続入力など）

3. **Phase 3**: オプトイン設定
   - トーナメント作成時に「CAPTCHA必須」オプション

### 5.3 CAPTCHA プロバイダー
**推奨: Cloudflare Turnstile**
- 理由: 
  - 無料（Vercelで使用可能）
  - プライバシー重視（GDPR対応）
  - ユーザー体験良好（1クリック）
  
**代替案: hCaptcha**
- メリット: オープンソース寄り
- デメリット: アクセシビリティ懸念

**非推奨: Google reCAPTCHA**
- 理由: Googleアカウント依存、プライバシー懸念

### 5.4 適用範囲
**対象エンドポイント**:
- ✅ 参加者スコア入力（`POST /api/.../report`）
- ❌ トーナメント作成（既に認証済み）
- ❌ プレイヤー登録（レート制限で十分）

---

## 6. IP制限仕様

### 6.1 MVP判定
**決定: MVP延期、オプション機能**
- 実装タイミング: 顧客要望があれば追加

### 6.2 スコープレベル（実装時）
**Tournament-level（推奨）**:
- トーナメント作成時にIP制限を設定可能
- 用途: 会場限定アクセス
- 設定UI: トークン管理画面に追加

**実装例**:
```prisma
model Tournament {
  // ...
  allowedIPs String[] // ["192.168.1.0/24", "10.0.0.5"]
}
```

### 6.3 実装方針
**IP範囲対応**:
- CIDR表記サポート（例: `192.168.1.0/24`）
- 個別IP指定（例: `203.0.113.42`）

**動的IP対応**:
- 会場Wi-FiのIPレンジを事前登録
- 当日変更可能なUI提供

---

## 7. デプロイ戦略

### 7.1 Staging環境
**決定: Vercel Preview Deploymentsで代替**
- 専用Staging環境: 不要（コスト削減）
- 方法: Pull Request毎に自動プレビュー環境作成
- テストデータベース: Neon Branch機能

### 7.2 デプロイ方法
**Direct Rollout（推奨）**:
- `main` ブランチへのマージで自動本番デプロイ
- 理由: シンプル、小規模プロジェクト向き

**リスク軽減策**:
- デプロイ前の必須チェック:
  - ✅ CI/CDテスト全パス
  - ✅ TypeScriptコンパイルエラー0
  - ✅ Lighthouseスコア85以上

### 7.3 ロールバック計画
**Vercel Instant Rollback**:
- 前回のデプロイに1クリックで復元
- データベースロールバック: Prisma Migrate
  - マイグレーションファイル削除 + 再マイグレーション

**手順**:
```bash
# データベースロールバック
git revert <migration-commit>
npx prisma migrate deploy

# アプリケーションロールバック
# Vercel Dashboardで前回デプロイを選択 → "Promote to Production"
```

### 7.4 初回トーナメント
**目標日程: 未定（TBD）**
- 実装完了後、内部テストトーナメント実施
- UAT（User Acceptance Testing）: 運営メンバー3-5名
- 本番トーナメント: UAT完了後1週間以内

**MVP完成タイムライン**:
- Week 1-2: Testing Infrastructure + 残機能実装
- Week 3: QA + Bug Fixes
- Week 4: UAT + 調整
- **= 4週間後に本番Ready**

---

## 8. 追加質問への回答

### 8.1 タイムライン
**目標ローンチ日: TBD（未定）**
- ハードデッドライン: なし（品質優先）
- 目安: 4週間後にMVP完成

### 8.2 User Acceptance Testing
**実施内容**:
- ✅ 内部テストトーナメント（運営メンバー3-5名）
- ✅ 全4モードの動作確認
- ✅ 参加者スコア入力フローの検証
- 回数: 最低1回、理想的には2回

### 8.3 Feature Flags
**決定: 不要（シンプル優先）**
- 小規模プロジェクトのため、フル機能デプロイ
- 問題発生時はVercel Instant Rollbackで対応

### 8.4 Post-Launch Support
**サポートモデル: Community-Driven**
- GitHub Issues での報告受付
- バグ修正SLA: なし（ベストエフォート）
- 重大バグ: 24時間以内に対応目標
- 軽微なバグ: 1週間以内

---

## 9. 実装優先順位の承認

**Implementation Agentの提案を承認**:

### Phase 1 (Week 1-2) - MVP Blockers ✅
1. **Testing Infrastructure** 🔴 (CRITICAL) - 承認
2. **Real-time Ranking Display** 🟡 (HIGH) - 承認、仕様明確化完了
3. **Character Tracking** 🟢 (MEDIUM) - 承認、オプショナル実装

### Phase 2 (Week 3-4) - Polish & Launch ✅
4. **Enhanced Excel Export** 🟢 (MEDIUM) - Phase 2延期、MVP は基本版
5. **Error Boundaries & UX** 🟢 (MEDIUM) - 承認
6. **Documentation** 📝 (MEDIUM) - 承認

### Phase 3 (Post-MVP) - Advanced Features ✅
7. **CAPTCHA** 🔐 (OPTIONAL) - Post-MVP延期
8. **IP Restrictions** 🔐 (OPTIONAL) - Post-MVP延期
9. **Performance Optimization** ⚡ (ONGOING) - 継続的実施

---

## 10. 次のステップ（Implementation Agentへの指示）

### 10.1 即座に開始
1. **Testing Infrastructure セットアップ**
   ```bash
   cd jsmkc-app
   npm install --save-dev jest @testing-library/react @testing-library/jest-dom @types/jest ts-jest
   ```

2. **Character Tracking 実装**
   - `lib/constants.ts` にCHARACTERS定数追加
   - Prisma Schema更新
   - マイグレーション実行

3. **Leaderboard ページ作成**
   - `app/tournaments/[id]/leaderboard/page.tsx`
   - `hooks/useLeaderboard.ts`

### 10.2 実装ガイドライン
- テスト駆動開発（TDD）推奨
- 各機能実装後に必ずテスト追加
- PRレビュー前にLighthouseスコア確認

### 10.3 質問・不明点
- 実装中の疑問点はGitHub Issueで報告
- アーキテクチャ変更が必要な場合は再度相談

---

**本セクション追記日**: 2026-01-19  
**対応者**: Architecture Agent  
**ステータス**: ✅ 全質問回答完了、実装可能

---

## 改訂履歴

| バージョン | 日付 | 内容 |
|------------|------|------|
| 14.0 | 2026-01-19 | Implementation Agent質問20項目に回答：キャラクター記録、リアルタイム順位、Excel拡張、テスト戦略、CAPTCHA、IP制限、デプロイ戦略の詳細仕様を追加 |
| 13.0 | 2026-01-19 | Issue #2, #4, #5対応：Redis除外しメモリベースレート制限採用、NextAuth.js SECRET設定追加、認証フロー修正、README追加 |
| 12.0 | 2026-01-19 | レビュー指摘事項8項目を完全修正：JWT Refresh Token機構、Soft DeleteとAuditLog、XSS対策とCSP詳細化、ポーリング負荷最適化、競合処理（楽観的ロック）、トークン延長機能、レート制限柔軟化 |
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

# SMKC Score System

SMK Championship の大会運営における点数計算・順位管理システム

## System Overview

### What is *SMKC?

**SMKC (SMK Championship)** は、SFC版SMKの競技大会フォーマットです。

先頭の文字は各地域/組織のプレフィックスとして使用できます：
- **JSMKC** - Japan SMK Championship
- **ESMKC** - Europe SMK Championship
- **NASMKC** - North America SMK Championship
- etc.

本システムは世界中のSMKC大会で使用可能な汎用的なスコア管理システムです。

- **参加者**: 最大48人
- **使用機材**: 任天堂純正スーパーファミコン実機（NTSC規格）
- **対戦形式**: 2プレイヤーモード（1P/2P）

### Competition Modes

本システムは以下の4つの競技モードに対応しています：

| Mode | Format | Description |
|------|--------|-------------|
| **Time Trial** | Individual | 全20コースの合計タイムで順位決定 |
| **Battle Mode** | 1vs1 | バトルコース1〜4で風船を割り合う |
| **Match Race** | 1vs1 | ランダム4コースでレース対決 |
| **Grand Prix** | 1vs1 | カップ戦でドライバーズポイント勝負 |

---

## Game Mode Details

### Time Trial (タイムアタック)

#### Qualification Round
- 全20コースを走行
- 合計タイムで順位決定

#### Losers Round (敗者復活)
- 予選17位〜24位が参加
- サドンデス方式（最下位が脱落）
- 4人になるまで繰り返し

#### Finals (決勝)
- **ライフ制**: 初期ライフ3
- タイム下位半分がライフ-1
- ライフ0で脱落
- TOP16→TOP8→TOP4→TOP2でライフリセット

---

### Battle Mode (バトル)

#### Qualification Round
- 2〜3グループに分かれてグループ内総当たり
- 各対戦は4ラウンド（バトルコース1〜4）

#### Scoring System
| Result | Points |
|--------|--------|
| Win (3+ rounds) | 2 pts |
| Tie (2-2) | 1 pt |
| Loss (1- rounds) | 0 pts |

#### Finals (Double Elimination)
- ダブルエリミネーション方式（2敗で敗退）
- ウィナーズブラケット / ルーザーズブラケット
- 5勝先取 or 7勝先取

#### Grand Final
- 無敗側: 1回負けても再戦可能
- 1敗側: 1回負けで敗退

---

### Match Race (vsマッチレース)

#### Qualification Round
- グループ内総当たり
- ランダム4コース（全20コース対象）

#### Scoring System
バトルモードと同じ（勝ち越し2点、引き分け1点、負け越し0点）

#### Finals
- ダブルエリミネーション方式
- 5勝先取 or 7勝先取

---

### Grand Prix (vsグランプリ)

#### Qualification Round
- グループ内総当たり
- 4カップから運営が選択

#### Driver Points
| Position | Points |
|----------|--------|
| 1st | 9 pts |
| 2nd | 6 pts |
| 3rd | 3 pts |
| 4th | 1 pt |
| 5th+ | 0 pts |

#### Finals
- ダブルエリミネーション方式
- 2勝先取 or 3勝先取

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 15.x (App Router) | React framework |
| | TypeScript | Type-safe development |
| | Tailwind CSS | Styling |
| | shadcn/ui | UI component library |
| | Radix UI | Accessibility foundation |
| | NextAuth.js | Authentication |
| Backend | Next.js API Routes | REST API |
| | Prisma ORM | Database access |
| Database | PostgreSQL (Neon) | Data store |
| Deployment | Vercel | Hosting |
| Form Management | React Hook Form | Form handling |
| Validation | Zod | Schema validation |
| Excel Export | xlsx (SheetJS) | Data export |

---

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- PostgreSQL database (Neon account recommended)
- Discord application credentials for administrator login

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment Variables Setup

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Then configure the following variables in `.env.local`:

```bash
# Database
DATABASE_URL="postgresql://user:password@ep-xxx.region.neon.tech/neondb?sslmode=require"

# Discord OAuth (Admin only)
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here

# Admin Discord user IDs
ADMIN_DISCORD_IDS=your_discord_user_id_here,another_discord_user_id_here

# NextAuth.js v5
AUTH_URL=http://localhost:3000
# Generate with: openssl rand -base64 32
AUTH_SECRET=your_nextauth_secret_here
```

#### Generating AUTH_SECRET

Generate a secure secret for NextAuth.js:

```bash
openssl rand -base64 32
```

Copy the output and paste it into your `.env.local` file as `AUTH_SECRET`.

Any Discord account whose user ID appears in `ADMIN_DISCORD_IDS` will receive
the `admin` role after logging in with Discord.

### 3. Setup Database

Create a [Neon](https://neon.tech/) account and project, then update `DATABASE_URL` in `.env.local`.

### 4. Run Database Migrations

```bash
npx prisma migrate dev
```

This will create all necessary database tables.

### 5. (Optional) Seed Database

If you want to populate the database with test data:

```bash
npx prisma db seed
```

### 6. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open Prisma Studio (Database GUI) |
| `npx prisma migrate dev --name <name>` | Create a new migration |
| `npx prisma generate` | Generate Prisma Client |

---

## Database Management

### Creating Migrations

When you modify `prisma/schema.prisma`, create a migration:

```bash
npx prisma migrate dev --name add_new_feature
```

### Prisma Studio

Prisma Studio provides a GUI for viewing and editing database data:

```bash
npx prisma studio
```

This will open a browser at `http://localhost:5555`.

---

## Deployment

### Cloudflare Workers Builds

Use Cloudflare's native Git integration, not GitHub Actions.
Cloudflare's official Workers Builds flow supports connecting an existing Worker to a GitHub repository and deploying automatically on pushes to the production branch.

### Connect the existing Worker

In Cloudflare dashboard:

1. Go to Workers & Pages
2. Open the existing Worker `smkc`
3. Open `Settings` → `Builds`
4. Select `Connect`
5. Choose this GitHub repository
6. Set the production branch to `main`

Cloudflare's docs note that when connecting an existing Worker, the Worker name in the dashboard must match the `name` in `wrangler.toml`. This repository already uses `name = "smkc"`.

### Build settings for this repository

This is a monorepo, so set these values in Cloudflare:

- Root directory: `smkc-score-app`
- Build command: `npm run build:cf`
- Deploy command: `npm run deploy:cf`
- Build watch path: `smkc-score-app/**` (recommended)

Cloudflare's docs state that Workers Builds runs the build command first and then the deploy command, and that the root directory should point at the app directory in monorepos.
`npm run deploy:cf` applies pending D1 migrations with `wrangler d1 migrations apply DB --remote` before `wrangler deploy`, so new Worker code is not promoted against an old production schema.

### Runtime variables and secrets

Set runtime values in `Settings` → `Variables & Secrets` for the `smkc` Worker:

- Secret: `DATABASE_URL`
- Secret: `AUTH_SECRET`
- Secret: `DISCORD_CLIENT_ID`
- Secret: `DISCORD_CLIENT_SECRET`
- Secret: `ADMIN_DISCORD_IDS`

`AUTH_URL` is already managed in `wrangler.toml` as `https://smkc.bluemoon.works`.

Cloudflare documents build variables separately from runtime variables. For this app, the values above should be added as runtime secrets under `Variables & Secrets`.

---

## Features

### Implemented
- [x] **Players**: プレイヤー登録・編集・削除
- [x] **Tournaments**: トーナメント作成・管理
- [x] **Battle Mode Qualification**: グループ分け、総当たり対戦表、スコア入力、勝ち点自動計算
- [x] **OBS Browser-Source Overlay**: スコア入力・状態遷移を配信画面にトースト通知（[後述](#obs-browser-source-overlay)）

### Coming Soon
- [ ] Battle Mode Finals (Double Elimination)
- [ ] Match Race
- [ ] Grand Prix
- [ ] Time Trial
- [ ] Real-time standings display
- [ ] Result export (Excel/PDF)
- [ ] **Participant Score Entry** (後述)

---

## OBS Browser-Source Overlay

トーナメントのスコア入力や状態遷移をリアルタイムに検知して、配信画面（OBS）の右下にトースト通知としてポップアップさせるオーバーレイ機能。

### URL

```
https://smkc.bluemoon.works/tournaments/<トーナメントID または slug>/overlay
```

- **認証不要** — URL を知っていれば誰でも見られます（スコア情報は元々公開ページで参照可能なので、新たに漏れる情報はありません）
- **背景透過** — 別途 OBS 側で CSS を書く必要なし

### OBS の設定

OBS Studio の「ソースを追加」→「ブラウザ」で以下を入力：

| 項目 | 値 |
|---|---|
| URL | 上記の overlay URL |
| 幅 | `1920` |
| 高さ | `1080` |
| シーンがアクティブになっていない時にソースをシャットダウン | **OFF** |
| シーンがアクティブになった時にブラウザをリフレッシュ | **OFF** |

> **OFF にする理由**: ON だとシーン切替のたびにポーリング状態がリセットされ、その瞬間直近 30 秒のイベントが一気に再生されてしまいます

カスタム CSS は **不要**（ページ側で `body.overlay-mode` を立てて、root layout の chrome と背景色を `globals.css` で全て無効化しています）。

### 通知されるイベント

| イベント種別 | 発火タイミング |
|---|---|
| `match_completed` | BM/MR/GP の試合スコアが確定したとき |
| `score_reported` | 参加者が `/report` 経由でスコアを自己申告したとき |
| `ta_time_recorded` | TA エントリのタイムが入力・更新されたとき |
| `qualification_confirmed` | 予選確定フラグを ON にしたとき |
| `finals_started` | BM 決勝ブラケットが生成されたとき |
| `ta_phase_advanced` | TA フェーズで新ラウンドが開始されたとき |
| `overall_ranking_updated` | 総合ランキングが再集計されたとき |

### 表示仕様

- **位置**: 画面右下（24px 内側にスタック）
- **モード別アクセントカラー**: BM=赤 / MR=青 / GP=緑 / TA=黄、neutral イベント（予選確定など）は白
- **最大同時表示**: 5 件、新着が上、古いものから消える
- **表示時間**: 各トースト 6 秒で自動 fade-out
- **ポーリング間隔**: 3 秒
- **初回表示**: 直近 30 秒以内のイベントを表示（OBS を試合中盤で起動すると過去のイベントが流れる）

### トラブルシューティング

| 症状 | 対処 |
|---|---|
| 何も表示されない | URL のトーナメント ID/slug が正しいか確認。OBS のブラウザソース上で右クリック→「OBS の対話を有効にする」→「対話する」で開発者ツールを開き、`/api/tournaments/.../overlay-events` のレスポンスを確認 |
| 配信開始直後に過去のイベントが大量に流れる | "シーンがアクティブになった時にブラウザをリフレッシュ" を OFF。仕様上、初回ポーリングで直近 30 秒分が出るため、進行が止まっている時間帯に OBS を起動すると最小化できる |
| 透過にならない（白/黒の背景が見える） | キャッシュをリフレッシュ（OBS 上で右クリック→「リフレッシュ」）。それでも残る場合は OBS のブラウザソースのバージョンが古い可能性があるため OBS 自体を最新化 |

### 関連ドキュメント

- 設計プラン: [`/Users/azumag/.claude/plans/greedy-puzzling-beacon.md`](../plans) — 実装前の検討内容
- E2E テスト: `e2e/tc-overlay.js`（TC-901..914、全 7 種のイベント種別をカバー）
- 単体テスト: `__tests__/lib/overlay/events.test.ts`（aggregator の純粋関数）
- API ルート: `src/app/api/tournaments/[id]/overlay-events/route.ts`
- ページ実装: `src/app/tournaments/[id]/overlay/page.tsx`

---

## Planned: Participant Score Entry

### Overview

参加者が自分のスマートフォンやPCから、自分や対戦相手のスコアを入力できる機能。

### Use Cases

1. **対戦終了後の自己申告**
   - 対戦した両プレイヤーがそれぞれスコアを入力
   - 両者の入力が一致すれば自動確定
   - 不一致の場合は運営が確認

2. **リアルタイム更新**
   - 入力されたスコアは即座に順位表に反映
   - 他の参加者も進行状況をリアルタイムで確認可能

3. **運営負荷の軽減**
   - 運営が全スコアを入力する必要がなくなる
   - 運営は確認・修正のみに集中

### Technical Requirements

- **認証なしアクセス**: トーナメントURLを知っていれば入力可能（シンプルさ優先）
- **モバイルフレンドリー**: スマートフォンでの操作に最適化
- **コンフリクト解決**: 同時編集時の競合処理
- **入力履歴**: 誰がいつ入力/変更したかのログ

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Home
│   ├── players/              # Player management
│   ├── tournaments/          # Tournament management
│   │   └── [id]/
│   │       └── bm/           # Battle Mode
│   └── api/                  # API routes
│       ├── players/
│       └── tournaments/
├── components/ui/            # shadcn/ui components
└── lib/
    └── prisma.ts             # Prisma client

prisma/
├── schema.prisma             # Database schema
└── migrations/               # Migration files
```

---

## Glossary

| Term | Description |
|------|-------------|
| JSMKC | Japan SMK Championship |
| Double Elimination | 2回負けると敗退するトーナメント形式 |
| Winners Bracket | まだ負けていないプレイヤーのトーナメント枠 |
| Losers Bracket | 1回負けたプレイヤーのトーナメント枠 |
| Sudden Death | 最下位が即脱落する方式 |
| Driver Points | グランプリモードでの順位に応じた得点 |

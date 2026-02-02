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
- GitHub account (for OAuth)
- Discord account (optional, for OAuth)
- Google account (optional, for OAuth)

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

# Discord OAuth (Optional)
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here

# GitHub OAuth (Required for admin authentication)
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# Google OAuth (Optional, for JWT Refresh Token)
AUTH_GOOGLE_ID=your_google_client_id_here
AUTH_GOOGLE_SECRET=your_google_client_secret_here

# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
# Generate with: openssl rand -base64 32
AUTH_SECRET=your_nextauth_secret_here
```

#### Generating AUTH_SECRET

Generate a secure secret for NextAuth.js:

```bash
openssl rand -base64 32
```

Copy the output and paste it into your `.env.local` file as `AUTH_SECRET`.

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

### Vercel Deployment

1. **Create a Vercel Project**
   - Import your GitHub repository to Vercel
   - Vercel will automatically detect Next.js

2. **Configure Environment Variables**
   - Go to Settings → Environment Variables
   - Add all variables from `.env.example`
   - Generate a new `AUTH_SECRET` for production:
     ```bash
     openssl rand -base64 32
     ```

3. **Set Production Database**
   - Create a production database on Neon
   - Set `DATABASE_URL` in Vercel environment variables

4. **Deploy**
   - Push to main branch for automatic deployment
   - Or click "Deploy" in Vercel dashboard

### Environment Variables in Vercel

Add these to Vercel → Settings → Environment Variables:

- `DATABASE_URL`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `NEXTAUTH_URL` (set to your production URL, e.g., `https://your-app.vercel.app`)
- `AUTH_SECRET` (generate a new one for production)

---

## Features

### Implemented
- [x] **Players**: プレイヤー登録・編集・削除
- [x] **Tournaments**: トーナメント作成・管理
- [x] **Battle Mode Qualification**: グループ分け、総当たり対戦表、スコア入力、勝ち点自動計算

### Coming Soon
- [ ] Battle Mode Finals (Double Elimination)
- [ ] Match Race
- [ ] Grand Prix
- [ ] Time Trial
- [ ] Real-time standings display
- [ ] Result export (Excel/PDF)
- [ ] **Participant Score Entry** (後述)

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

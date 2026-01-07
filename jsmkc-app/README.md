# JSMKC Score System

Japan Super Mario Kart Championship (JSMKC) の大会運営における点数計算・順位管理システム

## System Overview

### What is JSMKC?

**Japan Super Mario Kart Championship (JSMKC)** は、スーパーファミコン版「スーパーマリオカート」の競技大会です。

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

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Prisma ORM
- **Database**: Neon (Serverless PostgreSQL)
- **Deployment**: Vercel

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Setup Database

Create a [Neon](https://neon.tech/) account and project, then create `.env.local`:

```bash
DATABASE_URL="postgresql://user:password@ep-xxx.region.neon.tech/neondb?sslmode=require"
```

### 3. Run migrations

```bash
npx prisma migrate dev
```

### 4. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Configuration

### Development vs Production Database

開発用と本番用で異なるデータベースを使用できます：

| Environment | File | Description |
|-------------|------|-------------|
| Development | `.env.local` | ローカル開発用（gitignore対象） |
| Production | Vercel環境変数 | 本番用DB |

**本番用DBを別アカウントで設定する場合は、Vercelの環境変数に `DATABASE_URL` を設定するだけでOKです。**

### Vercel Deployment

1. Vercel にプロジェクトをインポート
2. Settings → Environment Variables で `DATABASE_URL` を設定
3. Deploy

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
| JSMKC | Japan Super Mario Kart Championship |
| Double Elimination | 2回負けると敗退するトーナメント形式 |
| Winners Bracket | まだ負けていないプレイヤーのトーナメント枠 |
| Losers Bracket | 1回負けたプレイヤーのトーナメント枠 |
| Sudden Death | 最下位が即脱落する方式 |
| Driver Points | グランプリモードでの順位に応じた得点 |

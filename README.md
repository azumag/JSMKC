# SMKC 点数計算システム

SMK Championship (SMKC) の大会運営における点数計算・順位管理を行うシステム

## 概要

JSMKC2026 およびそれ以降の大会での使用を想定

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

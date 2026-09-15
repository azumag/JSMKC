# TA debug UI contract

Time Attack の debug 補助 UI は、通常大会での誤操作を避けるため tournament-level `debugMode` を表示条件の正本とする。

## 表示条件

- 管理者向けのランダム入力・debug-fill UI は `debugMode=true` の大会でのみ表示する。
- 管理者であっても `debugMode=false` の通常大会では表示しない。
- player には `debugMode` に関係なく管理者向け debug UI を表示しない。
- `NODE_ENV` による独自判定は追加せず、既存の `useTournamentDebugMode(tournamentId)` を利用する。

## TA participant page

`/tournaments/[id]/ta/participant` の `Fill Random Times` も同じ契約に従う。表示条件は `isAdmin && debugMode && myEntry` とし、ランダム時刻生成には共有 `generateRandomTimeString()` を直接利用する。

このボタンは入力欄を埋めるだけで自動送信はしないが、通常大会での誤操作を防ぐため debugMode 境界を必須とする。

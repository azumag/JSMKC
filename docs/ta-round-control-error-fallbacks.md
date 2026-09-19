# TA round-control error fallback contract

TA finals の round control では、ユーザー向けエラーと診断用エラー詳細を分離する。

## Phase 1 / Phase 2

`smkc-score-app/src/components/tournament/ta-elimination-phase.tsx` の `start_round`、`cancel_round`、`undo_round`、`cancel_last_round` は #3864 以降 fail-closed とする。

- HTTP non-2xx の response body は UI 用に解析せず `common.networkError` を表示する。
- `fetch()` rejection も `common.networkError` を表示し、raw exception detail は client logger のみに残す。
- HTTP failure の logger には status、tournamentId、phase、必要な roundNumber など安全な context を残す。
- request payload、成功時の state reset / refetch、confirmation dialog、loading state cleanup は変更しない。

## Phase 3

`smkc-score-app/src/app/tournaments/[id]/ta/finals/page.tsx` の `start_round`、`cancel_round`、`undo_round`、`cancel_last_round` も同じく fail-closed とする。

- HTTP non-2xx は response body の `error` / text を解析せず `common.networkError` を表示する。
- `fetch()` rejection も `common.networkError` を表示し、raw exception detail は client logger のみに残す。
- HTTP failure の logger には status、tournamentId、phase、必要な roundNumber など安全な context を残す。
- request payload、成功時の state reset / refetch、confirmation dialog、loading state cleanup は変更しない。

## Phase 3 manual elimination

manual elimination の HTTP failure も response body を解析せず `common.networkError` を表示する。status、tournamentId、entryId は client logger に残す。成功時の dialog cleanup と refetch は維持する。

## Phase 3 life adjustment

残機変更の HTTP failure は response body を解析せず、既存の翻訳済み `taFinals.livesUpdateFailed` を表示する。`fetch()` rejection は `common.networkError` を表示する。status、tournamentId、entryId は client logger に残し、stale-write protection (`expectedVersion` / `expectedLives`) と成功時 cleanup は維持する。

# TA round-control error fallback contract

TA finals の round control では、ユーザー向けエラーと診断用エラー詳細を分離する。

## Phase 1 / Phase 2

`smkc-score-app/src/components/tournament/ta-elimination-phase.tsx` の `start_round`、`cancel_round`、`undo_round`、`cancel_last_round` は次の契約に従う。

1. API が具体的な `error` を返した場合は、そのメッセージをユーザーへ表示する。
2. API が具体的なエラーを返さない non-2xx response は `common.networkError` を表示する。
3. `fetch()` rejection など request 自体が失敗した場合も `common.networkError` を表示し、ブラウザ由来の raw `Error.message` は UI に出さない。
4. request rejection の詳細は client logger に残す。
5. request payload、成功時の state reset / refetch、confirmation dialog、loading state cleanup は変更しない。

## Phase 3

`smkc-score-app/src/app/tournaments/[id]/ta/finals/page.tsx` の `start_round`、`cancel_round`、`undo_round`、`cancel_last_round` も Phase 1 / 2 と同じ契約に従う。

- API の具体的な `error` はユーザーへそのまま表示する。
- generic non-2xx と `fetch()` rejection は `common.networkError` を表示する。
- request rejection の raw detail は client logger のみに残す。
- confirmation dialog と loading state は、成功・失敗のどちらでも従来どおり操作可能な状態へ戻す。

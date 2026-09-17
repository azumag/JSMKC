# Debug-fill client error contract

Qualification の debug-mode 自動入力ボタン (`DebugFillButton`) は、管理者向けの補助 UI だが、request failure の内部詳細を利用者向け表示へそのまま露出させない。

## Error precedence

- HTTP response が non-2xx で API が `error` を返した場合は、その API-specific error を従来どおり表示する。
- API error payload がない non-2xx は HTTP status を fallback として表示する。
- `fetch()` 自体が reject した場合は `common.networkError` を表示し、`Error.message` や proxy / browser / network stack 由来の文字列は UI に表示しない。
- request rejection の元 exception、`tournamentId`、mode は `qualification-debug-fill` client logger に保持する。

## State contract

- request 中は duplicate click を防止する。
- success 時のみ filled / skipped 件数を表示して `onFilled` を呼ぶ。
- failure 時も `finally` で busy state を解除し、再試行できる状態へ戻す。

この契約は BM / MR / GP / TA の debug-fill 共通である。

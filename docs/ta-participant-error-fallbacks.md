# TA participant error fallback contract

`/tournaments/[id]/ta/participant` の user-facing error handling は fail-closed とし、backend の raw `error` / `message` prose をそのまま表示しない。qualification time submit、partner time submit、participant registration の HTTP non-2xx と client-side fetch / network rejection は next-intl の `common.networkError` を表示する。

Phase 3 report だけは API の stable machine-readable `code` を既知の localized message に mapping する。現在の既知 code は `NO_OPEN_ROUND`、`ROUND_ALREADY_SUBMITTED`、`ROUND_MISMATCH`、`PLAYER_REPORT_DISABLED`、`PLAYER_ELIMINATED` で、未知 code は `common.networkError` に fail closed する。response body の raw `error` prose は user-facing copy に使わない。

この共有 fallback と code mapping は locale catalog で管理し、participant page に locale 固有の network error 文字列を直接追加しない。

## 診断情報と UI の境界

- user-facing: localized validation / known Phase 3 code message / `common.networkError`
- HTTP failure logger: status、operation、entry/player/round などの安全な context と、Phase 3 の stable `code`
- transport failure logger: raw exception は診断用に保持するが UI には出さない
- qualification submit / registration の HTTP failure body は user-facing message のために parse しない

通常の入力検証、成功通知、API status code / error schema、認証、TA の時刻検証、DB、スコア計算、debugMode の挙動は変更しない。

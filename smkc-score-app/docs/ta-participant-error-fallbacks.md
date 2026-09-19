# TA participant mutation error fallbacks

TA participant page の mutation は、ユーザー向けエラーと診断用エラーを分離する。

対象:

- qualification の自分のタイム保存
- partner の qualification タイム保存
- Phase 3 の `report_time`
- TA 参加登録

## 契約

1. HTTP non-2xx のユーザー表示は原則 `common.networkError` に縮退し、backend の raw `error` prose は UI に表示しない。
2. qualification の自分/partner のタイム保存と TA 参加登録では、失敗 response body をエラー表示のために解析しない。成功 response の JSON parse と既存 state 更新は維持する。
3. Phase 3 report は `NO_OPEN_ROUND` / `ROUND_ALREADY_SUBMITTED` / `ROUND_MISMATCH` / `PLAYER_REPORT_DISABLED` / `PLAYER_ELIMINATED` の machine-readable `code` に対する既存の翻訳マッピングだけを維持する。未知 code の raw `error` prose は表示せず `common.networkError` にする。
4. `fetch()` rejection や成功 response body の JSON parse failure など client-side 例外も `common.networkError` を表示し、raw `Error.message` は UI に出さない。
5. 診断用 client logger には HTTP status、`tournamentId`、operation、対象 `entryId` / `playerId`、Phase 3 の `roundNumber` / `code` など安全な context を残す。transport / parse exception の raw detail は logger のみに残す。
6. validation、request payload、成功時 state 更新 / alert、入力保持、`submitting` / `reporting` cleanup は変更しない。

この契約は `__tests__/static/ta-participant-mutation-error-fallbacks.test.ts` と participant page の behavioral tests で回帰保護する。

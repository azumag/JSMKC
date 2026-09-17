# TA participant mutation error fallbacks

TA participant page の mutation は、ユーザー向けエラーと診断用エラーを分離する。

対象:

- qualification の自分のタイム保存
- partner の qualification タイム保存
- Phase 3 の `report_time`
- TA 参加登録

## 契約

1. API が具体的な `error` を返した場合は、そのメッセージを従来どおり優先する。
2. Phase 3 report の `NO_OPEN_ROUND` / `ROUND_ALREADY_SUBMITTED` / `ROUND_MISMATCH` / `PLAYER_REPORT_DISABLED` / `PLAYER_ELIMINATED` は既存の翻訳マッピングを維持する。
3. API に具体的なエラーがない generic non-2xx は `common.networkError` を表示する。
4. `fetch()` rejection や response body parse failure など request 完了前後の通信失敗も `common.networkError` を表示し、ブラウザ由来の raw `Error.message` は UI に出さない。
5. request rejection の raw detail は client logger に残す。
6. validation、request payload、成功時 state 更新 / alert、入力保持、`submitting` / `reporting` cleanup は変更しない。

この契約は `__tests__/static/ta-participant-mutation-error-fallbacks.test.ts` と participant page の behavioral tests で回帰保護する。

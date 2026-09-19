# TA result submit error feedback contract

TA round result submit では、ユーザー向けエラーと診断情報を分離する。Phase 1 / Phase 2 elimination と Phase 3 finals は #3864 以降 fail-closed とし、HTTP failure の backend prose を UI に露出しない。

## Phase 1 / Phase 2 / Phase 3 共通

- `submit_results` の non-2xx は response body の `error` / text を UI 用に解析せず `common.networkError` を表示する。
- `fetch()` rejection や success body の JSON parse failure も `common.networkError` を表示する。
- HTTP status、tournamentId、phase、roundNumber は client logger に残す。transport exception の detail も診断用 logger にのみ残す。
- generic fallback として英語ハードコードや raw `Error.message` をユーザーへ露出しない。

## 非変更事項

submit endpoint / payload、preview、tie-break、validation、成功時の state reset と refetch、`submitting` cleanup は変更しない。

# TA result submit error feedback contract

TA round result submit では、ユーザー向けエラーと診断情報を分離する。Phase 3 finals は #3864 以降 fail-closed とし、HTTP failure の backend prose を UI に露出しない。

## Phase 3

- `submit_results` の non-2xx は response body の `error` / text を UI 用に解析せず `common.networkError` を表示する。
- `fetch()` rejection や success body の JSON parse failureも `common.networkError` を表示する。
- HTTP status、tournamentId、phase、roundNumber は client logger に残す。transport exception の detail も診断用 logger にのみ残す。
- generic fallback として英語ハードコードや raw `Error.message` をユーザーへ露出しない。

## Phase 1 / Phase 2

`ta-elimination-phase.tsx` は #3864 の残りの実装単位で Phase 3 と同じ fail-closed 契約へ移行する。それまでは既存の concrete API error fallback が残る。

## 非変更事項

submit endpoint / payload、preview、tie-break、validation、成功時の state reset と refetch、`submitting` cleanup は変更しない。

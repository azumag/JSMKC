# TA finals fetch error fallback contract

TA finals の取得エラーでは、ユーザー向けメッセージと診断情報を分離する。Phase 1 / Phase 2 (`ta-elimination-phase.tsx`) と Phase 3 (`ta/finals/page.tsx`) は #3864 以降、HTTP non-2xx の response body を UI 用に解析せず fail-closed とし、next-intl の共有キー `common.networkError` のみを表示する。

## Phase 1 / Phase 2 / Phase 3 共通

1. non-2xx response は body の `error` / text を読まず `common.networkError` を表示する。
2. `fetch()` rejection や成功 response body の JSON parse failure など client-side 例外も `common.networkError` を表示する。
3. HTTP status、tournamentId、phase は client logger に残し、backend prose や browser/runtime の raw `Error.message` は UI に表示しない。
4. 成功 response の JSON parse、polling、open-round recovery、entries / rounds / course state 更新は変更しない。

この契約は fetch fallback の表示だけを対象とし、API status/error schema、TA のラウンド進行・スコア計算・DB、Cloudflare 設定、production migration の挙動は変更しない。

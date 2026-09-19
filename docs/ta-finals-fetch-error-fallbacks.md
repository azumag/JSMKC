# TA finals fetch error fallback contract

TA finals の取得エラーでは、ユーザー向けメッセージと診断情報を分離する。Phase 3 (`ta/finals/page.tsx`) は #3864 以降、HTTP non-2xx の response body を UI 用に解析せず fail-closed とし、next-intl の共有キー `common.networkError` のみを表示する。

## Phase 3

1. non-2xx response は body の `error` / text を読まず `common.networkError` を表示する。
2. `fetch()` rejection や成功 response body の JSON parse failureなど client-side 例外も `common.networkError` を表示する。
3. HTTP status、tournamentId、phase は client logger に残し、backend prose や browser/runtime の raw `Error.message` は UI に表示しない。
4. 成功 response の JSON parse、polling、open-round recovery、entries / rounds / course state 更新は変更しない。

## Phase 1 / Phase 2

`ta-elimination-phase.tsx` は #3864 の残りの実装単位で同じ fail-closed 契約へ移行する。それまでは既存の concrete API error fallback が残るため、Phase 3 の契約を Phase 1 / 2 に誤って適用したとみなさない。

この契約は fetch fallback の表示だけを対象とし、API status/error schema、TA のラウンド進行・スコア計算・DB、Cloudflare 設定、production migration の挙動は変更しない。

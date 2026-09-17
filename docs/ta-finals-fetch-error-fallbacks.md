# TA finals fetch error fallback contract

TA finals の Phase 1/2 (`ta-elimination-phase.tsx`) と Phase 3 (`ta/finals/page.tsx`) の初期取得・polling でユーザー向けエラーを表示する場合、API が返す具体的な `error` を最優先する。API に具体的なエラーがない場合は、next-intl の共有キー `common.networkError` を fallback として使用する。

## 優先順位

1. non-2xx の API response に具体的な `error` がある場合は、その内容を表示する。
2. non-2xx の API response に具体的な `error` がない場合は `common.networkError` を表示する。
3. `fetch()` / network rejection や、成功 response body の JSON parse failure など client-side 例外の場合も `common.networkError` を表示する。browser/runtime 由来の raw `Error.message` はユーザー UI に表示しない。

low-level の例外内容は `Failed to fetch data:` の client logger に残す。non-2xx では HTTP status と、存在する場合は API error も logger に残すため、ユーザー向け表示を一般化しても診断情報は失わない。

成功時の polling、open-round recovery、entries / rounds / course state 更新は変更しない。

この契約は fetch fallback の表示だけを対象とし、API status/error schema、TA のラウンド進行・スコア計算・DB、Cloudflare 設定、production migration の挙動は変更しない。

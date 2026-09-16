# TA finals fetch error fallback contract

TA finals の Phase 1/2 (`ta-elimination-phase.tsx`) と Phase 3 (`ta/finals/page.tsx`) の初期取得・polling でユーザー向けエラーを表示する場合、API が返す具体的な `error` を最優先する。API に具体的なエラーがない場合は、next-intl の共有キー `common.networkError` を fallback として使用する。

## 優先順位

1. API response に具体的な `error` がある場合は、その内容を表示する。
2. API response に具体的な `error` がない場合は `common.networkError` を表示する。
3. client-side 例外が `Error` として具体的な message を持つ場合はその message を表示し、message を取得できない場合は `common.networkError` を使用する。

logger に送る `Failed to fetch data:` などの診断用文字列は user-facing text ではないため、この i18n 契約の対象外とする。

この契約は fetch fallback の表示だけを対象とし、API status/error schema、TA のラウンド進行・スコア計算・DB、Cloudflare 設定、production migration の挙動は変更しない。

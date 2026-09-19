# Qualification confirmation error fallback contract

BM / MR / GP の qualification confirmed 切り替えは fail-closed とし、HTTP non-2xx の response body に含まれる raw `error` / `message` を user-facing feedback に使用しない。HTTP failure と fetch / network rejection は next-intl の共有キー `common.networkError` を表示する。

## 表示契約

1. HTTP non-2xx では response body の raw error prose を表示せず `common.networkError` を使用する。
2. fetch / network rejection でも logger へ診断情報を記録したうえで `common.networkError` を表示する。
3. HTTP failure の logger には status、tournamentId など安全な context を残し、transport exception の raw detail は logger のみに保持する。

## 既存 UI surface

この契約では通知 UI 自体は変更しない。

- BM: `alert`
- MR: `toast.error`
- GP: `alert`

success 時の `refetch()`、確認ダイアログ、mode ごとの `*QualificationConfirmed` field、API contract は従来どおり維持する。

## 回帰防止

`__tests__/static/qualification-confirm-error-fallbacks.test.ts` で以下を固定する。

- `Failed to update qualification status` の user-visible hardcode を再導入しない。
- API の raw `error` を notifier に渡さない。
- HTTP failure と fetch rejection の両方で mode ごとの既存 notifier から `common.networkError` を表示する。
- HTTP status を client logger に残す。
- `messages/en.json` と `messages/ja.json` の両方に `common.networkError` が存在する。

# Qualification confirmation error fallback contract

BM / MR / GP の qualification confirmed 切り替えは、API が返す具体的なエラーを優先し、それがない場合は next-intl の共有キー `common.networkError` を使用する。

## 表示優先順位

1. API response body に具体的な `error` がある場合は、その内容を表示する。
2. non-2xx response に具体的な `error` がない場合は `common.networkError` を表示する。
3. fetch / network rejection が発生した場合も logger へ記録したうえで `common.networkError` を表示する。

## 既存 UI surface

この変更では通知 UI 自体は変更しない。

- BM: `alert`
- MR: `toast.error`
- GP: `alert`

success 時の `refetch()`、確認ダイアログ、mode ごとの `*QualificationConfirmed` field、API contract は従来どおり維持する。

## 回帰防止

`__tests__/static/qualification-confirm-error-fallbacks.test.ts` で以下を固定する。

- `Failed to update qualification status` の user-visible hardcode を再導入しない。
- API の具体的な `error` が `common.networkError` より優先される。
- fetch rejection でも mode ごとの既存 notifier から `common.networkError` を表示する。
- `messages/en.json` と `messages/ja.json` の両方に `common.networkError` が存在する。

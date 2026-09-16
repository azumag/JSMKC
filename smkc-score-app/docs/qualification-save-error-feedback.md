# Qualification save error feedback

BM / MR の予選管理画面では、管理者が入力した試合結果を保存できなかった場合に、失敗を画面上で通知する。

## Error contract

- API が non-2xx を返し、レスポンスに具体的な `error` がある場合はその文言を優先して表示する。
- API が具体的な `error` を返さない場合と、`fetch()` 自体が reject した場合は `common.networkError` を表示する。
- BM は既存 UI に合わせて `alert()`、MR は `toast.error()` を使用する。
- fetch/network failure は従来どおり client logger に診断情報を残す。

## State preservation

保存に失敗した場合は、再入力なしで再試行できるようにダイアログ、選択中の match、入力済みスコアを保持する。成功した場合だけ既存どおりダイアログを閉じ、入力状態を reset し、`refetch()` する。

API endpoint、payload、score validation、成功時の更新フローは変更しない。

## Regression guard

`__tests__/static/qualification-save-error-feedback.test.ts` が BM / MR の source contract を検証し、API-specific error の優先、`common.networkError` fallback、failure 時の state preservation が失われないようにする。

GP の同種経路は issue #3580 の残作業として別変更で対応する。

# Qualification save error feedback

BM / MR / GP の予選管理画面では、管理者が入力した試合結果や GP のカップ割り当てを保存できなかった場合に、失敗を画面上で通知する。

## Error contract

- API が non-2xx を返し、レスポンスに具体的な `error` がある場合はその文言を優先して表示する。
- API が具体的な `error` を返さない場合と、`fetch()` 自体が reject した場合は `common.networkError` を表示する。
- BM / GP は既存 UI に合わせて `alert()`、MR は `toast.error()` を使用する。
- fetch/network failure は従来どおり client logger に診断情報を残す。
- GP では race-detail score、manual score、qualification cup assignment の3経路を同じ契約に揃える。

## State preservation

保存に失敗した場合は、再入力なしで再試行できるようにダイアログ、選択中の match、入力済みスコア・レース詳細・カップ選択を保持する。成功した場合だけ既存どおりダイアログを閉じ、入力状態を reset し、`refetch()` する。GP の cup assignment も失敗時には現在の選択と resolution を維持し、成功時のみサーバー応答を反映する。

API endpoint、payload、score validation、version / cup resolution、成功時の更新フローは変更しない。

## Regression guard

`__tests__/static/qualification-save-error-feedback.test.ts` が BM / MR / GP の source contract を検証し、API-specific error の優先、`common.networkError` fallback、failure 時の state preservation が失われないようにする。

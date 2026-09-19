# Qualification save error feedback

BM / MR / GP の予選管理画面では、管理者が入力した試合結果や GP のカップ割り当てを保存できなかった場合に、失敗を画面上で通知する。

## Error contract

- HTTP non-2xx では response body の raw `error` / `message` を user-facing feedback に使用せず、`common.networkError` を表示する。
- `fetch()` 自体が reject した場合も `common.networkError` を表示し、raw exception は client logger のみに残す。
- BM / GP は既存 UI に合わせて `alert()`、MR は `toast.error()` を使用する。
- HTTP failure の logger には status、tournamentId、matchId など安全な診断 context を残す。
- GP では race-detail score、manual score、qualification cup assignment の3経路を同じ fail-closed 契約に揃える。

## State preservation

保存に失敗した場合は、再入力なしで再試行できるようにダイアログ、選択中の match、入力済みスコア・レース詳細・カップ選択を保持する。成功した場合だけ既存どおりダイアログを閉じ、入力状態を reset し、`refetch()` する。GP の cup assignment も失敗時には現在の選択と resolution を維持し、成功時のみサーバー応答を反映する。

API endpoint、payload、score validation、version / cup resolution、成功時の更新フローは変更しない。

## Regression guard

`__tests__/static/qualification-save-error-feedback.test.ts` が BM / MR / GP の source contract を検証し、raw API detail の非表示、`common.networkError` fallback、safe diagnostics、failure 時の state preservation が失われないようにする。

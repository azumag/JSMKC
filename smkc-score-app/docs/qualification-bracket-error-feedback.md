# Qualification bracket error feedback contract

BM / MR / GP qualification 画面の finals/playoff bracket の生成・リセットは、HTTP response と fetch/network rejection を区別して通知する。

## Error contract

- non-2xx response が具体的な `error` を返した場合は、その API 固有メッセージを最優先する。
- non-2xx response に具体的な `error` がない場合は、既存の `common.failedResetBracket` / `common.failedGenerateBracket` を使用する。
- `fetch()` 自体が reject した場合は、共有翻訳キー `common.networkError` を使用する。
- BM / GP は既存 UI に合わせて `alert()`、MR は `toast.error()` で通知する。
- fetch rejection は client logger に action と `tournamentId` を残す。
- 成功時だけ `setFinalsExists(false | true)` を更新し、失敗時には既存 bracket state を保持する。
- `finally` で `resettingBracket` / `generatingBracket` を必ず解除する。

## 非変更事項

finals API endpoint / payload、Top-16 / Top-24 判定、qualification scoring、確認ダイアログ、成功時の画面遷移契約は変更しない。

# Qualification bracket error feedback contract

BM / MR / GP qualification 画面の finals/playoff bracket の生成・リセットは、backend の response-body `error` を管理 UI に直接表示しない fail-closed 契約にする。

## Error contract

- HTTP non-2xx response は response body を user-facing message の生成に使わず、共有翻訳キー `common.networkError` を表示する。
- HTTP failure の client logger には action、HTTP status、`tournamentId` などの運用上必要な context だけを残し、backend の raw error detail は保存・表示しない。
- `fetch()` 自体が reject した場合も、user-facing message は `common.networkError` に統一する。caught exception は既存 logger 契約の範囲で診断用に記録してよい。
- BM / GP は既存 UI に合わせて `alert()`、MR は `toast.error()` で通知する。
- 成功時だけ `setFinalsExists(false | true)` を更新し、失敗時には既存 bracket state を保持する。
- `finally` で `resettingBracket` / `generatingBracket` を必ず解除する。

この fail-closed 契約は #3842 により BM / MR / GP に適用する。TA page-local mutation の残存 debt は temporary raw-error debt guard で別途追跡する。

## 非変更事項

finals API endpoint / payload、Top-16 / Top-24 判定、qualification scoring、確認ダイアログ、成功時の画面遷移契約は変更しない。

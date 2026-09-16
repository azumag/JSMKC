# Match report error feedback contract

MR / GP の公開 match detail から結果を送信する場合、利用者向け generic error と診断情報を分離する。

## 表示契約

- report API が具体的な `error` を返す non-2xx では、その API メッセージを優先する。
- API error のない non-2xx は `common.networkError` を表示する。
- error response body が JSON でない場合も `common.networkError` にフォールバックする。
- `fetch()` rejection は `common.networkError` を表示し、raw error は client logger に残す。
- generic failure に英語ハードコードや `match.submitResult` のボタンラベルを流用しない。

## 非変更事項

report endpoint / payload、入力 validation、認可、成功時の `setSubmitted(true)` と `refetch()`、`submitting` の cleanup は変更しない。

# Overall ranking error feedback contract

`/tournaments/[id]/overall-ranking` は、利用者向けエラーと診断情報を分離する。

## 表示契約

- GET/POST API が具体的な `error` 文字列を返す場合は、そのメッセージを優先する。
- GET の fetch rejection、API error のない non-2xx、error のない invalid response は `common.networkError` を表示する。
- 再計算 POST の fetch rejection と API error のない non-2xx も `common.networkError` を表示する。
- runtime の `Error.message` は generic fallback としてユーザーへ露出しない。
- generic failure の raw error、HTTP status、`tournamentId` は client logger に残す。

## 非変更事項

overall ranking の算出、API endpoint/schema、polling interval/cache key、再計算成功後の `refetch()`、admin 権限と画面構造は変更しない。

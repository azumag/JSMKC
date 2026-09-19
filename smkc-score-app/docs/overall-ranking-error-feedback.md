# Overall ranking error feedback contract

この文書は legacy 名を維持するための案内である。overall ranking の client-side error handling の正本は [`overall-ranking-client-errors.md`](./overall-ranking-client-errors.md) とする。

## 現行契約

- GET / polling / recalculation POST の HTTP non-2xx response body は、user-facing error 文言を取り出す目的では解析しない。
- backend の `error` / `message` prose や runtime の `Error.message` をそのまま UI に表示せず、generic failure は localized `common.networkError` に fail-closed する。
- malformed JSON や structurally invalid な 2xx response も成功扱いせず、`common.networkError` を表示する。
- client logger には `tournamentId`、HTTP status、failure stage など安全な診断情報を残せるが、server prose を UI contract として扱わない。
- 将来 distinct な user-facing error が必要な場合は stable machine-readable code を追加し、localized copy へ明示的に map する。

## 非変更事項

overall ranking の算出、API endpoint/schema、polling interval/cache key、再計算成功後の `refetch()`、admin 権限と画面構造は変更しない。

詳細と read / polling / recalculation ごとの契約は canonical document を参照する。Follow-up: #3874 / #3871。

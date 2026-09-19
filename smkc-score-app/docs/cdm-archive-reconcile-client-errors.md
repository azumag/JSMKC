# CDM archive reconcile client error contract

`CdmArchiveReconcileButton` は backend の error prose を user-visible copy として扱わず、preview/apply の generic failure を next-intl の `common.networkError` に fail-closed する。

## Preview / apply の HTTP failure

- HTTP non-2xx response body は UI 用に解析しない。
- response body に `error` / `data.error` / `message` が含まれていても表示せず、localized `common.networkError` を表示する。
- failure body の `json()` 自体を呼ばない。backend prose と client UI contract を分離するためである。
- client logger には `tournamentId`、operation を表す固定 message、HTTP status など安全な診断情報を残す。

## Transport / malformed success response

fetch rejection や、2xx response の JSON が malformed / 必要な構造を満たさず後続処理が失敗した場合は、既存 catch を通して `common.networkError` を表示する。runtime error の詳細は UI に表示しない。

## 成功時に維持する挙動

- 2xx preview response の JSON parse と `data` unwrap
- preview digest と tournament name 確認 prompt
- apply request payload
- archive reconciliation / regeneration 結果の成功表示
- 成功後の page reload

distinct な user-facing error が将来必要になった場合は、backend prose を直接表示するのではなく stable machine-readable code を追加して localized copy へ map する。

Tracked by #3872. API schema / reconciliation algorithm / DB / Cloudflare / production migration は変更しない。

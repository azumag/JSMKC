# TA sudden-death mutation error fallback contract

共有 `useTaSuddenDeath` hook が扱う course change と sudden-death result submit の client error handling は fail-closed とし、next-intl の `common.networkError` を user-facing fallback に使用する。

HTTP non-2xx では response body の raw `error` / `message` を UI 用に解析しない。`change_sudden_death_course` と `submit_sudden_death` は、HTTP status、`tournamentId`、`phase`、`suddenDeathRoundId` などの安全な診断情報だけを client logger に残し、UI には `common.networkError` を表示する。`fetch()` rejection も同じ generic fallback とし、例外の raw detail は logger のみに残す。

result submit の入力検証は request 前に行うため、無効なタイムは network failure として扱わず、従来どおり player-specific validation message を優先する。成功時の既存 `fetchData()` と submit input reset は維持する。

## 対象

- `change_sudden_death_course` の client-side HTTP / transport failure
- `submit_sudden_death` の client-side HTTP / transport failure
- finals / elimination の両画面から共有される `useTaSuddenDeath` hook の表示契約

## 診断情報と UI の境界

- user-facing: localized `common.networkError`
- logger: HTTP status、`tournamentId`、`phase`、`suddenDeathRoundId`、transport exception
- HTTP failure body: user-facing copy のためには parse しない
- validation: request 前の invalid time は既存 validation message を維持する

## 対象外

この文書更新は既存実装の契約を明確化するもので、挙動変更は行わない。以下は変更しない。

- API error schema / status code
- sudden-death rule / scoring / course selection logic
- request payload
- mutation serialization / retry policy
- DB、Cloudflare、production migration

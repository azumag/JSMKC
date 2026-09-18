# TA battle royale setup client error contract

`BattleRoyaleSetupClient` のユーザー向け failure は next-intl の `common.networkError` に統一する。

開始 API の non-2xx response も `common.networkError` を表示し、response body の raw `payload.error` はユーザー UI に表示しない。`fetch()` rejection やその他の client-side 例外、player list fetch failure も同じ generic message を表示し、browser/runtime 由来の raw `Error.message` もユーザー UI に表示しない。

## 診断情報

non-2xx start response は HTTP status と API error を logger に残し、request rejection は元の例外を logger に残す。ユーザー向け表示を fail-closed にしても、開発・運用時の診断情報は client logger で保持する。

## ユーザー向け表示

1. start API の non-2xx response は `common.networkError`
2. fetch rejection は `common.networkError`
3. player list fetch failure も `common.networkError`

raw `payload.error` と raw `Error.message` は UI に出さない。

## 非対象

- POST payload / battle royale API contract
- 最低2人の開始制約
- 選手選択・TA handicap
- 確認ダイアログ
- 成功後の finals への hard navigation
- DB / Cloudflare / production 設定

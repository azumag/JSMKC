# TA battle royale setup client error contract

`BattleRoyaleSetupClient` の generic network failure は next-intl の `common.networkError` を使用する。

開始 API が具体的な `payload.error` を返す場合はその内容を優先し、non-2xx response に具体的 error がない場合は `common.networkError` に fallback する。`fetch()` rejection やその他の client-side 例外も `common.networkError` を表示し、browser/runtime 由来の raw `Error.message` はユーザー UI に表示しない。low-level detail は client logger に残す。

## 保持する優先順位

1. start API response の具体的な `payload.error`
2. start API の generic non-2xx failure は `common.networkError`
3. fetch rejection / player list fetch failure も `common.networkError`

non-2xx start response は HTTP status と API error を logger に残し、request rejection は元の例外を logger に残す。ユーザー向け表示を一般化しても診断情報は失わない。

## 非対象

- POST payload / battle royale API contract
- 最低2人の開始制約
- 選手選択・TA handicap
- 確認ダイアログ
- 成功後の finals への hard navigation
- DB / Cloudflare / production 設定

# TA battle royale setup client error contract

`BattleRoyaleSetupClient` の generic network failure は next-intl の `common.networkError` を使用する。

開始 API が具体的な `payload.error` を返す場合はその内容を優先し、non-2xx response に具体的 error がない場合は `common.networkError` に fallback する。fetch rejection やプレイヤー一覧取得失敗も既存どおり `common.networkError` を使用する。

## 保持する優先順位

1. start API response の具体的な `payload.error`
2. start API の generic non-2xx failure は `common.networkError`
3. fetch rejection / player list fetch failure も `common.networkError`

## 非対象

- POST payload / battle royale API contract
- 最低2人の開始制約
- 選手選択・TA handicap
- 確認ダイアログ
- 成功後の finals への hard navigation
- DB / Cloudflare / production 設定

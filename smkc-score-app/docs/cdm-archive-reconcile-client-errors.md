# CDM archive reconcile client error contract

`CdmArchiveReconcileButton` の generic failure は next-intl の `common.networkError` を使用する。

API が返す reconciliation 固有の error は `errorMessage(...)` で引き続き優先する。preview/apply の non-2xx response に `error` / `data.error` / `message` が含まれない場合と、fetch などが例外を送出した場合はいずれも `common.networkError` に統一する。

## 保持する優先順位

1. API response の `error` / `data.error` / `message`
2. API 固有 error がない preview/apply failure は `common.networkError`
3. fetch などが例外を送出した generic network failure も `common.networkError`

これにより同じ reconcile 操作内の generic failure は単一の shared translation contract を使い、locale 分岐の重複を持たない。

logger の diagnostic message は user-visible translation ではないため変更しない。

## 非対象

- reconciliation logic / digest / schedule mutation
- API schema / status code
- DB / Cloudflare / production migration
- 確認文、成功文、ボタン文言
- CDM archive reconcile 画面全体の i18n 移行

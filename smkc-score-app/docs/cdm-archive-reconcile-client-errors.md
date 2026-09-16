# CDM archive reconcile client error contract

`CdmArchiveReconcileButton` の generic network failure は next-intl の `common.networkError` を使用する。

API が返す reconciliation 固有の error は `errorMessage(...)` で引き続き優先し、preview/apply の固有 fallback、確認文、成功文、ボタン文言はこの契約の対象外とする。

## 保持する優先順位

1. API response の `error` / `data.error` / `message`
2. preview/apply 操作固有の fallback
3. fetch などが例外を送出した generic network failure は `common.networkError`

logger の diagnostic message は user-visible translation ではないため変更しない。

## 非対象

- reconciliation logic / digest / schedule mutation
- API schema / status code
- DB / Cloudflare / production migration
- CDM archive reconcile 画面全体の i18n 移行

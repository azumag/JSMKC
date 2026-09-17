# Tournament status update error contract

Tournament lifecycle の更新 UI は、API が意図して返した業務エラーと、通信・プロトコル・不正レスポンス由来の内部詳細を分離する。

対象:

- 通常の tournament status `PUT /api/tournaments/:id`
- archived tournament の reopen で利用する `POST /api/tournaments/:id/restore`

## ユーザー表示

- API が `error` / `data.error` / `message` として具体的な業務エラーを返した場合は、その内容を表示する。
- detail のない non-2xx、non-JSON error response、`fetch()` rejection、malformed success response は `common.networkError` を表示する。
- transport / protocol / invalid-response の raw detail（例: `HTTP 502`、browser fetch error、`Invalid tournament status update response`）は UI に表示しない。

## 診断

raw error は `client-logger` に残し、status、target transition、archive restore の有無など既存の診断 metadata を維持する。

## 不変条件

- archived-only 404 から `/restore` へ切り替える既存 fallback は維持する。
- restore API が返す具体的な業務エラーは表示可能なままにする。
- 成功時の tournament state 更新、`statusUpdating` cleanup、ボタン制御は変更しない。

Issue #3608 の実装では `src/lib/tournament-status-update.ts` で user-facing API error と generic/internal failure を明示的に分類し、layout 側では分類結果に応じて具体的メッセージまたは `common.networkError` を選択する。

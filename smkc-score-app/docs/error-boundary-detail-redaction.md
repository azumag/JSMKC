# ErrorBoundary runtime detail redaction

Default `ErrorFallback` は、runtime `Error.message` をユーザー向け UI に直接表示しない。

## Contract

- ユーザーには `errors.fetchError` / `errors.networkError` / `errors.timeoutError` / `errors.genericError` などの翻訳済みメッセージだけを表示する。
- raw `Error.message`、stack、component stack は default fallback UI には描画しない。
- 元の `Error` と component stack は `componentDidCatch` の logger および任意の `onError` callback には引き続き渡し、診断可能性を維持する。
- recoverable error の `Try Again`、page reload、custom fallback API は変更しない。

これにより、内部 URL・識別子・実装詳細・ライブラリ診断などが runtime message に含まれた場合でも、default error UI 経由で利用者へ露出しない。

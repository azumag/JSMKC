# TA participant error fallback contract

`/tournaments/[id]/ta/participant` のユーザー向けエラー表示は、可能な限り API が返す具体的な `error` を優先する。API が具体的なエラーを返さない場合、または client-side の fetch / network 例外が発生した場合は、next-intl の `common.networkError` を fallback として使用する。

この共有キーは英語・日本語の両メッセージカタログで管理し、participant page に locale 固有のエラー文字列を直接追加しない。これにより、通常の入力検証や成功通知と同様に、通信失敗時も現在の locale に従って表示される。

## 優先順位

1. API response に具体的な `error` がある場合は、その内容を表示する。
2. API response に具体的な `error` がない場合は `common.networkError` を表示する。
3. client-side 例外が `Error` として具体的な message を持つ場合は既存どおりその message を表示し、message を取得できない場合は `common.networkError` を使用する。

logger に送る診断用メッセージは user-facing text ではないため、この契約の対象外とする。

この契約は表示 fallback のみを対象とし、API の status code / error schema、認証、TA の時刻検証、DB、スコア計算、debugMode の挙動は変更しない。

# Profile linked-player fetch error fallback contract

`/profile` が session に紐づく player record を `/api/players/:id` から取得する際のユーザー向けエラー表示は、HTTP failure / transport failure のどちらでも raw backend detail を公開せず、next-intl の共有キー `common.networkError` に正規化する。

1. non-2xx response の body に具体的な API `error` が含まれていても、その内容は UI へ表示しない。
2. non-2xx response は `common.networkError` を `role="alert"` で表示する。
3. fetch / network rejection の場合も同じ `common.networkError` を表示し、例外メッセージは UI へ露出しない。

成功時の player association 表示、QR one-scan login card、session 判定、API payload / response contract はこの fallback 変更の対象外とする。

この契約は `__tests__/app/profile/page.test.tsx` と `__tests__/app/profile-page.test.tsx` で API detail を含む HTTP failure、generic HTTP failure、network rejection の各経路を回帰保護する。

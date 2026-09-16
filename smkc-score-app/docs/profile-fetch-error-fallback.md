# Profile linked-player fetch error fallback contract

`/profile` が session に紐づく player record を `/api/players/:id` から取得する際のユーザー向けエラー表示は、次の優先順位を守る。

1. non-2xx response に具体的な API `error` がある場合は、その内容を表示する。
2. non-2xx response に具体的な API `error` がない場合は、next-intl の共有キー `common.networkError` を表示する。
3. fetch / network rejection の場合も `common.networkError` を表示する。

成功時の player association 表示、QR one-scan login card、session 判定、API payload / response contract はこの fallback 変更の対象外とする。

この契約は `__tests__/app/profile/page.test.tsx` で API-specific error、generic HTTP failure、network rejection の各経路を回帰保護する。

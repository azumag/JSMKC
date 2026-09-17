# TA qualification setup error fallbacks

TA qualification setup は roster 削除、player 追加、entry 再取得、Battle Royale handicap、seeding、partner の順で複数 API を更新する。この保存順序と既存 payload は維持する。

API が具体的な `error` を返した場合はその内容を利用者へ提示する。response body に具体的 error がない non-2xx と `fetch()` / retry helper の rejection は locale-aware な `common.networkError` を dialog と toast に表示する。raw `Error.message` / stack、HTTP status、失敗した操作種別は client logger のみに残す。

削除時の 404 許容、逐次更新、成功時の dialog close / refetch / success toast は変更しない。部分成功時 rollback の追加はこの契約の対象外とする。

# TA qualification setup error fallbacks

TA qualification setup は roster 削除、player 追加、entry 再取得、Battle Royale handicap、seeding、partner の順で複数 API を更新する。この保存順序と既存 payload は維持する。

HTTP non-2xx では response body の raw `error` / `message` を利用者向け文言として解析しない。`SetupSaveError` は localized `common.networkError` と HTTP status、失敗した operation を保持し、dialog / toast には `common.networkError` を表示する。`fetch()` / retry helper の rejection も同じ generic fallback とし、raw `Error.message` / stack は client logger のみに残す。

削除時の 404 許容、逐次更新、成功時の dialog close / refetch / success toast は変更しない。部分成功時 rollback の追加はこの契約の対象外とする。

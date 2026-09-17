# TA qualification admin mutation error fallbacks

TA qualification の time 保存と phase promote/reset は、利用者向けエラーと診断用エラー詳細を分離する。

API が具体的な `error` を返した場合はその内容を優先する。response body に具体的な error がない generic non-2xx と `fetch()` rejection は locale-aware な `common.networkError` を表示し、HTTP status、raw `Error.message`、stack は client logger のみに残す。

成功時の endpoint、method、payload、dialog state、refetch、phase-status refresh は変更しない。promotion の skipped-player 成功通知はこの契約の対象外とする。

# TA qualification admin mutation error fallbacks

TA qualification の time 保存と phase promote/reset は、利用者向けエラーと診断用エラー詳細を分離する。

HTTP non-2xx では response body の raw `error` / `message` を利用者向け文言として解析せず、locale-aware な `common.networkError` を表示する。promote は成功レスポンスでのみ既存 JSON を解析し、reset と time 保存の failure body は解析しない。`fetch()` rejection も同じ generic fallback とする。HTTP status、raw `Error.message` / stack は client logger のみに残す。

成功時の endpoint、method、payload、dialog state、refetch、phase-status refresh は変更しない。promotion の skipped-player 成功通知はこの契約の対象外とする。

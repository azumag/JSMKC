# TA qualification freeze/unfreeze error fallback

TA qualification の freeze / unfreeze は tournament PUT (`/api/tournaments/:id`) で `frozenStages` を更新する。

HTTP non-2xx では response body の raw `error` / `message` を利用者向け文言として解析せず、locale-aware な `common.networkError` を toast に表示する。`fetch()` rejection も同じ generic fallback とする。HTTP status と browser/network 由来の raw `Error.message` / stack は client logger のみに残し、toast には露出しない。

成功時の `frozenStages` payload、polling refetch、freeze/unfreeze success toast は変更しない。

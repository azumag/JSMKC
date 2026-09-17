# TA qualification freeze/unfreeze error fallback

TA qualification の freeze / unfreeze は tournament PUT (`/api/tournaments/:id`) で `frozenStages` を更新する。

利用者向けエラー表示は、API が具体的な `error` を返した場合はその内容を優先し、response body に具体的な error がない non-2xx と `fetch()` rejection では locale-aware な `common.networkError` を使用する。browser/network 由来の raw `Error.message` / stack や HTTP status は client logger のみに残し、toast には露出しない。

成功時の `frozenStages` payload、polling refetch、freeze/unfreeze success toast は変更しない。

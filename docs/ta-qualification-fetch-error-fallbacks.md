# TA qualification load error contract

TA qualification load の user-facing error handling は fail-closed とし、backend の raw `error` / `message` prose や browser/runtime の `Error.message` を UI に表示しない。

## User-facing behavior

- HTTP non-2xx response は body の raw detail を user-facing fallback 用に解析せず、`common.networkError` を表示する。
- primary request の rejection、malformed success body、その他の client-side parse failure も `common.networkError` にフォールバックする。
- HTTP failure の client logger には status、tournamentId など安全な診断 context を残す。
- transport / parse exception の raw detail は診断用 logger のみに保持し、UI には流さない。
- successful retry は prior polling error を clear し、reload なしで recovery できる状態を維持する。

## Data and polling behavior

qualification endpoint、polling interval、cache key、response mapping は維持する。通常の3秒 polling は TA qualification payload だけを取得し、global player list を同時取得しない。server initial-data hydration も同じ shape を使い、qualification entries に含まれる player identity のみを持つ。

Setup/Edit Players の player discovery は admin dialog が open の間だけ `usePlayerSearch()` が `/api/players?limit=50&search=...` を bounded に取得する。search transport / response validation failure は qualification page 全体を error state にせず、dialog 内で localized `common.networkError` として表示する。既存 qualification entry と既に観測した search result は保持するため、search failure や query change だけで selected assignment は失われない。

これにより、一時的な `/api/players` failure は setup dialog の discovery だけに隔離され、primary TA qualification load の failure とは独立して localized generic feedback と安全な診断情報を維持する。

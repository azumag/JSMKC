# TA qualification load error contract

TA qualification load の user-facing error handling は fail-closed とし、backend の raw `error` / `message` prose や browser/runtime の `Error.message` を UI に表示しない。

## User-facing behavior

- HTTP non-2xx response は body の raw detail を user-facing fallback 用に解析せず、`common.networkError` を表示する。
- primary request の rejection、malformed success body、その他の client-side parse failure も `common.networkError` にフォールバックする。
- HTTP failure の client logger には status、tournamentId など安全な診断 context を残す。
- transport / parse exception の raw detail は診断用 logger のみに保持し、UI には流さない。
- successful retry は prior polling error を clear し、reload なしで recovery できる状態を維持する。

## Data and polling behavior

qualification endpoint、polling interval、cache key、initial-data hydration、response mapping は変更しない。setup-player request は引き続き intentionally non-fatal とし、`fetchAllPlayersForSetup()` が failure 時に `null` を返した場合は `resolveAllPlayers()` が利用可能なら TA payload の archived `allPlayers` へ fallback する。

これにより、一時的な `/api/players` failure で利用可能な qualification data 全体を error page に置き換えず、primary TA qualification load の failure だけを localized generic feedback と安全な診断情報に分離する。

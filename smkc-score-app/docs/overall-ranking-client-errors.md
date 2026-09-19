# Overall ranking client error contract

The overall-ranking page treats backend error prose as diagnostic data, not user-facing copy.

## Read / polling failures

- Transport failures, HTTP non-2xx responses, malformed JSON, and structurally invalid 2xx responses surface the localized `common.networkError` message.
- HTTP failure bodies are not parsed to recover an `error` string for display.
- Client logging may keep safe context such as `tournamentId`, HTTP status, and the failure stage. It must not rely on server prose for the UI contract.

## Recalculation failures

- A failed `POST /api/tournaments/[id]/overall-ranking` surfaces `common.networkError`.
- The failure response body is not parsed to obtain display text.
- Successful recalculation continues to trigger the existing immediate `refetch()` path.

This is intentionally fail-closed. If a future overall-ranking error requires a distinct user-facing message, add a stable machine-readable code and map that code to localized copy rather than displaying backend prose directly.

Tracked by #3870; tightens the generic-error work from #3586.

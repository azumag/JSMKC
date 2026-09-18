# Finals playoff reconciliation network-error contract

`FinalsPlayoffReconciliation` is an administrator-only repair control for the Top-24 barrage-fed Upper opening slots. Network failures must not turn this control into a silent or ambiguous state.

## Preview read

- A transport-level `fetch()` rejection while loading the reconciliation preview is handled locally; it must not escape as an unhandled rejection.
- The component remains visible and shows the localized `common.networkError` message with a `common.tryAgain` action.
- A successful retry clears the failure state and restores the normal `in_sync`, `stale`, or `blocked` preview.
- Raw browser, proxy, DNS, TLS, endpoint, or stack details are not rendered in the UI.

## Apply mutation

- A transport-level rejection from the reconciliation `PATCH` is handled locally.
- `onSaved()` is not called on a failed request.
- The saving state is always released so the existing reconciliation action can be retried.
- The administrator sees the localized `common.networkError`; raw low-level network details remain hidden.

## Unchanged behavior

This contract does not change optimistic-lock versions, blocker handling, `in_sync` handling, downstream-match protection, API payloads, database state, migrations, dependencies, or deployment configuration.

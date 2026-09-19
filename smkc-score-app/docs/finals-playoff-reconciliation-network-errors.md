# Finals playoff reconciliation network-error contract

`FinalsPlayoffReconciliation` is an administrator-only repair control for the Top-24 barrage-fed Upper opening slots. Network failures must not turn this control into a silent or ambiguous state.

## Preview read

- A transport-level `fetch()` rejection while loading the reconciliation preview is handled locally; it must not escape as an unhandled rejection.
- An HTTP non-2xx response is treated as a preview failure without parsing its response body for UI content.
- A 2xx response that cannot be decoded or does not contain a valid reconciliation preview shape is also treated as a preview failure instead of silently hiding the repair control.
- The component remains visible and shows the localized `common.networkError` message with a `common.tryAgain` action.
- A successful retry clears the failure state and restores the normal `unavailable`, `in_sync`, `stale`, or `blocked` preview behavior.
- Raw browser, proxy, DNS, TLS, endpoint, response-body, or stack details are not rendered in the UI.

## Apply mutation

- A transport-level rejection from the reconciliation `PATCH` is handled locally.
- `onSaved()` is not called on a failed request.
- The saving state is always released so the existing reconciliation action can be retried.
- The administrator sees the localized `common.networkError`; raw low-level network details remain hidden.
- Existing machine-readable blocker/code handling for non-2xx PATCH responses is unchanged.

## Unchanged behavior

This contract does not change optimistic-lock versions, blocker handling, `in_sync` handling, downstream-match protection, API payloads, database state, migrations, dependencies, or deployment configuration.

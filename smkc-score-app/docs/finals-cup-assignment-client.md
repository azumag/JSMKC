# Finals cup-assignment client contract

`FinalsCupAssignment` persists the selected GP finals cup together with an `expectedVersion` and an explicit resolution for existing cup details. The client must not intentionally emit duplicate PATCH requests for one save action.

## Mutation serialization

The component acquires an in-flight ref lock synchronously before publishing `saving=true`. This closes the same-render window where two activations could otherwise observe the previous enabled state and send the same optimistic-version mutation twice.

The React `saving` state remains responsible for the visible disabled state of the Save button. The ref lock is released from `finally` after the request settles, including HTTP and transport failures, so an administrator can retry.

## Preserved behavior

- `resolution === "cancel"` remains a no-op and keeps the Save button disabled.
- The PATCH payload still contains `matchId`, `cup`, `expectedVersion`, and `resolution`.
- A transport rejection still shows the localized generic cup-update failure.
- A non-success response still prefers the API error and otherwise uses the localized generic failure.
- `onSaved()` runs once after a successful request and never after a failed request.

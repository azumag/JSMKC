# Finals corrected-result client contract

`FinalsScoreOverride` is the administrator-only client control for persisting an auditable corrected finals result. The request includes the match `expectedVersion`, so the client must not intentionally emit duplicate PUTs for one save activation.

## Save serialization

A corrected-result save acquires an in-flight ref lock synchronously before React publishes `saving=true`. This closes the same-render window where two activations could otherwise observe the previous `saving=false` state and send the same correction twice.

The `saving` state remains responsible for the visible disabled state of the save button. The ref lock is the mutation-serialization boundary and is released from `finally` after the request settles, including HTTP and transport failures, so an administrator can retry.

## Preserved behavior

- The existing `expectedVersion`, scores, override flag, and tie-winner payload are unchanged.
- A non-success response still prefers the API error and otherwise shows the localized generic save failure.
- A transport rejection still shows only the localized generic failure; raw network details are not exposed in the UI.
- Downstream advancement warnings are still shown after a successful save.
- `onSaved()` runs once after a successful request and never for a rejected or non-success request.

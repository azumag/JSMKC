# Finals round-format client contract

`FinalsRoundSettings` applies one target-win value to every pending match in the current finals round. The PATCH payload includes an `expectedVersions` map for those pending matches, so the client must not intentionally emit duplicate mutations for one apply action.

## Mutation serialization

The component acquires an in-flight ref lock synchronously before publishing `saving=true`. This closes the same-render window where two activations could otherwise observe the previous enabled state and send identical PATCH requests with the same optimistic versions.

The React `saving` state remains responsible for the visible disabled state of the Apply button. The ref lock is the mutation-serialization boundary and is released in `finally` after the request settles, including HTTP and transport failures, so an administrator can retry.

## Preserved behavior

- Target wins are still restricted to safe integers from 1 through 99.
- The PATCH payload still includes the selected match id plus the pending round's `expectedVersions` map.
- A transport rejection still shows the localized generic round-format failure.
- A non-success response still prefers the API error and otherwise uses the localized generic failure.
- `onSaved()` runs once after a successful request and never after a failed request.

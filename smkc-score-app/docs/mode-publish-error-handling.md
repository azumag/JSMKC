# Mode publish error handling

`ModePublishSwitch` updates a tournament's `publicModes` through `useModePublish`.
Because the PUT payload is derived from the currently known `publicModes`, an
initial read failure must not be treated as an empty list.

## Initial load failures

If the initial tournament summary request returns a non-success response or the
request itself rejects, the hook reports an `error: "load"` state. The UI shows
`common.networkError` and keeps the publish switch disabled. This prevents a PUT
from being constructed from an unknown/default publish state and accidentally
overwriting visibility for other modes.

Raw request details remain in the client logger and are not rendered to users.

## Update failures

If a publish/unpublish PUT returns a non-success response or rejects, the hook
reports `error: "update"`. The previously known `publicModes` state is retained,
the UI shows `common.networkError`, and the switch becomes available again after
`updating` is cleared so an administrator can retry.

A successful retry clears the error, updates local state, and continues to emit
the existing `publicModesChanged` event so tournament tab badges refresh without
a page reload.

## Unchanged contract

- Tournament summary endpoint and publish PUT endpoint are unchanged.
- `addPublicMode` / `removePublicMode` remain the source of the outgoing list.
- The double-submit guard remains active while an update is in flight.
- No raw browser/network `Error.message` is shown in the publish control UI.

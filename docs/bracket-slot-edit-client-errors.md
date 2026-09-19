# Bracket slot edit client error contract

The admin `BracketSlotEditDialog` uses the shared finals `PATCH` endpoint for manual slot adjustments (`swap`, `assign`, and `swapSlots`).

## User-visible failures

HTTP non-2xx responses are fail-closed. The client must not parse or render server-provided prose such as `error`, `message`, or nested response details. The dialog keeps the existing localized `finals.slotEditFailed` message and remains open so the admin can retry or cancel.

Transport failures use the same localized fallback. Successful saves are unchanged: the dialog closes and the parent bracket refetches through `onSaved()`.

## Diagnostics

Client logging may retain safe request context needed for diagnosis: the operation name, finals API path, match id, and HTTP status. Transport exceptions may record the exception name/message/stack, but HTTP response bodies are not diagnostic input for the UI path.

## Regression coverage

`__tests__/components/tournament/bracket-slot-edit-dialog.test.tsx` verifies that a non-2xx response body is not parsed, raw backend detail is not sent to the toast, the localized fallback is shown, and the failed save neither closes the dialog nor calls `onSaved()`.

See issue #3887.

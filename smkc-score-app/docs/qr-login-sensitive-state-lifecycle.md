# QR login sensitive state lifecycle

The QR one-scan login dialog receives a raw bearer token only in the issue or reissue response. That plaintext token is used to build the login URL and the locally generated QR image, so both `rawToken` and `qrImageUrl` are treated as sensitive, one-time client state.

`QrLoginDialog` clears both values on every dialog transition. In particular, closing via the overlay, Escape, or the close button must discard the raw token and generated QR immediately rather than keeping them in hidden React state until the dialog is opened again.

Each dialog transition advances a session counter. Every async operation that can mutate dialog state — status loading, issue/reissue, revoke, and QR generation — captures that session generation. A response, error handler, or `finally` block may update `status`, `error`, `loading`, `submitting`, `rawToken`, or `qrImageUrl` only while its captured generation still matches the current dialog session. This prevents close/reopen races from allowing stale work to overwrite a newer status or to clear the busy flag of a newer request.

Opening or closing also resets the busy flags immediately. Old network requests are not cancelled, but they no longer keep a later dialog session disabled while they finish. Their eventual completion is ignored by the UI.

This lifecycle rule does not change endpoint payloads, server token invalidation, confirmation prompts, Clipboard fallback, or printing while the current dialog session remains open. Reopening fetches the server-side active/inactive status but never retrieves an existing raw bearer token, because the server stores only its hash after issuance.

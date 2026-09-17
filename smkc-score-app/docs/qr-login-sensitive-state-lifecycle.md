# QR login sensitive state lifecycle

The QR one-scan login dialog receives a raw bearer token only in the issue or reissue response. That plaintext token is used to build the login URL and the locally generated QR image, so both `rawToken` and `qrImageUrl` are treated as sensitive, one-time client state.

`QrLoginDialog` clears both values on every dialog transition. In particular, closing via the overlay, Escape, or the close button must discard the raw token and generated QR immediately rather than keeping them in hidden React state until the dialog is opened again.

Each dialog transition advances a session counter. Every async operation captures that session generation before it starts. Status-loading success/error/finally handlers and mutation success/error handlers may update `status`, `error`, `loading`, `rawToken`, or `qrImageUrl` only while their captured generation still matches the current dialog session. This prevents close/reopen races from allowing stale work to overwrite a newer status or reintroduce credentials.

Read-only status loading is session-local: opening or closing resets `loading`, and an older GET cannot clear the loading state owned by a newer GET. Token-changing POST/DELETE operations are different. Their `submitting` flag intentionally remains set across close/reopen until the in-flight server mutation settles, so a second issue/reissue/revoke cannot race the first mutation and make the displayed raw token disagree with the server's active token. A stale mutation may release `submitting` in its `finally`, but it must not update the reopened dialog's status, error, token, or QR image.

This lifecycle rule does not change endpoint payloads, server token invalidation, confirmation prompts, Clipboard fallback, or printing while the current dialog session remains open. Reopening fetches the server-side active/inactive status but never retrieves an existing raw bearer token, because the server stores only its hash after issuance.

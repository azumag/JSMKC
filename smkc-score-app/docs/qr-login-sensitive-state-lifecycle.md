# QR login sensitive state lifecycle

The QR one-scan login dialog receives a raw bearer token only in the issue or reissue response. That plaintext token is used to build the login URL and the locally generated QR image, so both `rawToken` and `qrImageUrl` are treated as sensitive, one-time client state.

`QrLoginDialog` clears both values on every dialog transition. In particular, closing via the overlay, Escape, or the close button must discard the raw token and generated QR immediately rather than keeping them in hidden React state until the dialog is opened again.

Each dialog transition advances a session counter. Every async operation captures that session generation before it starts. Status-loading success/error/finally handlers and mutation success/error handlers may update `status`, `error`, `loading`, `rawToken`, or `qrImageUrl` only while their captured generation still matches the current dialog session. This prevents close/reopen races from allowing stale work to overwrite a newer status or reintroduce credentials.

Status GETs also have their own monotonically increasing request generation. Within one dialog session, only the most recently started status request may update `status`, `error`, or `loading`. This is needed because a reopen GET may still be in flight when a token mutation from an older dialog session settles and starts an authoritative post-mutation status refresh; the earlier GET must not overwrite that later result if it returns last.

Server token status is fail-closed on the client. Starting any status GET clears the previously known status, and every open/close transition also discards the previous session's status. Until the current request succeeds, issue/reissue/revoke controls remain disabled. If the current status request fails, the localized error is shown with a read-only retry action; retry only repeats the status GET and cannot mutate token state. This prevents an old active/inactive value from authorizing a mutation when the current server state is unknown.

Read-only status loading is session-local: opening or closing resets `loading`. Token-changing POST/DELETE operations are different. Their `submitting` flag intentionally remains set across close/reopen until the in-flight server mutation settles, so a second issue/reissue/revoke cannot race the first mutation and make the displayed raw token disagree with the server's active token.

When a token-changing mutation settles after the dialog session that started it has already changed, the mutation still does not restore its raw token, QR image, status, or error directly into the newer session. Instead, it releases the serialized mutation lock and starts a fresh status GET for the current session. That post-settle GET supersedes any earlier status request and reconciles the UI with the server state after the mutation has finished.

This lifecycle rule does not change endpoint payloads, server token invalidation, confirmation prompts, Clipboard fallback, or printing while the current dialog session remains open. Reopening fetches the server-side active/inactive status but never retrieves an existing raw bearer token, because the server stores only its hash after issuance.

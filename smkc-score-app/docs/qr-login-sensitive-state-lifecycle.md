# QR login sensitive state lifecycle

The QR one-scan login dialog receives a raw bearer token only in the issue or reissue response. That plaintext token is used to build the login URL and the locally generated QR image, so both `rawToken` and `qrImageUrl` are treated as sensitive, one-time client state.

`QrLoginDialog` clears both values on every dialog transition. In particular, closing via the overlay, Escape, or the close button must discard the raw token and generated QR immediately rather than keeping them in hidden React state until the dialog is opened again.

Issue and reissue requests can outlive the dialog that started them. Each dialog transition therefore advances a session counter. Async token and QR generation work may update sensitive state only when its captured session still matches the current dialog session. A response from a closed or previously opened dialog must be ignored, including the close-then-reopen race.

This lifecycle rule does not change token status handling, revoke semantics, Clipboard fallback, or printing while the current dialog session remains open. Reopening fetches the server-side active/inactive status but never retrieves an existing raw bearer token, because the server stores only its hash after issuance.

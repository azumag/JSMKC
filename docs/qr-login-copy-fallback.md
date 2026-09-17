# QR login copy fallback

The QR one-scan login dialog keeps the bearer-token login URL entirely in the browser after issuance.

## Copy behavior

- When `navigator.clipboard.writeText` is available, the Copy button uses the Clipboard API.
- If the Clipboard API is unavailable, the login URL input is focused and selected so the user can copy it manually.
- If `writeText()` rejects, the rejection is caught, low-level details are logged through the client logger, and the same focus/select fallback is used.
- Clipboard failures must not become unhandled promise rejections.

## Preserved behavior

Token issue/reissue/revoke endpoints, bearer-token handling, QR generation, login URL construction, and print behavior are unchanged. The fallback only affects the Copy action after a QR login token has already been issued.

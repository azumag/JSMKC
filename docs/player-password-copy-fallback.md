# Player temporary password copy fallback

The Player Management page shows a one-time temporary password after player creation or an admin password reset. The plaintext exists only in the current browser dialog and cannot be retrieved again after it is closed.

## Copy behavior

- When `navigator.clipboard.writeText` is available, the Copy button uses the Clipboard API.
- If the Clipboard API is unavailable, the temporary-password input is focused and selected so the admin can copy it manually.
- If `writeText()` rejects, the rejection is caught, low-level details are recorded through the client logger, and the same focus/select fallback is used.
- Clipboard failures must not become unhandled promise rejections.

## Preserved behavior

Player creation, password-reset endpoints, temporary-password generation, dialog lifecycle, and the displayed password value are unchanged. The fallback only affects the Copy action after a temporary password is already visible.

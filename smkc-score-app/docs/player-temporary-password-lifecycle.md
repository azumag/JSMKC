# Player temporary password lifecycle

Player creation and password reset can return a one-time plaintext password. The client stores that value only long enough to show the temporary-password dialog so an administrator can save or copy it.

The password-dialog close path is intentionally centralized in `handlePasswordDialogOpenChange` in `src/app/players/page.tsx`. Any transition to the closed state must clear `temporaryPassword` immediately. This applies both to Radix Dialog dismissals such as overlay click or Escape and to the explicit `savedIt` acknowledgement button.

The Clipboard API fallback remains independent of this lifecycle rule: when clipboard access is unavailable or rejected, the read-only password field is focused and selected for manual copying. Closing the dialog afterwards still clears the plaintext from React state.

When adding a new close control to this dialog, route it through `handlePasswordDialogOpenChange(false)` rather than updating `isPasswordDialogOpen` directly.

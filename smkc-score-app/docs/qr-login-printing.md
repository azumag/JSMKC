# QR login printing contract

The QR one-scan login dialog prints a locally generated QR image in a dedicated popup window. The QR data URI contains a bearer credential, so the print flow must remain predictable and must not weaken the dialog's existing DOM-safety boundary.

## Print readiness

- The popup is opened synchronously from the user's Print button click so browser popup-blocker behavior is unchanged.
- The print document is built with DOM APIs; the player nickname is assigned through `textContent`, `title`, and `alt`, never interpolated into raw HTML.
- `focus()` and `print()` run only after the print-window QR `<img>` emits `load`.
- The image listeners are attached before assigning `src`, preventing an immediately available data URI from racing ahead of the readiness gate.
- The `load` handler is one-shot, so the popup cannot trigger duplicate print dialogs from repeated load events.

## Image-load failure

If the print-window image emits `error`, the dialog:

1. does not call `focus()` or `print()`;
2. records a client diagnostic without exposing credential-bearing image data;
3. closes the now-useless print popup; and
4. shows the localized `errors.genericError` fallback in the original dialog.

The existing `players.printPopupBlocked` message remains reserved for the distinct case where the browser refuses to create the popup at all.

## Non-goals

This behavior does not change QR token issuance, reissue/revoke semantics, login URL construction, QR generation, clipboard copy behavior, or server-side authentication.

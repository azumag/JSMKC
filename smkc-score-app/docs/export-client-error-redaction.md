# Export client error redaction

`ExportButton` keeps operator-facing export failures useful without rendering low-level runtime details.

- HTTP failures continue to use the localized status/authorization messages derived from `ExportRequestError`.
- Browser transport failures represented by `TypeError` continue to use `common.exportFailedNetwork`.
- Other client-side runtime failures use only the localized `common.exportFailed` fallback. Their raw `Error.message` and stack are not rendered in the alert.
- The structured client logger still receives the raw message/stack for diagnosis.

This separation prevents proxy names, URLs, DOM/browser implementation details, or other internal runtime strings from leaking into the UI while preserving existing diagnostics. Download cleanup, retryability, filenames, export payloads, API behavior, and server-side logging are unchanged.

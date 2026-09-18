# Export client error redaction

`ExportButton` keeps operator-facing export failures useful without rendering low-level runtime details from the post-response download setup path.

- HTTP failures continue to use the localized status/authorization messages derived from `ExportRequestError`.
- Failures before a response arrives keep the existing transport behavior: browser `TypeError` uses `common.exportFailedNetwork`, while the legacy generic-error fallback remains unchanged for compatibility.
- After a response has arrived, Blob conversion, object-URL creation, or DOM download setup failures use only the localized `common.exportFailed` fallback. Their raw `Error.message` and stack are not rendered in the alert.
- The structured client logger still receives the raw message/stack for diagnosis.

This separation prevents proxy names, URLs, DOM/browser implementation details, or other internal runtime strings from leaking into the UI after the server has successfully responded, while preserving existing transport diagnostics and behavior. Download cleanup, retryability, filenames, export payloads, API behavior, and server-side logging are unchanged.

# Qualification bracket client error handling

Qualification bracket reset/generate controls must not surface backend response-body error details directly to administrators. HTTP non-2xx responses use the localized `common.networkError` message, while the client logger keeps only operational context such as the HTTP status and tournament ID. Transport failures use the same user-facing message and may log the caught exception.

This keeps diagnostics available without turning upstream or backend error strings into UI content. Successful reset/generate behavior, request payloads, qualification rules, and loading-state cleanup are unchanged.

As part of #3842, BM, MR, and GP follow this fail-closed contract. TA page-local mutation debt remains tracked separately by the temporary raw-error debt guard until its follow-up migration is merged.

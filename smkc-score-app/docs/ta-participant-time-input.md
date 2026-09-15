# TA participant time input contract

The participant-facing Time Attack page uses the shared `timeToMs` parser from `src/lib/ta/time-utils.ts` as the single source of truth for converting and validating entered times.

## Accepted format

- Official display format: `M:SS.mm` or `MM:SS.mm`.
- A legacy third fractional digit is accepted for compatibility.
- Seconds must be `00` through `59`.
- The minutes component is limited to one or two digits by the shared parser.
- Empty values are allowed while editing, but malformed values are rejected before submission.

The qualification form, partner form, Phase 3 reporting, and participant-side total previews must all derive milliseconds from `timeToMs`. They must not introduce a separate regular expression or local display-time parser.

For qualification and partner submissions, malformed values use the `invalidTimeFormat` validation path, while syntactically valid non-positive values use `invalidTime`. Phase 3 reports use the existing `reportInvalidTime` error for either case.

This keeps participant validation aligned with API-side schemas and prevents client-only values such as `100:00.00` from being accepted locally and rejected later by the server.

## Regression coverage

`__tests__/app/tournaments/ta-participant-page.test.tsx` covers a valid `1:00.00` Phase 3 submission and verifies that an out-of-contract `100:00.00` value is rejected before any report POST is made.

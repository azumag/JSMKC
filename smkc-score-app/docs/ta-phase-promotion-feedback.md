# TA phase promotion feedback

TA qualification phase promotion can succeed while skipping entrants whose qualification times are incomplete.

## Client contract

- A successful promotion with no skipped entrants does not show an extra native alert.
- When the API returns skipped entrants, the client shows `ta.promotionSkippedSummary` after refreshing phase status.
- `promoted` is the number of phase entries created by the API response.
- `skipped` is the comma-separated list of skipped player nicknames returned by the API.
- English and Japanese copy live in `messages/ta-promotion/{locale}.json` and are merged into the existing `ta` next-intl namespace by `src/i18n/request.ts`.
- Promotion endpoint, request payload, skip decision, and phase-status refresh ordering are unchanged.

The UI must not construct this skipped-player summary from hard-coded English text in `page-client.tsx`.

# TA qualification load error contract

TA qualification keeps concrete server-provided API errors visible to operators, but generic client and transport failures must not expose browser/runtime `Error.message` text in the UI.

## User-facing behavior

- A non-2xx TA response with a non-empty `error` string keeps that message.
- A generic non-2xx response, primary request rejection, malformed error body, or malformed success body falls back to `common.networkError`.
- Low-level exception details and HTTP status stay in the client logger for diagnosis.
- A successful retry clears the prior polling error so the page can recover without a reload.

## Data and polling behavior

The qualification endpoint, polling interval, cache key, initial-data hydration, and response mapping are unchanged. The setup-player request remains intentionally non-fatal: `fetchAllPlayersForSetup()` returns `null` on failure and `resolveAllPlayers()` falls back to the TA payload's archived `allPlayers` value when available.

This keeps temporary `/api/players` failures from replacing otherwise usable qualification data with an error page while ensuring failures of the primary TA qualification load are localized and logged.

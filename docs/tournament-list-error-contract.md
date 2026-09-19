# Tournament list admin mutation error contract

The tournament-list admin UI treats HTTP failure response bodies as untrusted implementation detail.

## Create

A non-successful tournament creation response uses the localized `tournaments.failedToCreate` message. The failure response body is not parsed for user-facing prose. Client diagnostics retain the HTTP status only.

## Delete

A delete response with HTTP 409 keeps the existing localized `tournaments.cannotDeleteStartedTournament` message because the status itself represents the known lifecycle conflict. All other HTTP failures use `tournaments.failedToDelete`. The failure response body is not parsed, and diagnostics retain only the HTTP status and tournament ID.

Transport failures use the same localized operation-specific fallbacks while retaining the existing exception diagnostics.

Successful creation, pagination refresh, draft-only delete guard, battle-royale confirmation, and submit serialization are unchanged.

## Regression coverage

`smkc-score-app/__tests__/static/tournament-list-error-fallbacks.test.ts` guards the page-level contract so raw response-body errors or failure-body parsing cannot be reintroduced without an explicit test change.

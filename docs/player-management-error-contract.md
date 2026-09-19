# Player management error contract

The player-management admin UI treats HTTP failure details as untrusted implementation data.

## Create

`createPlayerWithRetry` may retain a machine-readable `code` so the UI can localize recognized conditions such as a duplicate nickname. Backend-provided prose is not returned to the page as a user-facing failure message. Unknown failures use `players.failedToCreate`.

## Update

The update path may inspect the response only for a machine-readable `code`. `PLAYER_ERROR_CODES.DUPLICATE_NICKNAME` maps to `players.duplicateNickname`; all other HTTP failures use `players.failedToUpdate`. Arbitrary response `error` text is never rendered.

## Delete and reset password

Delete and reset-password failures do not parse the response body. They show the operation-specific localized fallback (`players.failedToDelete` or `players.failedToResetPassword`) and log only safe diagnostic context such as HTTP status and player ID.

Successful reset-password responses still parse the generated temporary password because that value is required for the one-time credential dialog.

## Regression coverage

`__tests__/static/player-management-error-fallbacks.test.ts` guards the page-level contract so raw `data.error` fallbacks or response-body parsing cannot be reintroduced into update/delete/reset-password failure paths without an explicit test change.

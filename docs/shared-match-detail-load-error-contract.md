# Shared match detail load error contract

BM, MR, and GP public match detail/share pages use the same initial-load error contract.

## User-facing behavior

- A 404 from either the mode match endpoint or tournament summary is treated as `match.matchNotFound`.
- Other non-2xx responses, request rejections, and response parse failures show `common.networkError`.
- Generic initial-load failures include a `common.tryAgain` action that reuses the polling hook's `refetch()` path.
- Once valid match data has loaded, a later polling failure does not replace the existing match display with an error screen; stale data stays visible while the next poll can recover.
- Browser/runtime error strings and HTTP status details are kept in the client logger rather than exposed to the user.

## Preserved behavior

The BM/MR/GP match endpoints, tournament-summary endpoint, polling interval, response-wrapper unwrapping, participant/admin authorization, and score-reporting flows are unchanged. Only the read-side initial-load classification and recovery UI are shared by `shared-match-page-data.ts`.

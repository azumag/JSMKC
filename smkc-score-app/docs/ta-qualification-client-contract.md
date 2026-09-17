# TA qualification client contracts

This note records small client-side invariants that should not regress while the TA qualification page evolves.

## Setup-save error handling

`src/app/tournaments/[id]/ta/page-client.tsx` uses `SetupSaveError` to preserve API response metadata for the setup dialog.

- `SetupSaveError` stays at **module scope**. React Compiler does not support an inline class declaration inside a component callback and otherwise skips optimizing the component.
- API non-2xx failures prefer the API `payload.error` and fall back to `common.networkError`.
- Transport/request rejection shows `common.networkError`; the raw `Error.message` and stack remain logger-only details.
- The mutation order remains delete → batch add → qualification refetch → handicap/seeding/partner reconciliation.
- A delete that returns 404 remains tolerated because the desired end state is already satisfied.

## Battle Royale standings columns

When `taBattleRoyaleMode` is enabled, the qualification standings header includes a handicap column. Every standings player row must therefore include the matching `TaHandicapBadge` cell in the same conditional position, before progress/points/time cells. Standard TA keeps the original column layout.

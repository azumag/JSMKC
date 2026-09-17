# Rank override save result contract

`RankCell` is used by BM, MR, and GP qualification standings for both in-group
and combined-rank overrides. The shared `useQualificationActions` handlers own
the API mutation and normal user-facing error notification, while `RankCell`
owns the inline editor state and provides a final safety fallback if a supplied
`onSave` callback unexpectedly rejects.

## Single-save result

`handleRankOverrideSave` and `handleCombinedRankOverrideSave` return a boolean:

- `true` after a successful PATCH and refetch.
- `false` after a non-success HTTP response or a rejected request handled by the hook.

Normal failure notifications remain unchanged: a concrete API error is preferred
when available, otherwise `common.networkError` is shown, and request details
remain in the client logger.

## Editor behavior

`RankCell.onSave` accepts `Promise<boolean | void>`. An explicit `false` means
the mutation failed and the editor must remain open, preserving the entered
value so the administrator can retry. `true` closes the editor. Existing
callbacks that resolve with `undefined` remain backward-compatible and are
also treated as successful saves.

The same rule applies when clearing an existing override.

If a custom or unexpected `onSave` implementation rejects instead of resolving
`false`, `RankCell` keeps the editor open, displays localized
`common.networkError`, and records the original exception in the
`qualification-rank-cell` client logger. Raw `Error.message` values are never
rendered in the inline editor.

## Unchanged contract

- Qualification PATCH endpoints and payloads are unchanged.
- Rank computation and override semantics are unchanged.
- Bulk rank-save handlers keep their existing boolean contract.
- Successful single saves still refetch qualification data exactly once.

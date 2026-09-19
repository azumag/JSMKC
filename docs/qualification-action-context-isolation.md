# Qualification action context isolation

BM / MR / GP の qualification 画面で共有する `useQualificationActions` は、rank override、bulk rank override、TV assignment、broadcast reflect の client mutation を所有する。

各 async action は開始時の `{tournamentId, mode}` に所属する。request が完了する前に別大会・別 mode へ移動した、または hook が unmount した場合、その completion は現在画面へ副作用を持ち込まない。

## Contract

- response / rejection の後、現在の `{tournamentId, mode}` と mount 状態を再確認する。
- stale completion は `alert` / toast、logger、`refetch()` を実行しない。
- stale rank / broadcast action は caller へ `false` を返す。
- bulk override は identity が変わった時点で残りの PATCH を送らず停止する。
- TV assignment は optimistic UI の既存挙動を維持するが、旧大会の late failure で新しい画面を toast / refetch しない。
- 現在 context の success / failure に対する payload、localized feedback、refetch 契約は変更しない。

mutation request を navigation 時に abort することは correctness の前提にしない。HTTP request の中断は server mutation の未適用を保証しないため、client は late completion を fail-closed に隔離し、bulk action では current identity を確認してから次の mutation を送る。

## Regression coverage

`smkc-score-app/__tests__/lib/hooks/useQualificationActions.test.ts` で、A 大会の pending rank save / bulk save / TV assignment / broadcast reflect を B 大会へ切り替えた後に完了させ、旧 completion が B 大会の通知・refetch・後続 mutation を起こさないことを固定する。

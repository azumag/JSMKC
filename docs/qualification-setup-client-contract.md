# Qualification setup client contract

BM / MR / GP の qualification setup は `smkc-score-app/src/lib/hooks/useQualificationSetup.ts` が共通して所有する。hook は GroupSetupDialog の open/close や入力 state を所有せず、POST transport、重複送信防止、失敗分類、成功後の refetch を担当する。

## Player discovery

`GroupSetupDialog` の選手候補は、qualification polling が持つ bounded な `allPlayers` を初期表示用の seed として使いつつ、dialog が open の間は `usePlayerSearch()` の server-side search を正本として補完する。

- server-side search は `/api/players?limit=50&search=...` の bounded first page を使い、入力 debounce、AbortController、generation ownership は shared hook が所有する。
- 空 query の最初の search が完了するまで、親 payload の先頭50件だけを fallback 表示できる。非空 query で unfiltered seed へ fallback しない。
- 過去の検索で取得済み、または親 payload に含まれる selected player は current result page 外でも表示情報を保持し、query change だけで assignment を失わない。
- `Select All` / deselect は current bounded result page だけに作用し、過去 query の selected player を巻き込まない。
- player-search failure は backend raw prose を表示せず `common.networkError` に fail-closed する。

これにより 300人を超える roster でも BM / MR / GP の Setup/Edit Groups から任意の player を検索して追加できる。qualification page 自体が現在行っている `fetchAllPlayersForSetup()` の3秒 polling は別の性能境界であり、Issue #3933 の次段階として polling から分離する。

## Non-idempotent request ownership

qualification setup POST は non-idempotent mutation であり、request を開始した `{tournamentId, mode}` identity にだけ所属する。

- 同じ identity で setup POST が進行中の場合、2回目の submit は `common.operationInProgress` の validation error で拒否する。
- tournament または mode が変わった場合、旧 request は `AbortController` で中断し、submit lock と UI saving/error state を新しい context へ持ち越さない。
- transport/mock が abort を無視して旧 response を返した場合も、request ownership と現在の identity を再確認し、旧 completion は `setupError` / `setupSaving` を更新しない。
- stale response は旧 `refetch` を呼ばず、caller へ `{ ok: false }` を返す。これにより、旧 page handler が新しい context の dialog を成功扱いで閉じることも防ぐ。
- 旧 request の `finally` は controller ownership と identity が一致する場合だけ lock / saving state を解除し、新しい request の進行状態を消さない。

## Error contract

4xx は localized `common.setupValidationError`、5xx は localized `common.setupServerError`、transport failure は localized `common.networkError` を表示する。4xx/5xx の machine-readable `code` は診断・分岐用に保持できるが、backend の raw error prose は UI に表示しない。

成功した POST の後に `refetch()` だけが失敗した場合、POST 自体を failure 扱いに戻さない。同じ non-idempotent mutation の再実行を促すと重複生成につながり得るため、refresh failure は logger に記録し、setup result は成功として扱う。ただし identity が変わった後の stale completion は成功として caller に返さない。

## Regression coverage

`smkc-score-app/__tests__/lib/hooks/useQualificationSetup.test.ts` で次を固定する。

- request payload は submit 開始時に snapshot される
- same-context concurrent submit は1 request に直列化される
- validation/server/network failure は localized fallback を使う
- successful POST 後の refresh failure は non-idempotent retry を誘発しない
- A大会の request が pending のまま B大会へ移動しても B大会が即座に submit できる
- abort を無視して返る A大会の late success / transport failure が B大会の state、refetch、submit lock を変更しない

player search の debounce / stale completion / unmount abort は `smkc-score-app/__tests__/hooks/use-player-search.test.ts`、`GroupSetupDialog` の server-search wiring と selected-player retention / bounded bulk-selection は `smkc-score-app/__tests__/static/group-setup-player-search-contract.test.ts` で固定する。

API endpoint、payload、authorization、qualification grouping semantics はこの client-side isolation 契約では変更しない。

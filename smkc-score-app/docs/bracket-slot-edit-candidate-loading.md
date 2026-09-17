# Bracket slot assign candidate loading contract

`BracketSlotEditDialog` の Assign タブは、qualification roster から交代候補を取得する。候補が本当に0件である状態と、候補取得に失敗した状態を同じ UI にしない。

## States

- loading: `slotEditLoadingCandidates` を表示する。
- success with candidates: 既存の candidate select を表示する。
- success with zero eligible candidates: `slotEditNoCandidates` を表示する。
- request rejection / non-2xx / response parse failure: `common.networkError` を表示し、`slotEditNoCandidates` は表示しない。

## Diagnostics and retry

candidate load failure の元 exception と `qualificationApiPath` は `bracket-slot-edit` client logger に記録する。内部接続情報や runtime error message は UI へ展開しない。

Assign タブを離れて戻る、または dialog を開き直すと既存の candidate-fetch effect が再実行されるため、追加の永続エラー状態は持たない。

slot edit の PATCH、API-specific save error、swap / assign / swapSlots payload と成功後の refresh 契約は変更しない。

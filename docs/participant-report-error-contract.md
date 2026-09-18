# Participant report error contract

BM / MR / GP の participant page は `smkc-score-app/src/lib/hooks/useParticipantMatches.ts` を共通利用する。各 page は `common.networkError` の翻訳済み文言を `networkErrorMessage` として hook に渡し、初期データ取得と report 送信の generic failure を同じローカライズ済み fallback に統一する。

## 初期データ取得

`tournament summary` と mode-specific match data は同時に取得する。

1. 両 response が成功した場合のみ tournament / matches state を更新する。
2. どちらかが non-2xx で具体的な API `error` を返した場合は、その内容を表示する。
3. non-2xx だが具体的な API error がない場合は `common.networkError` を表示する。
4. `fetch()` rejection や JSON parse failure など client-side 例外でも `common.networkError` を表示する。

初期取得が失敗した場合、片方だけ成功した response を partial state として表示しない。HTTP status、失敗した source、low-level exception は logger に残す。

## report 送信

レポート送信失敗時は次の優先順位で表示する。

1. API が non-2xx で具体的な `error` を返した場合、その内容を表示する。
2. non-2xx だが具体的な API error がない場合、`common.networkError` を表示する。
3. `fetch()` rejection など request-level failure の場合も `common.networkError` を表示する。

ブラウザ・通信層由来の raw `Error.message` は UI に表示しない。元の例外は client logger に記録し、診断可能性を維持する。

## MR / GP shared match の report 送信

MR / GP の shared match detail page (`/mr/match/[matchId]` / `/gp/match/[matchId]`) は上記 participant hook とは独立した submit path を持つ。この経路では HTTP non-2xx と `fetch()` rejection のどちらもユーザー向けには `common.networkError` のみを表示し、response body の `error` やブラウザ由来の raw error detail を UI に露出しない。

成功時の submitted state、`refetch()`、request payload、client-side validation は変更しない。transport-level exception は引き続き client logger に記録し、失敗後は `finally` で submitting state を解除して再試行可能な状態へ戻す。

## MR shared match の identity validation

MR の shared match page は score report 前に reporting player identity を選択する必要がある。未選択時の client-side validation は英語リテラルを持たず、既存の `match.selectPlayer` を使う。これにより英語では `Please select which player you are`、日本語では `自分がどちらのプレイヤーか選択してください` が現在の locale に従って表示される。

この変更は validation 条件そのもの、score report endpoint、payload、participant/admin authorization、submit flow を変更しない。

## MR shared match の race-winner validation

MR の shared match page は全レースの勝者が選択されてから score report を送信する。未選択レースがある場合の client-side validation は英語リテラルを持たず、`match.selectAllRaceWinners` を `TOTAL_MR_RACES` の `count` parameter とともに使う。

このメッセージは `messages/match-validation/en.json` と `messages/match-validation/ja.json` で locale parity を保ち、`src/i18n/request.ts` が既存の `match` namespace へ merge する。既存の split catalog (`ta-promotion`) と同じ方式のため、大きい基底 catalog の重複を増やさず feature 単位の翻訳を管理できる。

この変更も validation 条件、`TOTAL_MR_RACES`、report endpoint / payload、authorization、score semantics を変更しない。

## 状態保持

report 失敗時は `submitReport()` が `null` を返し、呼び出し側が保持している入力値を勝手に消さない。`submitting` state は `finally` で必ず解除する。成功時のみ返却された match を local state に反映する。

## 互換性

`networkErrorMessage` は hook の低レベルな単体利用との互換性のため optional とするが、BM / MR / GP の production participant page はすべて `common.networkError` を渡す。endpoint、payload、polling interval、participant access-control の契約は変更しない。

## 回帰保護

`smkc-score-app/__tests__/lib/hooks/useParticipantMatches.test.ts` と `useParticipantMatches-i18n-errors.test.ts` で以下を確認する。

- API-specific error がそのまま保持されること
- initial non-2xx が silent failure / partial state にならないこと
- generic non-2xx と request rejection が supplied localized fallback を使うこと
- request rejection の raw detail が UI に漏れず logger に残ること
- non-JSON error response が JSON parse error を UI に漏らさないこと

加えて `smkc-score-app/__tests__/static/match-report-error-fallbacks.test.ts` で MR / GP shared match submit の HTTP non-2xx と transport failure が `common.networkError` に統一され、raw API error を UI fallback に使わないことを固定する。同じ static test で MR shared match の identity validation が `match.selectPlayer` を使うこと、および race-winner validation が `match.selectAllRaceWinners` に `TOTAL_MR_RACES` を渡すことも確認する。race-winner validation の EN/JA split catalog は同一キー集合であることと、`src/i18n/request.ts` が `match` namespace に merge することも同テストで確認する。

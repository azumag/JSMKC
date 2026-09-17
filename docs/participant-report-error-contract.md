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

## MR shared match の client-side validation

MR の shared match page は score report 前に reporting player identity と全 race の winner を入力する必要がある。これらの validation は英語リテラルを持たず、既存の翻訳を利用する。

- identity 未選択: `match.selectPlayer`
- race winner 未入力: `participant.completeAllRaceFields`

これにより現在の locale に従って EN/JA の validation message が表示される。validation 条件そのもの、`TOTAL_MR_RACES`、score report endpoint、payload、participant/admin authorization、score semantics、submit flow は変更しない。

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

加えて `smkc-score-app/__tests__/static/match-report-error-fallbacks.test.ts` で MR shared match の identity / incomplete-race validation が既存の `match.selectPlayer` / `participant.completeAllRaceFields` を使い、EN/JA catalog の両方に意図した文言が存在することを固定する。

# Participant report error contract

BM / MR / GP の participant page は `smkc-score-app/src/lib/hooks/useParticipantMatches.ts` の `submitReport()` を共通利用する。

## ユーザー向けエラー

レポート送信失敗時は次の優先順位で表示する。

1. API が non-2xx で具体的な `error` を返した場合、その内容を表示する。
2. non-2xx だが具体的な API error がない場合、HTTP status を含む安全な generic message (`Report failed (<status>)`) を表示する。
3. `fetch()` rejection など request-level failure の場合、`Failed to submit report. Please check your connection.` を表示する。

ブラウザ・通信層由来の raw `Error.message` は UI に表示しない。元の例外は client logger に記録し、診断可能性を維持する。

## 状態保持

失敗時は `submitReport()` が `null` を返し、呼び出し側が保持している入力値を勝手に消さない。`submitting` state は `finally` で必ず解除する。成功時のみ返却された match を local state に反映する。

## 回帰保護

`smkc-score-app/__tests__/lib/hooks/useParticipantMatches.test.ts` で以下を確認する。

- API-specific error がそのまま保持されること
- request rejection の raw detail が UI に漏れず logger に残ること
- non-JSON error response が JSON parse error を UI に漏らさず status fallback になること

# TA participant mutation error fallback contract

`src/app/tournaments/[id]/ta/participant/page.tsx` の participant 向け mutation (`handleSubmitTimes` / `handleSubmitPartnerTimes` / `handleReportTime` / `handleAddToTimeAttack`) は、`docs/ta-sudden-death-error-fallbacks.md` と同じ契約で next-intl の `common.networkError` を fallback に使用する。

API が具体的な `error` を返した場合はその内容を優先し、response body に error がない non-2xx や `fetch()` rejection では locale-aware な共通 fallback を表示する。request rejection の raw detail は client logger のみに残し、raw な `Error.message` を UI に表示しない。

Phase 3 report (`handleReportTime`) のみ、`NO_OPEN_ROUND` / `ROUND_ALREADY_SUBMITTED` / `ROUND_MISMATCH` / `PLAYER_REPORT_DISABLED` / `PLAYER_ELIMINATED` の error code マッピングを維持し、それ以外の non-2xx は `json.error || tCommon('networkError')` にフォールバックする。

## 対象

- 自分の qualification time 保存 (`handleSubmitTimes`)
- partner の qualification time 保存 (`handleSubmitPartnerTimes`)
- Phase 3 time report (`handleReportTime`)
- TA 参加登録 (`handleAddToTimeAttack`)

## 対象外

この変更は user-visible fallback のみを扱う。以下は変更しない。

- API error schema / status code / Phase 3 error code
- validation ロジックと入力保持
- 成功時の state 更新・alert
- submitting / reporting cleanup
- request payload、retry policy
- DB、Cloudflare、production migration

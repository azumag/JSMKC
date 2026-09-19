# Match report error feedback contract

MR / GP の公開 match detail から結果を送信する production path では、利用者向け generic error と診断情報を分離し、backend の raw `error` / `message` prose を UI に表示しない。詳細な participant page の共通契約と低レベル互換性は `docs/participant-report-error-contract.md` を canonical contract とする。

## 表示契約

- report API の HTTP non-2xx は response body の raw detail を user-facing fallback 用に解析せず `common.networkError` を表示する。
- `fetch()` rejection も `common.networkError` を表示し、raw transport exception は client logger のみに残す。
- HTTP failure の logger には status、tournamentId、mode、matchId など安全な診断 context を保持する。
- generic failure に英語ハードコードや `match.submitResult` のボタンラベルを流用しない。

shared `useParticipantMatches` の `networkErrorMessage` は低レベルな単体利用との互換性のため optional で、未指定時だけ API-specific / HTTP status fallback を返せる。BM / MR / GP の production participant pages は localized `common.networkError` を渡すため、production UI では raw response detail を露出しない。

## 非変更事項

report endpoint / payload、入力 validation、認可、成功時の `setSubmitted(true)` と `refetch()`、`submitting` の cleanup は変更しない。

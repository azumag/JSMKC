# TA result submit error feedback contract

TA Phase 1/2 elimination と Phase 3 finals の round result 送信は、API 固有エラーと generic transport failure を分離する。

## 表示契約

- report API が具体的な `error` を返す non-2xx では、そのメッセージを優先する。
- API error のない non-2xx と non-JSON error body は `common.networkError` を表示する。
- `fetch()` rejection や success body の JSON parse failure は `common.networkError` を表示する。
- raw runtime error は client logger に `tournamentId` と phase/action context とともに残す。
- generic fallback として英語ハードコードや raw `Error.message` をユーザーへ露出しない。

## 非変更事項

submit endpoint / payload、preview、tie-break、validation、成功時の state reset と refetch、`submitting` cleanup は変更しない。

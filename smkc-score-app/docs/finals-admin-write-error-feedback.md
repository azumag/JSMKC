# Finals admin write error feedback contract

BM / MR / GP finals の管理 UI では、HTTP failure の backend prose をユーザー向けエラーメッセージとして表示しない。

## Error contract

- HTTP non-2xx response body の `error` / `message` / text は user-facing copy の生成に使わない。
- 既存の localized fallback（`failedAssignTv`、`failedAssignCourse`、`failedUpdateScore`、`failedUpdateMatch`）を表示する。
- HTTP failure の診断には `mode`、`operation`、`tournamentId`、`matchId`、HTTP `status` など安全な metadata を client logger に残す。
- transport exception の既存 logger 診断は維持する。
- success response は従来どおり parse し、optimistic version、bracket progression、champion update、refetch、score validation を変更しない。

## Implementation status

Issue #3889 の適用として、以下の admin write path はこの契約に移行済みで、non-2xx response body を parse しない回帰テストを持つ。

- BM finals: TV number PATCH、starting course PATCH、score PUT
- MR finals: TV number PATCH、match result PUT
- GP finals: TV number PATCH、score PUT

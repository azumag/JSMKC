# Qualification TV assignment failure feedback

BM / MR / GP の共有 `useQualificationActions` hook は、TV 番号の割当てを optimistic UI + fire-and-forget PATCH で保存する。

成功時は従来どおり追加 toast や強制 refetch を行わない。一方、保存に失敗した場合は管理者が optimistic 表示だけを見て保存済みと誤認しないよう error toast を表示し、authoritative state を取り直すため `refetch()` する。

## Fail-closed 方針

- HTTP non-2xx / fetch rejection のどちらでも user-facing message は next-intl の `common.networkError` に統一する。
- API response body の `error` は toast に流さず、HTTP non-2xx では response body 自体を解析しない。
- 診断には status・tournamentId・matchId を client logger に残す。fetch rejection では exception context も既存どおり記録する。
- 成功時の silent behavior、optimistic UI、payload は変更しない。

## 非対象

- TV assignment API / DB schema
- optimistic UI の即時反映
- polling による server state の再同期
- 成功時の通知追加
- qualification ranking / sudden-death logic

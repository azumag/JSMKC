# Qualification TV assignment failure feedback

BM / MR / GP の共有 `useQualificationActions` hook は、TV 番号の割当てを optimistic UI + fire-and-forget PATCH で保存する。

成功時は従来どおり追加 toast や強制 refetch を行わない。一方、保存に失敗した場合は管理者が optimistic 表示だけを見て保存済みと誤認しないよう error toast を表示する。

## エラー表示の優先順位

1. non-2xx response に具体的な API `error` がある場合はその内容を表示する。
2. API `error` がない場合は next-intl の `common.networkError` を表示する。
3. fetch / network rejection でも logger の診断記録を維持しつつ `common.networkError` を表示する。

## 非対象

- TV assignment API / DB schema
- optimistic UI の即時反映
- polling による server state の再同期
- 成功時の通知追加
- qualification ranking / sudden-death logic

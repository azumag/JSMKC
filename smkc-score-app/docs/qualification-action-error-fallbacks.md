# Qualification action error fallback contract

BM / MR / GP の共有 `useQualificationActions` hook が扱う rank override mutation は、HTTP non-2xx / fetch failure のどちらでもユーザー向けには next-intl の `common.networkError` のみを表示する。

## Fail-closed 方針

- API response body の `error` は user-facing alert に流さない。
- HTTP non-2xx では response body を解析せず、status・tournamentId・対象 qualificationId を client logger に記録する。
- fetch / network 例外では既存どおり exception context を client logger に記録し、`common.networkError` を表示する。
- 失敗時は `false` を返して editor / sudden-death input を維持し、成功時だけ `refetch()` する既存契約を維持する。

この契約は single / bulk の rank override と combined-rank override の両方に適用する。

## 非対象

- qualification API の request / response schema
- ranking / sudden-death の計算ロジック
- broadcast reflect の toast contract
- server-side error payload

`common.networkError` は既存の共通翻訳キーを再利用し、rank mutation 専用の重複翻訳キーは追加しない。

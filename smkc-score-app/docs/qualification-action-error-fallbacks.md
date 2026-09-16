# Qualification action error fallback contract

BM / MR / GP の共有 `useQualificationActions` hook が扱う rank override mutation は、ユーザー向け fallback error に next-intl の `common.networkError` を使用する。

## 優先順位

1. API response に具体的な `error` がある場合は、その内容を表示する。
2. non-2xx response に具体的な `error` がない場合は `common.networkError` を表示する。
3. fetch / network 例外が発生した場合も、logger への診断記録を維持したうえで `common.networkError` を表示する。

この契約は single / bulk の rank override と combined-rank override の両方に適用する。

## 非対象

- qualification API の request / response schema
- ranking / sudden-death の計算ロジック
- TV assignment の fire-and-forget behavior
- broadcast reflect の toast contract
- server / client logger の診断用英語メッセージ

`common.networkError` は既存の共通翻訳キーを再利用し、rank mutation 専用の重複翻訳キーは追加しない。

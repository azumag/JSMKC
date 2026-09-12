# Security audit probes

Issue #3114 の Prisma / `deepmerge-ts` 暫定例外を再評価するときは、`smkc-score-app` で次の npm script を使う。

```bash
npm run security:audit:status
npm run security:audit:upstream
npm run security:audit:next-major
```

機械処理用の JSON が必要な場合は `npm run security:audit:status:json`、`npm run security:audit:upstream:json`、`npm run security:audit:next-major:json` を使う。JSON entrypoint は各 probe の既存 `--json` モードを固定して呼び出すため、workflow や手動調査から raw script path と CLI option を重複管理しなくてよい。

`security:audit:status` は `active` 以外の結果に machine-readable な `reason` を付与する。特に `invalid-input` は lockfile shape、package identity、manifest/lockfile dependency snapshot のどの fail-closed precondition で停止したかを区別する。human-readable 出力にも同じ reason を表示するため、単一の `invalid-input` state だけから原因を推測する必要がない。`active` の JSON shape は既存互換性のため変更せず、human-readable reason は `none` と表示する。

`security:audit:upstream` は現在の `package.json` にある Prisma selector の範囲内だけを canonical npm registry へ問い合わせ、互換範囲内に安全な forward remediation と必要な runtime package set が公開されたかを確認する。

`security:audit:next-major` は現在の manifest を変更せず、次 major 側にのみ remediation が存在するかを確認する read-only probe である。major migration の実行可否を自動判断するものではない。

registry metadata を読む upstream / next-major probe にはネットワーク接続が必要で、結果は実行時点の公開 metadata に依存する。いずれの npm entrypoint も依存更新や lockfile 変更は行わない。CI の `Security audit review` が最終的な fail-closed gate であり、ローカル実行結果だけを根拠に暫定例外を削除しない。

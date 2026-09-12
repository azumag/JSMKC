# Compatible Prisma remediation package-set evidence

Issue #3114 の `smkc-score-app/scripts/security-audit-upstream.js` は、現在の `package.json` にある Prisma selector の範囲内で `@prisma/config -> deepmerge-ts` が修正された stable release が公開されたかを canonical npm registry から確認します。

安全な `prisma` CLI release が見つかっただけでは、JSMKC でその version へ実際に更新できるとは限りません。JSMKC は runtime client と Cloudflare D1 driver adapter も同じ Prisma release line で使うため、probe は remediation が見つかった場合に同じ exact version の次の package も公開済みか確認します。

- `@prisma/client`
- `@prisma/adapter-d1`

## 出力

compatible upstream probe は従来の `state` と dependency edge に加えて、次の evidence を stdout と GitHub Actions output に出します。

- `published_remediation_candidate`
- `published_remediation_package_set_state`
- `published_remediation_prisma_client_version`
- `published_remediation_adapter_d1_version`

`published_remediation_candidate` は、`@prisma/config` の `deepmerge-ts` requirement が修正済みで、かつ同じ exact version の `@prisma/client` と `@prisma/adapter-d1` を canonical registry で確認できた場合だけ Prisma version を返します。それ以外は `none` です。

package-set state は次の意味です。

- `not-applicable`: compatible Prisma release がまだ vulnerable なので companion package probe 自体を行わない。
- `ready`: client と D1 adapter の両方が remediation candidate と同じ version で公開済み。
- `unavailable`: companion package の少なくとも1つを registry から確認できなかった。
- `incomplete`: registry response は得られたが candidate と同じ version ではなかった。

この evidence は dependency を変更しません。また `compatible-forward-remediation-available` が検出された場合の既存 fail-closed follow-up gate も緩和しません。目的は、forward fix が現れた際に「CLI の修正だけが公開された状態」をそのまま dependency update 可能と誤認せず、同一versionの package set が揃っているかを明示してから #3114 の例外削除や更新PRを判断できるようにすることです。

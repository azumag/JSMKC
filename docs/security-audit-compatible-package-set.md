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

## Review workflow の gate

`Security audit review` の Job Summary は current-compatible probe の package-set evidence も表示します。`compatible-forward-remediation-available` だけを見て「今すぐ依存更新できる」と扱わず、`published_remediation_candidate` と package-set state を併せて判断します。

- `ready` かつ candidate が存在する場合: 実際に更新可能な package set として明示的な dependency update PR を要求し、gate は fail-closed で停止する。
- `incomplete` かつ candidate が `none` の場合: CLI/config 側の forward fix は見えているが runtime package set がまだ揃っていないため、#3114 を維持したまま review workflow 自体は成功させる。
- `unavailable` や state/output の不整合: registry evidence を確認できないため fail-closed とし、手動確認を要求する。

この evidence と gate は dependency を変更しません。目的は、forward fix が現れた際に「CLI の修正だけが公開された状態」をそのまま dependency update 可能と誤認せず、同一versionの package set が揃っているかを明示してから #3114 の例外削除や更新PRを判断できるようにすることです。

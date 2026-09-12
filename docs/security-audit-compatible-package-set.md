# Compatible Prisma remediation package-set evidence

Issue #3114 の `smkc-score-app/scripts/security-audit-upstream.js` は、現在の `package.json` にある Prisma selector の範囲内で `@prisma/config -> deepmerge-ts` が修正された stable release が公開されたかを canonical npm registry から確認します。

安全な `prisma` CLI release が見つかっただけでは、JSMKC でその version へ実際に更新できるとは限りません。JSMKC は runtime client と Cloudflare D1 driver adapter も利用しているため、probe は remediation が見つかった場合に runtime package も現在の manifest selector から解決できることを確認します。

現在の JSMKC は `prisma` / `@prisma/client` が `^6.19.3`、`@prisma/adapter-d1` が `^7.8.0` です。このため D1 adapter を CLI candidate と同じ exact version に強制する判定は、実際の dependency contract と一致しません。current-compatible probe では次のように扱います。

- `@prisma/client`: manifest selector から得られる最新 stable version が remediation candidate の `prisma` version と一致することを要求する。
- `@prisma/adapter-d1`: manifest に宣言された selector から stable version を解決できることを要求する。CLI candidate と exact version が一致することは要求しない。

Prisma 7 への major migration readiness は別 probe で package major/version alignment を検証しており、この current-compatible 判定を major migration の互換性証明には使いません。

## 出力

compatible upstream probe は従来の `state` と dependency edge に加えて、次の evidence を stdout と GitHub Actions output に出します。

- `published_remediation_candidate`
- `published_remediation_package_set_state`
- `published_remediation_prisma_client_version`
- `published_remediation_adapter_d1_version`

`published_remediation_candidate` は、`@prisma/config` の `deepmerge-ts` requirement が修正済みで、manifest-compatible な `@prisma/client` が同じ remediation candidate version まで公開され、かつ manifest-compatible な `@prisma/adapter-d1` stable release を canonical registry で確認できた場合だけ Prisma version を返します。それ以外は `none` です。

package-set state は次の意味です。

- `not-applicable`: compatible Prisma release がまだ vulnerable なので runtime package probe 自体を行わない。
- `ready`: manifest-compatible client が remediation candidate と一致し、D1 adapter も現在の manifest selector から解決できる。
- `unavailable`: runtime package の少なくとも1つを registry から確認できなかった。
- `incomplete`: registry response は得られたが manifest-compatible client が remediation candidate version に追随していない。

## Review workflow の gate

`Security audit review` の Job Summary は current-compatible probe の package-set evidence も表示します。`compatible-forward-remediation-available` だけを見て「今すぐ依存更新できる」と扱わず、`published_remediation_candidate` と package-set state を併せて判断します。

- `ready` かつ candidate が存在する場合: 明示的な dependency update PR で lockfile 更新、unit tests、Prisma/D1 parity、Cloudflare build を検証する必要があるため、gate は fail-closed で停止する。
- `incomplete` かつ candidate が `none` の場合: CLI/config 側の forward fix は見えているが runtime client がまだ同じ candidate へ追随していないため、#3114 を維持したまま review workflow 自体は成功させる。
- `unavailable` や state/output の不整合: registry evidence を確認できないため fail-closed とし、手動確認を要求する。

この evidence と gate は dependency を変更しません。目的は、forward fix が現れた際に実際の manifest dependency contract に沿った package availability を確認し、明示的な更新PRで互換性検証へ進める状態かを誤判定しないことです。

# Compatible Prisma remediation package-set evidence

Issue #3114 の `smkc-score-app/scripts/security-audit-upstream.js` は、現在の `package.json` にある Prisma selector の範囲内で `@prisma/config -> deepmerge-ts` が修正された stable release が公開されたかを canonical npm registry から確認します。

安全な `prisma` CLI release が見つかっただけでは、JSMKC でその version へ実際に更新できるとは限りません。JSMKC は runtime client と Cloudflare D1 driver adapter も利用しているため、probe は remediation が見つかった場合に runtime package も現在の manifest selector から解決できることを確認します。

現在の JSMKC は `prisma` / `@prisma/client` が `^6.19.3`、`@prisma/adapter-d1` が `^7.8.0` です。このため D1 adapter を CLI candidate と同じ exact version に強制する判定は、実際の dependency contract と一致しません。current-compatible probe では次のように扱います。

- `@prisma/client`: manifest selector が返す stable version 群に remediation candidate と同じ version が含まれることを要求する。selector 内に candidate より新しい client が追加公開されていても、candidate 自体が存在する限り ready と判定する。
- `@prisma/adapter-d1`: manifest に宣言された selector から stable version を解決できることを要求する。CLI candidate と exact version が一致することは要求しない。

Prisma 7 への major migration readiness は別 probe で package major/version alignment を検証しており、この current-compatible 判定を major migration の互換性証明には使いません。

## 出力

compatible upstream probe は従来の `state` と dependency edge に加えて、次の evidence を stdout と GitHub Actions output に出します。

- `published_remediation_candidate`
- `published_remediation_package_set_state`
- `published_remediation_prisma_client_selector`
- `published_remediation_prisma_client_version`
- `published_remediation_adapter_d1_selector`
- `published_remediation_adapter_d1_version`

runtime package の selector と canonical registry から解決した最新 stable version を対で残します。これにより、後から `package.json` の selector が変化した場合でも、「どの manifest contract に対してその version を compatible evidence と判断したか」をログと Actions output から再現できます。`@prisma/client` の出力 version は selector 内の最新 stable version なので、remediation candidate より新しい version が同じ selector 内に存在する場合は candidate と一致しないことがあります。ready 判定は最新 version との一致ではなく、candidate version 自体が selector の取得結果に含まれるかで行います。runtime package probe を行わない `not-applicable` 状態では selector/version とも `none` です。

`published_remediation_candidate` は、`@prisma/config` の `deepmerge-ts` requirement が修正済みで、manifest-compatible な `@prisma/client` version 群に同じ remediation candidate version が公開され、かつ manifest-compatible な `@prisma/adapter-d1` stable release を canonical registry で確認できた場合だけ Prisma version を返します。それ以外は `none` です。

package-set state は次の意味です。

- `not-applicable`: compatible Prisma release がまだ vulnerable なので runtime package probe 自体を行わない。
- `ready`: manifest-compatible client version 群に remediation candidate が含まれ、D1 adapter も現在の manifest selector から解決できる。
- `unavailable`: runtime package の少なくとも1つを registry から確認できなかった。確認開始済みの selector は evidence として保持する。
- `incomplete`: registry response は得られたが manifest-compatible client version 群に remediation candidate version が含まれない。

## Review workflow の gate

`Security audit review` の Job Summary は current-compatible probe の package-set evidence も表示します。runtime package は selector と解決された最新 stable version を同じ表に並べ、`@prisma/client` の version を「candidate」と誤表示しません。candidate より新しい client が同じ selector 内に公開されていても、どの manifest contract に対する evidence かを Job Summary 単体で判別できます。

`compatible-forward-remediation-available` だけを見て「今すぐ依存更新できる」と扱わず、`published_remediation_candidate` と package-set state を併せて判断します。

- `ready` かつ candidate が存在する場合: 明示的な dependency update PR で lockfile 更新、unit tests、Prisma/D1 parity、Cloudflare build を検証する必要があるため、gate は fail-closed で停止する。
- `incomplete` かつ candidate が `none` の場合: CLI/config 側の forward fix は見えているが manifest-compatible runtime client の取得結果に同じ candidate がまだ含まれないため、#3114 を維持したまま review workflow 自体は成功させる。gate の diagnostic には `@prisma/client` / `@prisma/adapter-d1` の manifest selector と観測した最新 stable version を対で表示し、D1 adapter の major が CLI candidate と一致しないこと自体を blocker と誤認しないようにする。
- `unavailable` や state/output の不整合: registry evidence を確認できないため fail-closed とし、手動確認を要求する。この diagnostic にも取得済みの selector/version pair を含め、どの registry query の evidence が欠けたか追跡できるようにする。

この evidence と gate は dependency を変更しません。目的は、forward fix が現れた際に実際の manifest dependency contract に沿った package availability を確認し、明示的な更新PRで互換性検証へ進める状態かを誤判定しないことです。

# Compatible Prisma package-set reason evidence

Issue #3114 の current-compatible remediation probe は、package-set の大分類 (`state`) に加えて、観測結果の原因を機械可読な `reason` として残します。

これは dependency update の可否判定を変更するものではありません。既存の `not-applicable` / `ready` / `unavailable` / `incomplete` の state と fail-closed gate はそのまま維持し、同じ `unavailable` でもどの registry query で証拠が欠けたのかをログや GitHub Actions output から直接判別できるようにするための監査情報です。

現在の reason は次のとおりです。

- `upstream-remediation-not-applicable`: current-compatible Prisma CLI/config 側に remediation がまだないため runtime package probe を実行していない。
- `prisma-client-registry-unavailable`: manifest の `@prisma/client` selector に対する canonical npm registry evidence を取得・検証できなかった。
- `adapter-d1-registry-unavailable`: remediation candidate を含む client evidence は取得できたが、manifest の `@prisma/adapter-d1` selector に対する canonical npm registry evidence を取得・検証できなかった。
- `prisma-client-candidate-missing`: manifest-compatible `@prisma/client` version 群に Prisma CLI/config remediation candidate と同じ version が含まれていない。この時点で package set は actionable ではないため、D1 adapter の追加 registry query は実行せず `incomplete` を確定する。
- `published-package-set-ready`: manifest-compatible client version 群に remediation candidate が存在し、D1 adapter も現在の selector から stable release を確認できた。

client candidate が欠けている場合に adapter lookup を短絡することで、より根本的な `prisma-client-candidate-missing` が後続の一時的な adapter registry failure に上書きされることを防ぎます。同時に、actionable でない package set に対する不要なネットワーク query を1回減らします。この経路では adapter selector は監査 evidence として保持しますが、解決済み adapter version は `none` / `null` のままです。

probe の通常出力には `published remediation package set reason`、GitHub Actions output には `published_remediation_package_set_reason` を追加します。selector、解決済みversion、state と reason を組み合わせることで、registry 障害と publication skew を区別できます。

手動 `Security audit review` の Job Summary でも、current-compatible / next-major の package-set reason を専用の診断表に残します。next-major については runtime package の selector も併記し、保存された summary だけから「どの manifest-compatible package set を照会した結果か」を追跡できます。これは監査証拠の表示追加だけで、compatible-range gate の入力や成功・失敗条件は変更しません。

この reason は監査・診断用であり、依存version、lockfile、Prisma schema/config、D1 binding、Cloudflare deployment、#3114 の暫定 audit exception を変更しません。remediation candidate が actionable かどうかは引き続き `published_remediation_candidate` と package-set `state` を既存 gate で評価します。

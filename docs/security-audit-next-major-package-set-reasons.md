# Next-major Prisma package-set reason evidence

Issue #3114 の next-major Prisma remediation probe (`smkc-score-app/scripts/security-audit-next-major.js`) は、package-set の大分類 (`state`) に加えて、観測結果の原因を機械可読な `reason` として残します。

この catalog は advisory evidence の説明用です。next-major probe は Prisma major upgrade や暫定 audit 例外削除を自動承認せず、`compatible_upstream_gate` の入力にもなりません。dependency version、lockfile、Prisma/D1 runtime、Cloudflare deployment の挙動も変更しません。

現在の reason は次のとおりです。

- `upstream-remediation-not-applicable`: next-major Prisma CLI/config 側に remediation がまだないため runtime package probe を実行していない。
- `prisma-client-registry-unavailable`: remediation candidate と同じ exact version の `@prisma/client` を canonical npm registry から取得できなかった。
- `prisma-client-evidence-invalid`: `@prisma/client` lookup 自体は成功したが、返された version metadata を stable SemVer evidence として検証できなかった。
- `adapter-d1-registry-unavailable`: candidate と一致する client evidence は取得できたが、同じ exact version の `@prisma/adapter-d1` を canonical npm registry から取得できなかった。
- `adapter-d1-evidence-invalid`: `@prisma/adapter-d1` lookup 自体は成功したが、返された version metadata を stable SemVer evidence として検証できなかった。
- `runtime-package-version-mismatch`: registry evidence は妥当だが、解決された client または D1 adapter version が remediation candidate の exact version と一致しない。
- `published-package-set-ready`: Prisma CLI/config の remediation candidate と同じ stable version の `@prisma/client` / `@prisma/adapter-d1` が揃い、移行 package set の公開を確認できた。

registry lookup failure と invalid evidence は別の reason です。前者は通信・registry 側の一時障害として再試行できる一方、後者は lookup が返した metadata 自体を監査証拠として採用できない状態です。どちらも `published_remediation_candidate` を actionable にせず、fail-closed な advisory evidence として扱います。

client が candidate exact version と一致しない場合は D1 adapter lookup を短絡します。より根本的な `runtime-package-version-mismatch` が後続の一時的な adapter registry failure に上書きされることを防ぎ、非actionableな package set に対する不要な registry query も避けます。

この一覧は contract test により `inspectPublishedRemediationPackageSet` が返し得る reason と完全一致することを検証します。実装で reason を追加・削除するときは、この文書も同じ変更で更新してください。

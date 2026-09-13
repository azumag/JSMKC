# Security audit exception identity contract

Issue #3114 の期限付き audit 例外では、blocking 判定を行う `smkc-score-app/scripts/security-audit.js` と、手動レビュー・GitHub Actions summary 用の証拠を生成する `security-audit-status.js` が同じ GHSA advisory ID と affected range を指している必要があります。

この2つが別々に更新されると、CI が実際に許容している advisory と Job summary / step output が示す advisory が食い違い、保存された監査証拠を誤読する可能性があります。そのため `smkc-score-app/__tests__/scripts/security-audit-identity-alignment.test.ts` は、blocking helper の `ALLOWED_ADVISORY` / `ALLOWED_ADVISORY_RANGE` と status helper の `TRACKED_ADVISORY` / `TRACKED_ADVISORY_RANGE` が現在レビュー済みの同じ値を指すことを repository source に対して検証します。

advisory ID や affected range を変更する場合は、この contract test も同じ PR で意図的に更新する必要があります。これにより、blocking 判定だけ、または status evidence だけを片側更新してしまう drift を通常の unit test で検出できます。

この guard は advisory の識別情報が監査 helper と status evidence の間で一致していることだけを保証します。Prisma / `@prisma/config` / `deepmerge-ts` の version、lockfile artifact、例外期限、upstream remediation の安全性、または #3114 の例外を削除してよいかどうかは変更・判断しません。forward remediation を採用する場合は従来どおり canonical audit、unit tests、lint、format、Prisma/D1 parity、Cloudflare build を確認してから例外削除を判断します。

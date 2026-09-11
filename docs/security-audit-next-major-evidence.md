# #3114 next-major Prisma remediation evidence

Issue #3114 の既存 `security-audit-upstream.js` は、`package.json` の現在の `devDependencies.prisma` selector の範囲内だけを調べる read-only probe です。これは「互換範囲内の安全な forward release が出たら例外を外す」という判断には適していますが、修正が次の major にだけ入った場合、その事実は `compatible-release-still-vulnerable` という結果だけでは見えません。

2026-09-01 に Prisma upstream の PR [prisma/orm#30189](https://github.com/prisma/orm/pull/30189) が `v7` branch へ merge され、`@prisma/config` の `deepmerge-ts` を 7.1.5 から 8.0.2 へ更新しました。2026-09-09 には tracking issue [prisma/orm#30052](https://github.com/prisma/orm/issues/30052) に、この PR で解消されたというコメントも付いています。一方、JSMKC の current manifest は Prisma `^6.19.3` を要求しているため、既存 compatible probe が v7 を自動候補にしないのは意図した挙動です。Prisma 6 → 7 は major upgrade であり、#3114 の監査例外を消すためだけに自動適用してはいけません。

重要なのは、upstream branch への merge と npm registry に公開済みの stable remediation を区別することです。2026-09-11 時点の Prisma 7 latest stable は 7.10.0 で、これは 2026-09-01 の #30189 merge より前に公開されています。したがって branch 上では修正済みでも、installable な stable release が同じ dependency edge を解消していると確認できるまでは #3114 の削除条件を満たしません。

そこで手動 `Security audit review` に補助的な `security-audit-next-major.js` probe を追加します。この probe は current Prisma selector が caret SemVer range の場合だけ current major + 1 の `^<major+1>.0.0` を導出し、既存 upstream probe と同じ canonical npm registry、stable-only selection、Prisma → `@prisma/config` → `deepmerge-ts` dependency-edge 検証を再利用します。現在の `^6.19.3` なら `^7.0.0` を観測対象にします。

この next-major probe は **advisory evidence only** です。失敗しても current compatible-range gate の意味を変えないよう workflow step は `continue-on-error: true` とし、結果・selector・dependency edge・観測時刻だけを Job summary に残します。`compatible_upstream_gate` は従来どおり current manifest range の probe だけを判定し、next-major の結果を自動 upgrade / exception removal の成功条件には使いません。

probe は `published remediation candidate` も出力します。canonical npm registry 上の latest stable next-major が `deepmerge-ts` の patched requirement を持つ場合だけ、その Prisma version を候補として表示し、まだ vulnerable な場合は `none` を表示します。GitHub Actions output にも `published_remediation_candidate=<version|none>` を出すため、reviewer は upstream branch merge を installable release と取り違えずに判断できます。

next-major probe が `compatible-forward-remediation-available` を返した場合でも、行うべきことは Prisma major migration の明示的な検討です。`prisma` / `@prisma/client` / adapters の version alignment、schema/generate/migrate、Prisma/D1 parity、unit tests、lint/format、canonical audit、Cloudflare build と実運用互換性を別PRで確認してから #3114 の削除可否を判断します。consumer-side `deepmerge-ts` major override や Prisma major upgradeを、この probe や review workflow が自動で実行することはありません。

current selector が caret range でなくなった場合、next-major selector の意味が曖昧になるため probe は fail-closed で停止します。その場合も current compatible probe と canonical audit は独立して動作し、next-major の補助証拠だけが unavailable になります。

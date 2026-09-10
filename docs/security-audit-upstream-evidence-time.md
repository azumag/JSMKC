# Compatible upstream evidence timestamp

Issue #3114 の手動 `Security audit review` は、canonical npm registry を照会して現在の Prisma manifest range 内に安全な forward remediation candidate が現れたかを確認します。この registry evidence は repository revision だけでは完全には再現できません。registry metadata は同じ commit を再実行しても後日変化し得るためです。

そこで workflow は `security-audit-upstream.js` の registry probe が終了した直後に UTC timestamp を取得し、Job summary に `Compatible upstream checked at` として保存します。timestamp step は `if: always()` で実行するため、probe 自体が失敗した場合でも「どの時点の upstream 確認だったか」を summary と一緒に残せます。

この timestamp は dependency update、例外期限の延長、例外削除を自動化するためのものではありません。`Review ref` / `Review commit` が repository 側の provenance を示し、`Compatible upstream checked at` が mutable な registry evidence の観測時点を示します。remediation candidate が検出された場合は従来どおり fail-closed とし、明示的な dependency update PR で lockfile、canonical audit、unit tests、lint、format、Prisma/D1 parity、Cloudflare build を確認してから #3114 の例外削除可否を判断します。

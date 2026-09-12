# Security audit status GitHub Actions output safety

Issue #3114 の `security:audit:status` は、監査状態を `GITHUB_OUTPUT` に key/value 形式で公開します。

`security-audit-status.js` は通常、repository 内の固定値・検証済み lockfile metadata・ISO timestamp だけを出力しますが、出力 writer 自体はテストや将来の workflow 変更から直接利用できます。そのため、改行を含む値や異常に長い値が writer に渡された場合でも GitHub Actions の追加 output 行として解釈されないよう、書き込み直前に全 output value を検証します。

現在の contract は次のとおりです。

- 全 output value は printable ASCII のみを許可する。
- 1 value は 1〜200 文字に制限する。
- 改行、tab、制御文字、空文字、過大な値は fail-closed で拒否する。
- 1項目でも不正なら `GITHUB_OUTPUT` への書き込み自体を開始しない。
- `active` 状態で `reason` を省略する既存 contract は維持する。

この hardening は #3114 の temporary exception 判定、dependency version、lockfile、Prisma/D1 runtime、Cloudflare deployment の挙動を変更しません。監査結果を GitHub Actions へ渡す境界だけを防御し、将来 status field の生成元が増えた場合にも output injection を起こしにくくします。

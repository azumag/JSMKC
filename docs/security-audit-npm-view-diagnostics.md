# Security audit npm view diagnostic safety

Issue #3114 の current-compatible / next-major Prisma remediation probe は、canonical npm registry の package metadata を `smkc-score-app/scripts/security-audit-upstream.js` の `runNpmView()` で取得します。

成功時の JSON evidence、selector policy、package-set 判定、および `compatible_upstream_gate` の意味は変更しません。一方、registry / transport / npm 自体の失敗診断や、成功レスポンスが invalid JSON だった場合の parser 診断は外部入力に由来する文字列なので、CI log へ出す前に安全な単一行へ正規化します。

診断文字列には次の境界を適用します。

- C0 control characters (`U+0000`〜`U+001F`) と DEL (`U+007F`) は `\\n`、`\\r`、`\\t`、`\\xNN` のような可視表現へ escape する。
- JavaScript の line separator / paragraph separator (`U+2028` / `U+2029`) も可視な `\\u2028` / `\\u2029` として残す。
- Unicode bidi formatting controls (`U+202A`〜`U+202E`) と bidi isolate controls (`U+2066`〜`U+2069`) は `\\uXXXX` へ escape し、外部診断が CI log の表示順を見かけ上入れ替えることを防ぐ。通常の日本語などの Unicode 文字はそのまま保持する。
- `spawnSync` 自体の `error.message`、non-zero exit 時の `stderr`、`JSON.parse()` が返す parser error message のすべてへ同じ処理を適用する。
- 可視化後の診断本文は 500 characters を上限とし、超過分は `...` で切り詰める。
- selector / field をエラー文の label に使う場合も同じ single-line 化を通す。
- invalid JSON の raw stdout 自体は診断へ埋め込まず、sanitized parser message だけを公開する。

これにより、改行による複数行化、ANSI escape による端末表示の汚染、Unicode bidi control による表示順の偽装、workflow-command 風の文字列が独立したログ行として見えること、巨大な npm error body や parser input snippet による監査ログの肥大化を防ぎつつ、原因調査に必要な診断内容は可視文字列として保持します。

この変更は失敗時のログ表現だけを対象にします。dependency version、lockfile、Prisma schema/runtime、D1 / Cloudflare binding、registry の選択、remediation candidate の判定、#3114 の temporary audit exception の条件・期限は変更しません。

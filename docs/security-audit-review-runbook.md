# #3114 security audit review runbook

`Security audit review` は、Prisma → `@prisma/config` → `deepmerge-ts` の期限付き audit 例外を再評価するための手動 GitHub Actions workflow です。定期実行や repository の変更は行わず、`contents: read` のみで監査証拠を収集します。

## 実行結果の読み方

workflow は `smkc-score-app/` で次の順序を実行します。

1. `security-audit-lockfile.js` — package manifest / lockfile の前提条件を検証する。
2. `security-audit-status.js` — #3114 の一時例外が `active` / `expired` / `context-changed` / `invalid-input` のどれかを判定し、lockfile 上の `prisma` / `@prisma/config` / `deepmerge-ts` の実インストールバージョンを監査証拠として出力する。
3. `security-audit.js` — lockfile preflight が成功していれば canonical npm registry に対する audit を実行する。status が非 active でも、再評価用の証拠を残すためこの audit は続行する。

Job summary には各 check の outcome に加えて、一時例外の具体的な `state`、review deadline、追跡対象3依存の実インストールバージョンを表示します。`security-audit-status.js` は GitHub Actions 上では `state`、`deadline`、`prisma_version`、`prisma_config_version`、`deepmerge_ts_version` を step output として公開しますが、例外の内容や期限そのものを書き換えることはありません。

依存バージョンは「forward fix が入ったか」を判断するための証拠であり、それだけで脆弱性解消とは判定しません。たとえば `deepmerge-ts` が 8.x に変わって `context-changed` になった場合でも、canonical audit と通常CIを通してから例外削除を判断します。

## 判断ルール

`active` は「現在固定している例外文脈がまだ一致し、期限前である」ことだけを意味します。脆弱性が安全であることや upstream 修正が不要であることは意味しません。

`expired` / `context-changed` / `invalid-input` は非0終了のまま扱います。特に `context-changed` を forward fix 完了とはみなさず、canonical audit、CI、Prisma/D1 parity、Cloudflare build まで確認してから #3114 の例外削除可否を判断します。

期限の延長、consumer-side major override / downgrade、例外削除は workflow から自動実行しません。必要な場合は #3114 に根拠を記録して明示的にレビューします。

# #3114 security audit review runbook

`Security audit review` は、Prisma → `@prisma/config` → `deepmerge-ts` の期限付き audit 例外を再評価するための手動 GitHub Actions workflow です。定期実行や repository の変更は行わず、`contents: read` のみで監査証拠を収集します。

## 実行結果の読み方

workflow は `smkc-score-app/` で次の順序を実行します。

1. `security-audit-lockfile.js` — package manifest / lockfile の前提条件を検証する。
2. `security-audit-status.js` — #3114 の一時例外が `active` / `expired` / `context-changed` / `invalid-input` / `forward-remediation-candidate` のどれかを判定し、追跡 issue、GHSA advisory と影響range、lockfile 上の `prisma` / `@prisma/config` / `deepmerge-ts` の実インストールバージョン、および `@prisma/config` が宣言している `deepmerge-ts` requirement を監査証拠として出力する。
3. `security-audit.js` — lockfile preflight が成功していれば canonical npm registry に対する audit を実行する。status が非 active でも、再評価用の証拠を残すためこの audit は続行する。

Job summary には各 check の outcome に加えて、追跡 issue、GHSA advisory と影響range、一時例外の具体的な `state`、status を評価したUTC時刻、review deadline、期限までの残日数、追跡対象3依存の実インストールバージョン、`@prisma/config → deepmerge-ts` の宣言 requirement を表示します。`security-audit-status.js` は GitHub Actions 上では `state`、`tracking_issue`、`advisory`、`advisory_range`、`checked_at`、`deadline`、`days_until_deadline`、`prisma_version`、`prisma_config_version`、`prisma_config_deepmerge_requirement`、`deepmerge_ts_version` を step output として公開します。`tracking_issue` / `advisory` / `advisory_range` を status 自体に含めることで、保存した Job summary や step output を後から見たときにも「どの例外についての証拠か」を周辺ログへ依存せず判別できます。`checked_at` は status 判定に使った時刻そのものをISO 8601 UTC形式で残すため、後から保存された Job summary だけを見ても相対的な残日数を再解釈できます。`days_until_deadline` は期限前を正数、期限当日を `0`、期限超過後を負数で表します。workflow は例外の内容や期限そのものを書き換えません。

ローカルや補助スクリプトから同じ証拠を機械的に取得する場合は、`smkc-score-app/` で `node scripts/security-audit-status.js --json` を実行できます。標準出力には `trackingIssue` / `advisory` / `advisoryRange` / `state` / `checkedAt` / `deadline` / `daysUntilDeadline` / `versions` / `requirements` / `message` を含む単一のJSONオブジェクトだけを出力し、終了コードは通常形式と同じく `active` のときだけ0です。CLI option は `--json` だけを受理し、スペルミスや未定義 option は人間向け出力へ黙ってフォールバックせず非0終了します。これにより自動化側の呼び出しミスを成功扱いせず、文字列ログを解析せずに例外の識別子、期限、依存バージョンと dependency edge を取得できます。

実インストールバージョンと dependency requirement は組で確認します。たとえば consumer-side override により `deepmerge-ts` の実インストールだけが 8.x へ変わっても、`@prisma/config` 側の requirement が 7.1.5 のままなら upstream forward fix とはみなしません。逆に実インストールと `@prisma/config` の requirement の両方が patched line（8.0.0以上）へ移った場合だけ `forward-remediation-candidate` となります。それでも自動で例外を削除せず、canonical audit と通常CIを通してから判断します。

## 判断ルール

`active` は「現在固定している例外文脈がまだ一致し、期限前である」ことだけを意味します。脆弱性が安全であることや upstream 修正が不要であることは意味しません。

`expired` / `context-changed` / `invalid-input` / `forward-remediation-candidate` は非0終了のまま扱います。特に `context-changed` や `forward-remediation-candidate` を forward fix 完了とはみなさず、canonical audit、CI、Prisma/D1 parity、Cloudflare build まで確認してから #3114 の例外削除可否を判断します。

期限の延長、consumer-side major override / downgrade、例外削除は workflow から自動実行しません。必要な場合は #3114 に根拠を記録して明示的にレビューします。

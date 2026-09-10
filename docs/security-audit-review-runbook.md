# #3114 security audit review runbook

`Security audit review` は、Prisma → `@prisma/config` → `deepmerge-ts` の期限付き audit 例外を再評価するための手動 GitHub Actions workflow です。定期実行や repository の変更は行わず、`contents: read` のみで監査証拠を収集します。手動レビューがネットワーク停止などで長時間ぶら下がらないよう、job 全体には30分の実行上限を設定しています。

この workflow では `npm ci` は実行しません。lockfile/status/upstream の各 probe は repository 内の Node.js script と `package.json` / `package-lock.json` だけで動作し、canonical audit も検証済み manifest/lockfile snapshot に対する `npm audit --package-lock-only`、upstream probe も pinned npm CLI の `npm view` だけを使うため、`node_modules` は不要です。依存ツリーをインストールしないことで、監査だけの workflow で `postinstall` / `prepare` などの dependency lifecycle script を実行せず、不要な dependency download と npm cache restore も避けます。npm CLI 自体は `packageManager` と同じ version に pin してから監査します。

## 実行結果の読み方

workflow は `smkc-score-app/` で次の順序を実行します。

1. `security-audit-lockfile.js` — package manifest / lockfile の前提条件を検証する。
2. `security-audit-status.js` — #3114 の一時例外が `active` / `expired` / `context-changed` / `invalid-input` / `forward-remediation-candidate` のどれかを判定し、追跡 issue、GHSA advisory と影響range、lockfile 上の `prisma` / `@prisma/config` / `deepmerge-ts` の実インストールバージョン、および `@prisma/config` が宣言している `deepmerge-ts` requirement を監査証拠として出力する。
3. `security-audit.js` — lockfile preflight が成功していれば canonical npm registry に対する audit を実行する。status が非 active でも、再評価用の証拠を残すためこの audit は続行する。
4. `security-audit-upstream.js` — `package.json` の現在の Prisma version selector をそのまま使って canonical npm registry を照会し、その selector の範囲内で入手できる最新の stable Prisma を選ぶ。次に、その Prisma package metadata が実際に宣言している `@prisma/config` selector をたどり、その範囲内の最新 stable `@prisma/config` と `@prisma/config → deepmerge-ts` dependency edge を確認する。依存を変更せず、同一 Prisma version range 内に安全な forward release が配布されたかだけを観測する。
5. `compatible upstream gate` — summary を必ず残した後で probe outcome/state を判定する。probe が失敗した場合、`compatible-forward-remediation-available` が観測された場合、または未知の state の場合は非0終了し、#3114 をそのまま維持してよいという成功シグナルを出さない。`compatible-release-still-vulnerable` の場合だけこの gate 自体は成功する。

Job summary には各 check の outcome に加えて、追跡 issue、GHSA advisory と影響range、一時例外の具体的な `state`、status を評価したUTC時刻、review deadline、期限までの残日数、追跡対象3依存の実インストールバージョン、`@prisma/config → deepmerge-ts` の宣言 requirement を表示します。さらに compatible upstream probe の state、照会 registry、manifest 上の Prisma selector、最新 compatible Prisma version、その Prisma が宣言する `@prisma/config` selector、最新 compatible `@prisma/config` version、その version の `@prisma/config → deepmerge-ts` requirement も表示します。`security-audit-status.js` は GitHub Actions 上では `state`、`tracking_issue`、`advisory`、`advisory_range`、`checked_at`、`deadline`、`days_until_deadline`、`prisma_version`、`prisma_config_version`、`prisma_config_deepmerge_requirement`、`deepmerge_ts_version` を step output として公開します。`security-audit-upstream.js` は `state`、`registry`、`prisma_selector`、`latest_compatible_prisma_version`、`prisma_config_selector`、`latest_compatible_prisma_config_version`、`prisma_config_deepmerge_requirement` を公開します。compatible `@prisma/config` から `deepmerge-ts` dependency edge 自体が削除された場合、Actions output と人間向け表示では requirement を `absent` と明示します。

`tracking_issue` / `advisory` / `advisory_range` を status 自体に含めることで、保存した Job summary や step output を後から見たときにも「どの例外についての証拠か」を周辺ログへ依存せず判別できます。`checked_at` は status 判定に使った時刻そのものをISO 8601 UTC形式で残すため、後から保存された Job summary だけを見ても相対的な残日数を再解釈できます。`days_until_deadline` は期限前を正数、期限当日を `0`、期限超過後を負数で表します。workflow は例外の内容や期限そのものを書き換えません。

ローカルや補助スクリプトから現在の例外文脈を機械的に取得する場合は、`smkc-score-app/` で `node scripts/security-audit-status.js --json` を実行できます。標準出力には `trackingIssue` / `advisory` / `advisoryRange` / `state` / `checkedAt` / `deadline` / `daysUntilDeadline` / `versions` / `requirements` / `message` を含む単一のJSONオブジェクトだけを出力し、終了コードは通常形式と同じく `active` のときだけ0です。CLI option は `--json` だけを受理し、スペルミスや未定義 option は人間向け出力へ黙ってフォールバックせず非0終了します。これにより自動化側の呼び出しミスを成功扱いせず、文字列ログを解析せずに例外の識別子、期限、依存バージョンと dependency edge を取得できます。

compatible upstream evidence も、`smkc-score-app/` で `node scripts/security-audit-upstream.js --json` を実行すると機械的に取得できます。標準出力は `state` / `registry` / `prismaSelector` / `latestCompatiblePrismaVersion` / `prismaConfigSelector` / `latestCompatiblePrismaConfigVersion` / `prismaConfigDeepmergeRequirement` を含む単一のJSONオブジェクトだけになります。`deepmerge-ts` edge が削除された場合、JSON の `prismaConfigDeepmergeRequirement` は `null` です。CLI option は `--json` だけを受理し、未知の option は非0終了します。通常の人間向け出力と GitHub Actions step output の形式は維持し、補助自動化が表示文言を解析せずに upstream remediation evidence を扱えるようにします。

compatible upstream probe は canonical npm registry に対する read-only `npm view` だけを使用します。現在の `devDependencies.prisma` selector に合致する version 群から prerelease を除外した最新 stable Prisma を選び、その exact Prisma package の `dependencies` metadata から `@prisma/config` selector を取得します。その selector に合致する `@prisma/config` version 群からも prerelease を除外し、最新 stable version の `dependencies` metadata 全体から `deepmerge-ts` edge を確認します。`@prisma/config` が Prisma と同じ version だとは仮定しません。Prisma metadata に安全な `@prisma/config` selector が無い場合、どちらかの selector で stable version が1件も得られない場合、または `@prisma/config` の dependencies metadata が不正な場合は候補を推測せず非0終了します。各 `npm view` は60秒で打ち切り、registry応答が停止・遅延した場合も候補を推測せず非0終了します。`deepmerge-ts` requirement が patched line（8.0.0以上）、または `deepmerge-ts` dependency edge 自体が削除されていれば `compatible-forward-remediation-available`、まだ vulnerable line なら `compatible-release-still-vulnerable` と報告します。前者は「現在の manifest selector の範囲内に再評価候補となる stable release が現れた」ことだけを意味し、依存更新や一時例外削除を自動実行しません。

実インストールバージョンと dependency requirement は組で確認します。たとえば consumer-side override により `deepmerge-ts` の実インストールだけが 8.x へ変わっても、`@prisma/config` 側の requirement が 7.1.5 のままなら upstream forward fix とはみなしません。逆に実インストールと `@prisma/config` の requirement の両方が patched line（8.0.0以上）へ移った場合だけ `forward-remediation-candidate` となります。それでも自動で例外を削除せず、canonical audit と通常CIを通してから判断します。

## 判断ルール

`active` は「現在固定している例外文脈がまだ一致し、期限前である」ことだけを意味します。脆弱性が安全であることや upstream 修正が不要であることは意味しません。

`expired` / `context-changed` / `invalid-input` / `forward-remediation-candidate` は非0終了のまま扱います。特に `context-changed` や `forward-remediation-candidate` を forward fix 完了とはみなさず、canonical audit、CI、Prisma/D1 parity、Cloudflare build まで確認してから #3114 の例外削除可否を判断します。

`compatible-forward-remediation-available` が出た場合も、自動更新は行いません。manifest selector 内で新しい stable candidate が観測されたという判断材料として扱い、candidate Prisma と、その package が実際に要求する compatible `@prisma/config` version へ明示的に依存更新したPRで lockfile、status、canonical audit、unit tests、lint、format、Prisma/D1 parity、Cloudflare build を確認します。`deepmerge-ts` edge が削除された候補も同様に、実際の lockfile と canonical audit で advisory が依存ツリーから消えることを確認してから例外削除を判断します。review workflow の `compatible upstream gate` はこの状態を成功扱いせず非0終了するため、stable remediation candidate を観測したのに手動reviewを成功のまま見過ごすことを防ぎます。`compatible-release-still-vulnerable` の場合は、現在の selector の範囲内には #3114 を解消する stable upstream package chain がまだ配布されていません。

期限の延長、consumer-side major override / downgrade、例外削除は workflow から自動実行しません。必要な場合は #3114 に根拠を記録して明示的にレビューします。

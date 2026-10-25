# Security audit policy

JSMKC の CI は、`smkc-score-app/` を作業ディレクトリとして `node scripts/security-audit-lockfile.js` で lockfile schema を事前検証した後、`node scripts/security-audit.js` を実行する。npm dependency audit の high / critical finding は例外なく blocking として扱う。

`security-audit.js` は `npm audit` を起動する前に packageManager の exact pin と実 npm runtime version を自分で検証するため、直接実行でも runtime guard を迂回できない。lockfile schema preflight も helper 内で再実行する。

## Fail-closed の原則

`scripts/security-audit.js` は `npm audit --json` を読み取り、high / critical finding が無い場合だけ成功する。許可リスト（既知 advisory の除外）は持たない。#3114 の一時例外は依存更新により解消され、対応する allowlist・期限・状態診断は撤去済み。新たに例外が必要になった場合は、本ポリシーとテストを更新する別 PR で扱う。

以下のいずれかが起きた場合は CI を失敗させる。

- high / critical の advisory が 1 件でも存在する
- `npm audit --json` の top-level に `error` field が現れる（値の truthiness は問わない）
- `auditReportVersion` が欠落する、または現在検証済みの `2` と一致しない
- 成功レポートの top-level に `auditReportVersion` / `vulnerabilities` / `metadata` 以外の未知 field が現れる
- `metadata` が存在するのに non-array object ではない、または未知の metadata field が現れる
- CI entrypoint で `metadata.vulnerabilities`（info / low / moderate / high / critical / `total`）または `metadata.dependencies`（prod / dev / optional / peer / peerOptional / total）の必須 key が欠落する
- summary の severity 件数と `vulnerabilities` graph の件数が矛盾する、または `total` と graph entry 総数が一致しない
- dependency `total` と `package-lock.json` の installed package entry 数が一致しない
- `vulnerabilities` が object map でない、entry が object でない、未知の severity または未知の field が現れる
- entry の `name` が top-level package key と矛盾する
- `via` / `effects` / `nodes` / `isDirect` / `range` / `fixAvailable` / direct advisory object の型・field set が既知 schema と異なる
- `package.json` と `package-lock.json` の root snapshot（`name` / `version` / dependency maps）が一致しない
- `package.json` の dependency map が object でない、または `package-lock.json` の `packages` map / root snapshot が v3 object schema を満たさない
- `npm config get registry` が失敗する、audit registry が canonical `https://registry.npmjs.org/` 以外へ変わる、または audit subprocess の `--registry=https://registry.npmjs.org/` pin が欠落・変更される
- `npm audit` が起動失敗・signal 終了・`0` / `1` 以外の終了コードになる、または JSON を取得・解析できない
- 終了コードと summary / graph の内容が矛盾する

## 監査の入力と実行

- `package.json` / `package-lock.json` は helper が 1 回だけ読み、その snapshot を runtime pin 検証・lockfile 検証・audit 実行の全てで共有する。
- `npm audit` は検証済み source だけを隔離した一時ディレクトリにコピーして実行し、canonical registry を CLI 引数でも固定する（preflight と実行の間の TOCTOU を避けるため）。
- `npm audit` の終了コードは `0` / `1` だけを監査結果として許容する。

## CI の実行順

通常の lint / formatting / unit test を先に実行し、その後に lockfile schema preflight と security audit を実行する。機能回帰テストの結果を audit より先に観測できるようにするためである。lockfile preflight と security audit 自体は blocking のままとし、schema drift や high / critical finding を許容しない。

## TC-2460 の安定契約

`E2E_TEST_CASES.md` の TC-2460 は、特定の `npm audit` コマンド文字列ではなく、「CI が `node scripts/security-audit.js` を入口として high / critical finding を blocking に扱う」という振る舞いを記述する。

## 回帰テスト

- `smkc-score-app/__tests__/docs/ci-config.test.ts`: CI が `npm test -- --ci --forceExit` を security audit より前に実行し、lockfile preflight の後に `node scripts/security-audit.js` を呼ぶことを静的に検証する。
- `smkc-score-app/__tests__/scripts/security-audit-evaluate.test.ts`: high / critical の blocking、non-blocking severity の通過、summary 不一致の fail-closed を検証する。
- `smkc-score-app/__tests__/scripts/security-audit-report-shape.test.ts`: report version、summary、dependency summary、vulnerability graph の schema drift を fail-closed にする契約を固定する。
- `smkc-score-app/__tests__/scripts/security-audit-summary.test.ts`: `metadata.vulnerabilities` の件数と vulnerability graph の整合、未知 key の拒否を検証する。
- `smkc-score-app/__tests__/scripts/security-audit-error-report.test.ts`: top-level `error` field を値の truthiness に関係なく `invalid-audit-report` として拒否する。
- `smkc-score-app/__tests__/scripts/security-audit-lockfile.test.ts`: lockfile v3 schema と package identity / root dependency parity の drift を拒否し、CI が schema preflight を audit helper より先に実行することを検証する。
- `smkc-score-app/__tests__/scripts/security-audit-runtime-guard.test.ts`: pinned npm runtime、lockfile preflight、canonical registry、隔離 snapshot での `npm audit` 実行を検証する。
- `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`: E2E 台帳の TC-2460 が上記の安定契約と同期していることを検証する。

関連: #3114（依存更新により解消し、例外を撤去）

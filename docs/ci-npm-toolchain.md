# CI の npm バージョン管理

JSMKC の `lint-and-test` CI は npm を **10.9.4** に固定する。

`smkc-score-app/scripts/security-audit.js` は `npm audit --json` の report version、field、severity summary、dependency summary、exit status を fail-closed で検証している。Node.js 22 に同梱される npm をそのまま利用すると、GitHub Actions の runner / Node 配布物更新だけで npm の patch / major が変わり、アプリケーションの変更と無関係に audit の意味論や JSON 形状がドリフトする可能性がある。そのため CI では依存インストールより前に `npm@10.9.4` を明示的に導入し、実際の `npm --version` も確認する。

さらに `node scripts/security-audit.js` 自身が audit subprocess を起動する直前に npm runtime verifier を呼び、`package.json` の `packageManager` が exact `npm@x.y.z` 形式であることと、実行時の `npm --version` がその固定値と一致することを再検証する。CI の shell chain に verifier を別コマンドとして置かないため、audit helper をローカル・別CIから直接実行しても runtime guard を迂回できない。

#3114 の期限付き例外については、CI の Security audit step で `security-audit-lockfile.js` の後、ネットワークへ接続する本監査の前に `security-audit-status.js` を実行する。これにより、既知の例外文脈が期限切れ・依存更新・manifest/lockfile drift で変化した場合は、`npm audit` の結果だけで自動的に「解消」と判断せず fail-closed で停止する。status が `active` の場合だけ通常の `security-audit.js` へ進み、例外削除や期限更新は #3114 で再評価したうえで明示的に行う。

upstream の修正確認や再レビュー期限前の再評価を、アプリ変更用 PR を作らずに実行したい場合は GitHub Actions の **Security audit review** workflow を手動起動する。この workflow は `workflow_dispatch` のみで定期実行は行わず、read-only の repository permission で checkout した後、CI と同じ Node.js 22 / npm 10.9.4 / `npm ci` / lockfile preflight → temporary exception status → network-backed audit の順序を実行する。review 用 workflow では lockfile preflight が成功している限り、temporary exception status が `context-changed` / `expired` で fail-closed になっても canonical audit を続けて実行する。これにより forward update 候補が現れた回で「例外文脈は変わったが audit は clean か」を同じ run から確認できる一方、status step の失敗は保持されるため workflow 全体は green にならない。各 check の outcome は run summary に残す。結果が green でも #3114 の例外条件を自動変更・延長・削除はしないため、upstream の状態と audit 結果を確認してから明示的に判断する。

固定値の正本は `smkc-score-app/package.json` の `packageManager` と `.github/workflows/ci.yml` の Pin npm step で、`smkc-score-app/__tests__/docs/ci-config.test.ts` が両者の一致、`npm ci` より前の pin、lockfile preflight → temporary exception status → Security audit entrypoint の順序を回帰テストする。`smkc-score-app/__tests__/docs/security-audit-review-workflow.test.ts` は手動 review workflow が定期起動されないこと、read-only permission、同じ npm pin と audit 順序、status が変化しても preflight 成功時は canonical audit の証拠を取得すること、各 outcome を read-only summary に残すことを検証する。`smkc-score-app/__tests__/scripts/verify-npm-version.test.ts` は exact pin の解釈・runtime process failure・version mismatch の fail-closed 条件を検証し、`security-audit-runtime-guard.test.ts` は audit helper が `npm audit` より前に verifier を必ず呼ぶことを固定する。

## 更新手順

npm を更新するときは、単に version を上げず、候補版で `npm ci` と `node scripts/security-audit-lockfile.js && node scripts/security-audit-status.js && node scripts/security-audit.js` を実行し、runtime version guard と audit report shape / exit status の検証が引き続き成立することを確認する。必要なら security-audit helper と policy を同じ PR で更新する。

確認後、`package.json` の `packageManager` と CI の Pin npm step を同じ version に更新し、lint、format、unit tests、security audit、Cloudflare build を通す。npm の変更だけを理由に #3114 の high/critical gate や temporary exception 条件を緩めない。

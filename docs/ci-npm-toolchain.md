# CI の npm バージョン管理

JSMKC の `lint-and-test` CI は npm を **10.9.4** に固定する。

`smkc-score-app/scripts/security-audit.js` は `npm audit --json` の report version、field、severity summary、dependency summary、exit status を fail-closed で検証している。Node.js 22 に同梱される npm をそのまま利用すると、GitHub Actions の runner / Node 配布物更新だけで npm の patch / major が変わり、アプリケーションの変更と無関係に audit の意味論や JSON 形状がドリフトする可能性がある。そのため CI では依存インストールより前に `npm@10.9.4` を明示的に導入し、実際の `npm --version` も確認する。

固定値の正本は `smkc-score-app/package.json` の `packageManager` と `.github/workflows/ci.yml` の Pin npm step で、`smkc-score-app/__tests__/docs/ci-config.test.ts` が両者の一致と `npm ci` より前に pin が実行されることを回帰テストする。

## 更新手順

npm を更新するときは、単に version を上げず、候補版で `npm ci` と `node scripts/security-audit-lockfile.js && node scripts/security-audit.js` を実行し、audit report shape / exit status の検証が引き続き成立することを確認する。必要なら security-audit helper と policy を同じ PR で更新する。

確認後、`package.json` の `packageManager` と CI の Pin npm step を同じ version に更新し、lint、format、unit tests、security audit、Cloudflare build を通す。npm の変更だけを理由に #3114 の high/critical gate や temporary exception 条件を緩めない。

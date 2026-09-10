# Security audit review checkout credential boundary

Issue #3114 の手動 `Security audit review` workflow は repository を変更せず、監査証拠だけを収集します。workflow permission は `contents: read` に限定し、`actions/checkout@v5` でも `persist-credentials: false` を指定して、checkout 後の Git credential 設定へ `GITHUB_TOKEN` を残しません。

この workflow は checkout 後に `npm ci` を実行するため、dependency lifecycle script を含む後続プロセスへ不要な repository credential を保持しないことを trust boundary とします。JSMKC は public repository で、監査処理も GitHub への push や API write を必要としないため、checkout 後に credential を永続化する必要はありません。

将来 workflow に GitHub API 操作が必要になっても、`persist-credentials: true` へ戻して job 全体へ token を広げるのではなく、必要最小限の permission を持つ token を必要な step だけへ明示的に渡してください。write permission や repository mutation が必要になる変更は、#3114 の read-only review workflow とは別の仕様・安全性判断として扱います。

回帰テスト `smkc-score-app/__tests__/docs/security-audit-review-checkout-security.test.ts` は、workflow が `contents: read` を維持し、checkout credential persistence を明示的に無効化していることを固定します。

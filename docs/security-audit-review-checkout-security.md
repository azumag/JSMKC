# Security audit review action and credential boundary

Issue #3114 の手動 `Security audit review` workflow は repository を変更せず、監査証拠だけを収集します。workflow permission は `contents: read` に限定し、`actions/checkout` では `persist-credentials: false` を指定して、checkout 後の Git credential 設定へ `GITHUB_TOKEN` を残しません。

監査経路で実行される third-party GitHub Actions は mutable major tag を直接参照せず、レビューした full commit SHA に固定します。現在は `actions/checkout` と `actions/setup-node` の両方を v5 の確認済み commit に pin しています。これにより upstream の `v5` tag が将来別の commit を指しても、監査 workflow に未レビューの action code が暗黙に入ることを防ぎます。

この workflow は application dependency tree をインストールせず、checkout 後は固定 Node.js runtime、固定 npm CLI、repository 内の監査 script と registry-backed probe だけを実行します。JSMKC は public repository で、監査処理も GitHub への push や API write を必要としないため、checkout 後に credential を永続化する必要はありません。

Action の major version を更新する場合や、現在の major tag が新しい commit を指すようになり pin を更新する場合は、upstream の tag/ref が指す commit SHA を確認し、release notes と action definition の変更をレビューしてから workflow と回帰テストの SHA を同じ PR で更新します。単に `@v5` のような mutable tag へ戻して更新を自動追従させないでください。

将来 workflow に GitHub API 操作が必要になっても、`persist-credentials: true` へ戻して job 全体へ token を広げるのではなく、必要最小限の permission を持つ token を必要な step だけへ明示的に渡してください。write permission や repository mutation が必要になる変更は、#3114 の read-only review workflow とは別の仕様・安全性判断として扱います。

回帰テスト `smkc-score-app/__tests__/docs/security-audit-review-checkout-security.test.ts` は、workflow が `contents: read` を維持し、checkout credential persistence を無効化し、監査経路の `actions/checkout` / `actions/setup-node` がレビュー済み full SHA に固定されていることを検証します。

# Security audit workflow action pinning

Issue #3114 の手動 `Security audit review` は、監査対象の repository を取得する `actions/checkout` を mutable な major tag ではなく、レビュー済みの full commit SHA に固定します。

現在の固定値:

- `actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` (`v5` tag が 2026-09-11 時点で指していた commit)

この workflow は `contents: read`、`persist-credentials: false`、dependency tree 非インストールという境界を持っていますが、checkout action 自体は repository 内容を読み込む前段で実行されます。major tag は将来同じ `@v5` 表記のまま別 commit を指せるため、監査 workflow では意図せぬ action code の変更を自動で取り込まないよう commit SHA を固定します。

更新時は upstream の release/tag と対象 commit を確認し、full SHA の変更を通常の PR と CI でレビューします。`persist-credentials: false` は維持し、checkout 後に GitHub token を repository config へ残さない方針を変えません。

現時点では `actions/setup-node` の pinning policy は変更しません。今回の変更は repository checkout と token boundary に直接関係する action に限定し、他 action の pinning は別の明示的なレビュー対象とします。

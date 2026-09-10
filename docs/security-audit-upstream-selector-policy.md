# Security audit upstream selector policy

Issue #3114 の `security-audit-upstream.js` は、依存を変更せずに現在の Prisma manifest range 内へ安全な upstream remediation が出たかを確認する read-only probe です。

この probe が `npm view` に渡す selector は registry 上の SemVer selector に限定します。現在受理するのは exact version と単一の `^` / `~` / `>=` / `>` / `<=` / `<` comparator です。`latest` などの dist-tag、`*`、npm alias、`file:`、URL、git source、複合 range は自動で解釈せず fail-closed にします。

この制約は、PR で `package.json` が変更された場合や upstream package metadata が将来変化した場合でも、#3114 の確認処理が意図しない package source を追跡したり、曖昧な selector を「現在の compatible stable range」と誤認したりしないためのものです。canonical npm registry 固定、stable release のみを候補にする方針、60秒 timeout は従来どおり維持します。

許可していない selector が正当な upstream 変更として必要になった場合は、自動で範囲を広げず、selector の意味と registry resolution をレビューしてから probe の parser と回帰テストを明示的に更新します。依存 upgrade、consumer-side override、#3114 の期限延長や例外削除はこの probe から実行しません。

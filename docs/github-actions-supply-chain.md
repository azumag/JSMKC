# GitHub Actions supply-chain pinning

Credential-sensitive workflows should not execute mutable third-party action tags when an immutable reviewed commit can be used instead.

The `Claude Code` workflow can receive an OAuth token and grants `id-token: write`, so its executable actions are pinned to reviewed 40-character commit SHAs:

- `actions/checkout` v5: `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`
- `anthropics/claude-code-action` v1.0.225: `bf38e86e58df9ebf3420326d019f955bb3be64dd`

The version comment beside each SHA is documentation only; GitHub executes the immutable commit. When updating an action, resolve the intended upstream release/tag to its commit, review the release/change set, update the SHA and version comment together, and run the repository CI before merge.

`smkc-score-app/__tests__/docs/claude-workflow-action-pins.test.ts` keeps the reviewed SHA values and the current permission boundary under regression coverage. A dependency or action update must not widen workflow permissions as a side effect.

The security-audit review workflow has its own stricter action-pinning tests because that workflow is part of the dependency-audit evidence path. Other workflows may be migrated to immutable pins independently; do not bundle a change to `.github/workflows/d1-migrate.yml` into routine hardening because changing that file itself can trigger the production D1 migration workflow after merge.

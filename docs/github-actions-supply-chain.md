# GitHub Actions supply-chain pinning

Credential-sensitive workflows should not execute mutable third-party action tags when an immutable reviewed commit can be used instead.

The `Claude Code` workflow can receive an OAuth token and grants `id-token: write`, so its executable actions are pinned to reviewed 40-character commit SHAs:

- `actions/checkout` v5: `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`
- `anthropics/claude-code-action` v1.0.225: `bf38e86e58df9ebf3420326d019f955bb3be64dd`

The version comment beside each SHA is documentation only; GitHub executes the immutable commit. When updating an action, resolve the intended upstream release/tag to its commit, review the release/change set, update the SHA and version comment together, and run the repository CI before merge.

`smkc-score-app/__tests__/docs/claude-workflow-action-pins.test.ts` keeps the reviewed SHA values and the current permission boundary under regression coverage. A dependency or action update must not widen workflow permissions as a side effect.

The regular CI, PR review compatibility workflow, and nightly E2E workflow are also pinned to reviewed immutable commits rather than mutable major tags. Their reviewed action commits are:

- `actions/checkout` v5: `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`
- `actions/setup-node` v5: `a0853c24544627f65ddf259abe73b1d18a591444`
- `actions/cache` v5: `caa296126883cff596d87d8935842f9db880ef25` (nightly E2E only)
- `actions/upload-artifact` v6: `b7c566a772e6b6bfb58ed0dc250532a479d7789f` (nightly E2E only)

`smkc-score-app/__tests__/docs/nonproduction-workflow-action-pins.test.ts` enumerates every `uses:` entry in those three workflows, so introducing a new action or reverting to a mutable tag requires an explicit reviewed test update.

The security-audit review workflow has its own stricter action-pinning tests because that workflow is part of the dependency-audit evidence path. `.github/workflows/d1-migrate.yml` is intentionally excluded from routine pinning changes: changing that file itself matches its production `push.paths` trigger and can run the remote D1 migration job after merge. Update it only in a production-aware maintenance change where pending migrations and execution evidence can be checked.

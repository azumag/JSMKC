# GitHub Actions supply-chain pinning

Credential-sensitive workflows should not execute mutable third-party action tags when an immutable reviewed commit can be used instead.

The `Claude Code` workflow can receive an OAuth token and grants `id-token: write`, so its executable actions are pinned to reviewed 40-character commit SHAs:

- `actions/checkout` v5: `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`
- `anthropics/claude-code-action` v1.0.225: `bf38e86e58df9ebf3420326d019f955bb3be64dd`

The version comment beside each SHA is documentation only; GitHub executes the immutable commit. When updating an action, resolve the intended upstream release/tag to its commit, review the release/change set, update the SHA and version comment together, and run the repository CI before merge.

`smkc-score-app/__tests__/docs/claude-workflow-action-pins.test.ts` keeps the reviewed SHA values and the current permission boundary under regression coverage. A dependency or action update must not widen workflow permissions as a side effect.

The Claude Code workflow also disables checkout credential persistence. It does not require authenticated Git operations after checkout, so `actions/checkout` uses `persist-credentials: false` rather than leaving `GITHUB_TOKEN` in the repository Git config for the following Claude action. GitHub API access continues to come from the workflow/action permission model instead of implicit Git credentials.

Because this is a public repository, the Claude Code job also rejects bot senders and requires `OWNER`, `MEMBER`, or `COLLABORATOR` author association before an `@claude` mention can start the runner. This mirrors Claude Code Action's write-permission trust model at the workflow boundary, so untrusted comments do not reach the OAuth/OIDC-bearing job merely to be rejected later inside the action. Keep this job-level gate when changing trigger events, and extend the regression test whenever another event surface is added.

The regular CI, PR review compatibility workflow, and nightly E2E workflow are also pinned to reviewed immutable commits rather than mutable major tags. Their reviewed action commits are:

- `actions/checkout` v5: `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`
- `actions/setup-node` v5: `a0853c24544627f65ddf259abe73b1d18a591444`
- `actions/cache` v5: `caa296126883cff596d87d8935842f9db880ef25` (nightly E2E only)
- `actions/upload-artifact` v6: `b7c566a772e6b6bfb58ed0dc250532a479d7789f` (nightly E2E only)

These validation workflows do not need authenticated Git operations after checkout, so every `actions/checkout` step uses `persist-credentials: false`. This avoids leaving `GITHUB_TOKEN` in the repository Git config for the rest of the job. If a future step needs a GitHub API or repository mutation, pass the minimum-permission token explicitly to that step instead of re-enabling checkout credential persistence for the whole job.

`smkc-score-app/__tests__/docs/nonproduction-workflow-action-pins.test.ts` enumerates every `uses:` entry in those three workflows, so introducing a new action or reverting to a mutable tag requires an explicit reviewed test update. The same test also requires every checkout step in scope to keep `persist-credentials: false`.

The security-audit review workflow has its own stricter action-pinning tests because that workflow is part of the dependency-audit evidence path. `.github/workflows/d1-migrate.yml` is intentionally excluded from routine pinning changes: changing that file itself matches its production `push.paths` trigger and can run the remote D1 migration job after merge. Update it only in a production-aware maintenance change where pending migrations and execution evidence can be checked.

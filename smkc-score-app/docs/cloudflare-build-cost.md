# Cloudflare Workers Build Minutes policy

This document is the source of truth for the production `smkc` Workers Builds
cost-control policy. GitHub CI and production deployment are intentionally separate:
normal development, pull-request validation, and `main` merges continue in GitHub,
while production Worker builds are rate-gated to reduce paid Workers Build Minutes.

## Production trigger configuration

Keep the existing `smkc` repository connection to `azumag/JSMKC` and `main`.
The production trigger contract is:

| Setting                      | Required value        |
| ---------------------------- | --------------------- |
| Worker                       | `smkc`                |
| Production branch            | `main`                |
| Non-production branch builds | **OFF**               |
| Build cache                  | **ON**                |
| Root directory               | `smkc-score-app`      |
| Build command                | `npm run build:cf`    |
| Deploy command               | `npx wrangler deploy` |
| Path includes                | `["*"]`               |
| Path excludes                | `["*"]`               |

`path_excludes=["*"]` is intentional. It suppresses ordinary push-triggered
production builds while keeping the `main` repository connection intact. Do not
remove the exclude because a normal `main` push was skipped, and do not substitute a
manual production build after every merge. A Cloudflare skip under this policy is
not a GitHub CI failure.

Non-production branch builds must remain disabled (`previews_enabled=false`). Do not
enable preview builds as a workaround for the production push suppression policy.

The trigger deploy command is `npx wrangler deploy`; do not replace it with
`npm run deploy:cf`. Production D1 migration execution is governed separately and
must not be silently coupled to this build-cost gate.

## Production promotion gate

Production builds are initiated only through the existing operations path. Do not
add another scheduled task, Cron Worker, or Deploy Hook for this policy.

Before starting a production build:

1. Enforce a rolling 24-hour window across production build attempts. Success,
   failure, and cancellation all count unless a specific validation-only build is
   explicitly documented as excluded. A skipped build does not count as an attempt.
2. Require the exact current `main` SHA and successful repository CI, including the
   production Next.js build check. Missing, failed, or still-running validation is a
   reason not to start production.
3. Require a deploy-relevant diff since the last successful production SHA.
   Docs/tests-only changes do not justify a production build.
4. Do not periodically retry a SHA that already failed in production. Fix the cause
   and validate a new SHA first. Do not rebuild a SHA that is already the last
   successful production SHA.
5. Immediately before the single allowed start, re-read the exact `main` SHA and
   Cloudflare build history so a concurrent push or build cannot be overlooked.

When every gate passes, start the existing production trigger exactly once and pin
both the branch and the already-verified commit in the request payload:

```json
{
  "branch": "main",
  "commit_hash": "<verified exact main SHA>"
}
```

Do not omit `commit_hash`, substitute a stale SHA, or rely on Cloudflare to resolve
whatever branch tip happens to exist when the request is processed. The exact SHA in
the payload must be the same SHA whose CI and deploy-relevant diff were just
validated.

An uncertain or timed-out start response must be reconciled against build history,
not retried blindly. Do not send the start request a second time merely because the
first response is missing or ambiguous. A failed production build leaves the last
successful deployment in place until a new validated SHA is available.

This is a rolling rate/cost-control policy, not a Cloudflare billing cap and not a
guarantee that only one build can occur in a calendar day.

## Build watch-path exceptions

Cloudflare documents push cases where Build watch paths are ignored:

- zero changed files;
- 3,000 or more changed files;
- 20 or more commits in the push.

Do not use empty commits or empty pushes to trigger production. Do not force-push,
rewrite history, or weaken branch protection to avoid these exceptions. If an
exception causes an unintended push-triggered production build, treat it as a real
attempt in the rolling 24-hour history and report it explicitly.

The authoritative Cloudflare behavior is documented at
<https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/>.

## Pull-request checks

Ordinary feature PRs are validated by GitHub CI and do not depend on a Cloudflare
Workers Build. The existing `Wait for Cloudflare Workers Build` job name is retained
as a fast compatibility check so branch protection or rulesets that reference the
old check name do not break during the migration.

Cloudflare's intentionally skipped production build must not be confused with the
repository's real CI checks. Changes may continue through review, CI, and `main`
merges while production deployment remains separately gated.

## Preview workflow

The fixed preview environment remains independent of the production `smkc` gate.
Ordinary feature PRs should not enable non-production Cloudflare builds merely to
obtain temporary per-branch previews. When an integration/E2E preview is needed,
use the repository's existing long-lived preview workflow and dedicated preview D1
database rather than changing the production trigger policy.

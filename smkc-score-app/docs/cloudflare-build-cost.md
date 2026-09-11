# Cloudflare Workers Build Minutes policy

This document is the source of truth for the Cloudflare Workers Builds trigger policy.
Its purpose is to avoid running an OpenNext build for every pull-request push while
preserving the fixed production and preview environments.

## Desired Cloudflare trigger configuration

Use two separate Worker build connections.

| Worker         | Production branch | Non-production branch builds | Build cache | Build command      | Deploy command              |
| -------------- | ----------------- | ---------------------------- | ----------- | ------------------ | --------------------------- |
| `smkc`         | `main`            | **OFF**                      | **ON**      | `npm run build:cf` | `npm run deploy:cf`         |
| `smkc-preview` | `preview`         | **OFF**                      | **ON**      | `npm run build:cf` | `npm run deploy:cf:preview` |

Both connections use `smkc-score-app` as the root directory.

The former configuration enabled non-production builds for feature branches, which
caused every PR push to run Prisma generation plus a full OpenNext build. That
duplicated GitHub CI and consumed paid Workers Build Minutes. The fixed preview
environment does not require per-commit/branch preview Workers, so feature branches
are intentionally excluded.

The repository intentionally does not turn a feature-branch build into a fake
successful deployment. Branch control must prevent the unwanted Cloudflare build
from starting. This keeps the production and fixed-preview deploy commands unchanged
and avoids publishing incomplete artifacts merely to satisfy a PR check.

## Build watch paths

Cloudflare should only build when deployable application inputs change. Keep the
root include broad enough for application/config/migration changes, but exclude
files that cannot affect the deployed Worker:

```text
.github/*
smkc-score-app/__tests__/*
smkc-score-app/docs/*
smkc-score-app/e2e/*
AGENTS.md
README.md
```

Do not exclude `smkc-score-app/src/*`, `smkc-score-app/scripts/*`,
`smkc-score-app/prisma/*`, `smkc-score-app/migrations/*`, package manifests,
Wrangler/OpenNext configuration, or static assets. If a push contains both an
excluded file and a deployable file, the deployable file must still trigger the
build.

## Pull-request checks

Ordinary feature PRs are validated by GitHub CI and no longer wait for a Cloudflare
Workers Build. The existing `Wait for Cloudflare Workers Build` job name is retained
as a fast compatibility check so branch protection/rulesets that reference the old
check name do not break during the migration.

Cloudflare deployment validation moves to the long-lived deployment branches:

- `main` validates the production `smkc` deployment.
- `preview` validates the fixed `smkc-preview` deployment and preview D1 database.

## Preview workflow

The fixed preview environment is updated intentionally through the long-lived
`preview` branch. Ordinary feature PRs continue to use GitHub CI without a Cloudflare
deployment. When an integration/E2E preview is needed, update `preview` to the exact
commit/release candidate being validated, wait for the `smkc-preview` Workers Build,
then run the existing preview E2E commands against `https://preview.smkc.bluemoon.works`.

Do not re-enable "builds for non-production branches" merely to obtain a temporary
PR preview. The application already has a fixed preview Worker and dedicated preview
D1 database for that purpose.

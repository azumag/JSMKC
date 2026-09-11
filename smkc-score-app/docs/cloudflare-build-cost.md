# Cloudflare Workers Build Minutes policy

This document is the source of truth for the Cloudflare Workers Builds trigger policy.
Its purpose is to avoid running an OpenNext build for every pull-request push while
preserving the fixed production and preview environments.

## Desired Cloudflare trigger configuration

Use two separate Worker build connections.

| Worker | Production branch | Non-production branch builds | Build cache | Build command | Deploy command |
| --- | --- | --- | --- | --- | --- |
| `smkc` | `main` | **OFF** | **ON** | `npm run build:cf` | `npm run deploy:cf` |
| `smkc-preview` | `preview` | **OFF** | **ON** | `npm run build:cf` | `npm run deploy:cf:preview` |

Both connections use `smkc-score-app` as the root directory.

The former configuration enabled non-production builds for `smkc-preview`, which
caused every push to every PR branch to run Prisma generation plus a full OpenNext
build. That duplicated GitHub CI and consumed paid Workers Build Minutes. The fixed
preview environment does not require per-commit/branch preview Workers, so feature
branches are intentionally excluded.

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

## Repository-side defense

Cloudflare system variables `WORKERS_CI=1` and `WORKERS_CI_BRANCH=<branch>` are
used by `scripts/cloudflare-build.sh` and `scripts/cloudflare-deploy.sh`.

- `main` may build and deploy production.
- `preview` may build and deploy the fixed preview Worker and preview D1 migrations.
- any other branch exits before the expensive OpenNext build and before D1
  migrations/deploy.
- outside Workers Builds (local development and GitHub CI), the existing build and
  deploy commands continue to work normally.

This guard is defense-in-depth only. Cloudflare Branch control remains the primary
cost control because it prevents an unwanted build from starting at all.

## Preview workflow

The fixed preview environment is updated intentionally through the long-lived
`preview` branch. Ordinary feature PRs continue to use GitHub CI without a Cloudflare
deployment. When an integration/E2E preview is needed, update `preview` to the exact
commit/release candidate being validated, wait for the `smkc-preview` Workers Build,
then run the existing preview E2E commands against `https://preview.smkc.bluemoon.works`.

Do not re-enable "builds for non-production branches" merely to obtain a temporary
PR preview. The application already has a fixed preview Worker and dedicated preview
D1 database for that purpose.

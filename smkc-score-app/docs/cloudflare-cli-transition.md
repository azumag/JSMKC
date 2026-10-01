# Cloudflare CLI transition

Issue #4201 tracks the gradual move toward Cloudflare's unified `cf` CLI.

The repository is **cf-first for new operational design**, but existing production,
preview, D1, and OpenNext commands must stay on Wrangler until the corresponding
`cf` surface has been verified to preserve the current safety contract. This is a
migration policy, not permission to replace working production commands speculatively.

## Current upstream status (2026-09-30)

Cloudflare's `cf` CLI is currently beta. D1 migration list/apply now have explicit
`cf` commands, but they target a **database ID directly** instead of resolving the
Wrangler binding/environment:

- `cf d1 migrations list <DATABASE_ID>`
- `cf d1 migrations apply <DATABASE_ID> --dir migrations`

For `cf d1 migrations apply`, the remote database is the default; `--local` opts
into local state. Cloudflare also documents that `cf migrate` does **not** convert
Wrangler's `migrations_dir`, `migrations_pattern`, or `migrations_table`
settings automatically. Those settings must be preserved explicitly on the D1
migration command.

Therefore JSMKC must not replace the existing production/preview migration scripts
until a repository-owned fail-closed mapping selects the exact database ID for each
environment and regression coverage proves that production cannot silently fall
back from a missing/invalid preview target. The current Wrangler commands remain the
verified operational fallback while that adapter is implemented and reviewed.

A repository-owned dry-run planner now exists at
`scripts/cloudflare-d1-migration-plan.cjs`. It reuses the fail-closed D1 target
resolver and emits JSON describing the exact `cf d1 migrations list/apply`
command for an explicitly selected `production` or `preview` target. The planner
does not spawn `cf`, mutate D1, or change package deploy scripts; it is a parity
verification surface only until its behavior and the upstream CLI are reviewed in
CI. Example: `node scripts/cloudflare-d1-migration-plan.cjs apply preview`.

Live log streaming is still a Wrangler fallback: Cloudflare's current docs continue
to direct users to `wrangler tail` for Worker tailing.

Upstream references:

- https://developers.cloudflare.com/cf/wrangler/
- https://developers.cloudflare.com/cf/wrangler/migrate/
- https://developers.cloudflare.com/cf/wrangler/reference/
- https://developers.cloudflare.com/workers/observability/logs/real-time-logs/

## Current command inventory

| Surface                          | Current command/config                                                     | Transition rule                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production D1 migration list     | `npm run db:migrations:list` → `wrangler d1 migrations list DB --remote`   | `cf d1 migrations list <DATABASE_ID>` exists upstream; switch only after production DB ID selection is repository-owned, explicit, and fail-closed.                              |
| Production D1 migration apply    | `npm run db:migrations:apply` → `wrangler d1 migrations apply DB --remote` | `cf d1 migrations apply <DATABASE_ID> --dir migrations` exists upstream; preserve ordering, remote targeting, migration history, and non-zero failure behavior before switching. |
| Preview D1 migration list/apply  | Same commands with `--env preview`                                         | A future `cf` wrapper must select the preview database ID directly and must never fall back to production when preview identity is missing or invalid.                           |
| Worker deploy                    | `wrangler deploy` / `wrangler deploy --env preview`                        | Keep OpenNext output, bindings, compatibility settings, routes, assets, and environment selection unchanged until deploy parity is verified.                                     |
| Worker configuration             | `wrangler.toml`                                                            | Do not move to another config format until production and preview bindings/configuration can be proven equivalent.                                                               |
| D1 export / operational SQL      | Wrangler-based operational commands                                        | Keep Wrangler fallback until an equivalent `cf` command is verified for the same database identity and output semantics.                                                         |
| Logs / tail                      | `wrangler tail` where used operationally                                   | Keep Wrangler until Cloudflare documents a `cf` live-tail replacement with equivalent filter/environment/diagnostic semantics.                                                   |
| Preview schema preflight         | Wrangler D1 execution in repository scripts/workflows                      | Preserve fail-closed schema checks and the dedicated preview DB.                                                                                                                 |
| Workers Builds production deploy | Cloudflare trigger command `npx wrangler deploy`                           | Managed by the separate build-cost policy; do not change it as part of CLI migration work.                                                                                       |

Wrangler remaining in the repository during this transition is intentional fallback,
not an indication that the migration issue is being ignored.

## Safety contracts

### D1 migration correctness

Production and preview migrations must remain explicit and separate. The production
commands operate on the production `DB` binding; preview commands additionally
select `--env preview`.

Deployment must continue to apply migrations before Worker deployment:

- production: `npm run db:migrations:apply && wrangler deploy`
- preview: `npm run db:migrations:apply:preview && wrangler deploy --env preview`

The verified upstream `cf` migration surface changes target selection from
binding/environment lookup to database-ID lookup. A repository adapter must therefore
derive/select the exact production or preview database ID without guessing, reject
unknown environments/IDs, preserve `--dir migrations`, and propagate any list/apply
failure unchanged before the package scripts can switch.

Do not weaken Prisma/D1 migration parity CI to make a CLI transition pass.

### Production and preview identity

`wrangler.toml` currently defines separate production and preview Worker names,
D1 database IDs, R2 buckets, routes, and environment variables. Any config migration
must demonstrate that these identities remain distinct before the old configuration
is removed.

Do not copy production IDs or bindings into preview, infer an unknown target, or fall
back to production when preview configuration is missing.

### OpenNext deployment

The application build contract remains `npm run build:cf`, producing the OpenNext
Worker and assets consumed by deployment. CLI migration must not silently change the
OpenNext build product, compatibility date/flags, assets binding, D1 binding, R2
binding, custom domains, or secrets.

### Workers Builds cost gate is separate

The production Workers Builds trigger and its rate/cost gate are governed by
`docs/cloudflare-build-cost.md`. CLI transition work must not:

- remove `path_excludes=["*"]`;
- enable non-production branch builds;
- replace the production build trigger;
- add a Deploy Hook, Cron Worker, or second scheduled promotion path; or
- change the trigger's `npx wrangler deploy` command before deploy parity is
  deliberately reviewed.

A skipped Cloudflare production build is not a GitHub CI failure.

## How to migrate one surface

For each Wrangler dependency:

1. identify the exact production and preview identities and current command;
2. verify the equivalent `cf` command/config behavior without changing production;
3. add or update regression coverage for targeting, ordering, and fail-closed behavior;
4. update documentation and operational examples;
5. switch only that verified surface; and
6. keep a documented Wrangler fallback for unsupported or unverified behavior.

Do not bundle unrelated D1 migrations, binding/secret changes, domain changes, or
billing/permission changes into a CLI migration PR.

## Completion criteria for #4201

The transition is complete only when all Cloudflare operational surfaces have been
inventoried, verified replacements are covered by tests, production/preview identity
is preserved, OpenNext build/deploy behavior has no regression, and every remaining
Wrangler use has a documented temporary fallback reason.

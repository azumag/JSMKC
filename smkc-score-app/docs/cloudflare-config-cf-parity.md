# Cloudflare Worker configuration: cf parity verification (issue #4201)

Issue [#4201](https://github.com/azumag/JSMKC/issues/4201) moves Cloudflare operations to the
`cf` CLI surface by surface. The D1 surfaces are recorded in
[`cloudflare-d1-cf-parity.md`](./cloudflare-d1-cf-parity.md); this document records the
**Worker configuration** surfaces — `wrangler.toml`, its `cloudflare.config.ts` migration, the
environment selection that replaces `--env`, the OpenNext build/deploy path, secrets, and
types generation.

Nothing in this document changes production behaviour: `wrangler.toml` stays the deployed
configuration, no package script, workflow, binding, secret, or Cloudflare setting was switched,
and no `cf migrate` output was committed.

## Verification method

- tools compared: `cf v1.0.0-beta.12` (local install) against `wrangler 4.144.0`
  (the version pinned by `package-lock.json`, i.e. what `npm run deploy:*` executes);
- evidence collected offline: `cf <command> --help`, `cf migrate wrangler.toml --dry-run`, and a
  full `cf migrate wrangler.toml` plus `cf deploy --dry-run` run against a copy of this
  repository's `wrangler.toml` in a throwaway directory **outside this repository**;
- no Cloudflare credentials were used. No Worker was deployed, no secret was written, and no
  remote state was read or changed;
- `npm run cloudflare:config-parity` re-runs the read-only part of this check (version banner plus
  the `--help` surface each plan depends on) and fails if upstream drifts.

`cf migrate` writes files into the working tree, so it was only ever run against a copy outside
this repository. `cf deploy --dry-run` builds the project; it was likewise only run in that copy.

## Surface verdicts

| Surface                                                                | cf equivalent                                                                 | Verdict           | Blocking reasons                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `wrangler-config-migration` — `wrangler.toml` → `cloudflare.config.ts` | `cf migrate wrangler.toml`                                                    | keep Wrangler     | `migrations-dir-not-migrated`, `env-mode-not-fail-closed`, `config-throws-on-todo`, `remote-unverified` |
| `environment-selection` — `--env preview`                              | `cf deploy --mode preview`                                                    | keep Wrangler     | `unknown-mode-silently-defaults`, `remote-unverified`                                                   |
| `worker-deploy` — `wrangler deploy` / `--env preview`                  | `cf deploy / cf deploy --mode preview`                                        | keep Wrangler     | `build-product-unverified`, `dev-server-manifest-required`, `remote-unverified`                         |
| `worker-build` — `opennextjs-cloudflare build`                         | `cf build` (delegates to Wrangler when `wrangler` is the declared dev server) | keep Wrangler     | `build-product-unverified`, `remote-unverified`                                                         |
| `worker-secrets` — `npx wrangler secret put <NAME>`                    | `cf workers secrets update <NAME> --text <VALUE>`                             | keep Wrangler     | `remote-unverified`, `secret-command-renamed`                                                           |
| `worker-types` — `wrangler types`                                      | `cf workers types`                                                            | keep Wrangler     | `types-source-unverified`, `remote-unverified`                                                          |
| `worker-logs` — `wrangler tail`                                        | (none)                                                                        | unsupported in cf | `no-cf-equivalent`                                                                                      |

### `wrangler-config-migration`

- current configuration: `smkc-score-app/wrangler.toml` (top-level Worker plus an `[env.preview]`
  section, with separate names, routes, vars, D1 bindings, and R2 buckets);
- cf equivalent: `cf migrate wrangler.toml`, which writes `cloudflare.config.ts` (and
  `wrangler.config.ts` for the parts cf keeps on Wrangler);
- evidence: `cf migrate wrangler.toml --dry-run --no-install --force` and a full
  `cf migrate wrangler.toml --no-install --force` on a copy of this file in a throwaway directory,
  followed by `cf deploy --dry-run` against the generated config;
- observed:
  - `--dry-run` reports `Would update 2 file(s): cloudflare.config.ts, wrangler.config.ts`;
  - the generated `cloudflare.config.ts` keeps every production and preview identity distinct —
    `name: "smkc"` / `name: "smkc-preview"`, `domains: ["smkc.bluemoon.works"]` /
    `["preview.smkc.bluemoon.works"]`, `bindings.d1({ name: "smkc-db", id: "3132bf8c-…" })` /
    `{ name: "smkc-db-preview", id: "5a974a4a-…" }`, and the two R2 buckets — so no production
    identity is copied into preview;
  - `[[routes]] pattern = "…" custom_domain = true` becomes `domains: ["…"]`, and `[assets]` with
    `binding = "ASSETS"` becomes `ASSETS: bindings.assets()`;
  - `compatibility_date` / `compatibility_flags` / `main` map to `compatibilityDate` /
    `compatibilityFlags` / `entrypoint`;
  - **`migrations_dir` is dropped**: `cf migrate` reports
    `The options \`migrations_dir\` at \`d1_databases.0\` require manual migration`for both the
production and the preview D1 binding, and`D1BindingOptions`in`@cloudflare/config`exposes
only`id`, `name`, and `dev`— there is no migrations-directory field. The D1 binding in`cloudflare.config.ts`therefore carries no`migrations_dir`, which is exactly the setting
[`cloudflare-d1-target.cjs`](../scripts/cloudflare-d1-target.cjs) fails closed on;
  - `wrangler.config.ts` is still emitted (`types.generate: false`, `assetsDirectory`) and still
    imports `wrangler/experimental-config`, so the migration keeps a Wrangler dependency rather
    than removing one.
- blocked by: `migrations-dir-not-migrated` (the D1 migration contract this repository enforces
  cannot be expressed in `cloudflare.config.ts`), `env-mode-not-fail-closed` (see below),
  `config-throws-on-todo` (the generated config is inert until the TODOs are resolved by hand),
  `remote-unverified` (only `--dry-run` and a local build were observed).

### `environment-selection`

- current selection: `wrangler deploy --env preview`, `wrangler d1 … --env preview`;
- cf equivalent: the global `--mode` flag, evaluated by the `switch (ctx.mode)` statement
  `cf migrate` generates;
- evidence: `cf deploy --dry-run` (no `--mode`), `--mode preview`, `--mode bogus-mode`, and
  `--mode production` against a probe config whose branches set a distinct `name` per mode, plus
  `wrangler deploy --dry-run --env bogus` for comparison;
- observed:
  - with no `--mode`, and with `--mode production`, and with `--mode bogus-mode`, the `default:`
    branch is selected — a typo in `--mode` silently resolves to the default branch, which in the
    migrated config is **production**;
  - only `--mode preview` selects the preview branch;
  - by contrast `wrangler deploy --dry-run --env bogus` fails closed:
    `No environment found in configuration with name "bogus" … The available configured
environment names are: ["preview"]`.
- blocked by: `unknown-mode-silently-defaults` — replacing `--env preview` with `--mode preview`
  would turn a misspelled or missing environment into a silent production deploy, which breaks the
  preview/production boundary this repository treats as a safety contract — plus
  `remote-unverified`.

### `worker-deploy` / `worker-build`

- current path: `npm run build:cf` (`opennextjs-cloudflare build`) then
  `wrangler deploy` / `wrangler deploy --env preview`, with migrations applied first;
- cf equivalent: `cf deploy` (`--mode preview`) and `cf build`;
- evidence: `cf deploy --help`, `cf build --help`, `cf deploy --dry-run` in the throwaway copy;
- observed:
  - `cf deploy` builds first (`--dry-run` runs the build and the checks without uploading) and
    accepts `--prebuilt`, `--tag`, `--message`, `--secrets-file`, `--worker`,
    `--dispatch-namespace`, and `--containers-rollout`; it has no `--env`;
  - in the throwaway copy without a dev server declared, `cf deploy --dry-run` failed with
    `No Cloudflare dev-server is installed in this project`, requiring exactly one of
    `@cloudflare/vite-plugin`, `wrangler`, `cloudflare-py-dev-server`, or `cloudflare-rs-dev-server`
    in the manifest;
  - with `wrangler` declared, the build printed `Delegating to Wrangler`, i.e. `cf build`/`cf deploy`
    still execute the Wrangler bundler for this project shape;
  - the build then failed on the generated config's `throw new Error("Migration incomplete…")`, and
    after that was resolved by hand, on the missing `.open-next/assets` directory — the same
    OpenNext build output `npm run build:cf` produces.
- blocked by: `build-product-unverified` (the OpenNext build product, compatibility date/flags,
  assets binding, D1 binding, R2 binding, domains, and secrets were only exercised through a local
  dry run of a hand-edited config, never against the real build output),
  `dev-server-manifest-required`, `remote-unverified`. The Workers Builds cost gate in
  [`cloudflare-build-cost.md`](./cloudflare-build-cost.md) stays separate: its
  `npx wrangler deploy` trigger is deliberately unchanged.

### `worker-secrets`

- current path: `npx wrangler secret put <NAME>` (documented in `wrangler.toml` for `AUTH_SECRET`,
  `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `ADMIN_DISCORD_IDS`);
- cf equivalent: `cf workers secrets update <NAME> --text <VALUE>` (there is no
  `cf workers secrets put`);
- evidence: `cf workers secrets --help`, `cf workers secrets update --help`;
- observed: the subcommands are `bulk`, `delete`, `get`, `list`, `update`; `update` takes
  `--worker/--script-name`, `--text`, `--type`, `--format`, `--key-base64`, `--usages`,
  `--dry-run`, and `--body`. `bulk` exists for patching several secrets at once, which Wrangler has
  no equivalent of;
- blocked by: `secret-command-renamed` (the documented `wrangler secret put` command has no
  same-named cf replacement, so the operational docs and any runbook must be rewritten together
  with the switch) and `remote-unverified`.

### `worker-types`

- current path: `wrangler types` (type generation from the Wrangler configuration);
- cf equivalent: `cf workers types`, documented as `Generate types from cloudflare.config.ts`;
- evidence: `cf workers types --help`;
- observed: `cf workers types` accepts `--include-runtime` (default `true`) and reads
  `cloudflare.config.ts`, so it depends on the config migration landing first;
- blocked by: `types-source-unverified` and `remote-unverified`.

### `worker-logs`

- current path: `wrangler tail` where used operationally (referenced by
  `docs/cloudflare-cli-transition.md` and by `src/app/api/internal/vitals/route.ts`);
- cf equivalent: none;
- evidence: `cf --help`, `cf observability --help`;
- observed: `cf --help` lists no `tail` command. `cf observability` exposes `destinations`,
  `issues`, `queries`, `shared-queries`, `telemetry`, and `tracing` — historical/aggregate query
  surfaces, not a live tail with equivalent filter and environment semantics;
- blocked by: `no-cf-equivalent` — the Wrangler tail command stays until Cloudflare documents a
  live-tail replacement.

## Blocking reason reference

Each id below carries the verbatim reason `scripts/cloudflare-config-parity.cjs` records, so the
document, the script, and the regression test cannot drift apart.

- `migrations-dir-not-migrated`: cf migrate reports `migrations_dir` as requiring manual migration
  for both D1 bindings and `D1BindingOptions` exposes no migrations-directory field, so the setting
  the fail-closed D1 target resolver depends on would be dropped.
- `env-mode-not-fail-closed`: the generated `switch (ctx.mode)` resolves an unknown or missing mode
  to its `default:` branch, which is production, where `wrangler --env <unknown>` fails closed and
  lists the configured environments.
- `config-throws-on-todo`: the generated cloudflare.config.ts throws
  `Migration incomplete. Resolve every cf migrate TODO` until the reported TODOs are resolved by
  hand, so the migrated config is inert as generated.
- `unknown-mode-silently-defaults`: `--mode bogus-mode`, `--mode production`, and no `--mode` at all
  all selected the `default:` (production) branch, so replacing `--env preview` with
  `--mode preview` would turn a typo into a silent production deploy.
- `build-product-unverified`: the OpenNext build output, compatibility date/flags, assets/D1/R2
  bindings, domains, and secrets were only exercised through a local dry run of a hand-edited
  migrated config, never against the real build product.
- `dev-server-manifest-required`: `cf deploy`/`cf build` require exactly one declared dev server in
  the manifest (@cloudflare/vite-plugin, wrangler, cloudflare-py-dev-server, or
  cloudflare-rs-dev-server) and fail otherwise.
- `remote-unverified`: no credentialed remote run has compared cf against Wrangler for this surface;
  only offline/local evidence exists.
- `secret-command-renamed`: the documented `wrangler secret put <NAME>` has no same-named cf
  replacement (`cf workers secrets update`), so the operational docs and secrets runbook must be
  rewritten together with the switch.
- `types-source-unverified`: `cf workers types` generates from cloudflare.config.ts, so it depends
  on the config migration landing first and was not exercised against this repository.
- `no-cf-equivalent`: cf v1.0.0-beta.12 has no live-tail command; `cf observability` exposes
  aggregate query surfaces instead of a tail with equivalent filter/environment semantics.

## What would have to change before any of this switches

1. `migrations_dir` needs a `cloudflare.config.ts` representation, or the D1 migration commands
   need to stop reading it from the config — otherwise `cf migrate` silently drops the setting the
   repository's fail-closed target resolver depends on.
2. Environment selection needs a guard so an unknown `--mode` fails closed instead of resolving to
   the `default:` (production) branch.
3. A credentialed remote comparison of `cf deploy` against `wrangler deploy` on the real OpenNext
   build output, including bindings, compatibility settings, assets, domains, and secrets.
4. Operational docs and the secrets runbook rewritten together, since `wrangler secret put` has no
   same-named cf command.

Until then `wrangler.toml` remains the deployed configuration and every surface above stays on
Wrangler.

# Cloudflare D1: cf parity verification (issue #4201)

Issue [#4201](https://github.com/azumag/JSMKC/issues/4201) moves Cloudflare operations to the
`cf` CLI surface by surface. This document records what was actually verified for the D1
surfaces, so a later slice can switch a command only where parity is written down here and a
reviewer can re-run the same checks.

Nothing in this document changes production behaviour: no package script, workflow, binding, or
Cloudflare setting was switched. All four surfaces below still run on Wrangler.

## Verification method

- tools compared: `cf v1.0.0-beta.12` (local install) against `wrangler 4.144.0`
  (the version pinned by `package-lock.json`, i.e. what `npm run db:migrations:*` executes);
- evidence collected offline: `cf <command> --help`, `cf d1 query ... --dry-run`, and `--local`
  simulations run in a throwaway directory outside this repository;
- no Cloudflare credentials were used. No migration was applied to the production or preview
  database, and no `cf` command that mutates remote state was run;
- `npm run cloudflare:cf-parity` re-runs the read-only part of this check (version banner plus the
  `--help` surface each plan depends on) and fails if upstream drifts.

`--local` is not a substitute for a credentialed remote run: `cf d1 query` has no local
equivalent, `cf d1 migrations list --local` failed to exit on one run (see
`local-mode-hang`), and local state is a simulation of the D1 engine rather than the deployed
database.

## Surface verdicts

| Surface                                                           | cf equivalent                                                                      | Verdict           | Blocking reasons                                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| `d1-migrations-list` — D1 migration list (production / preview)   | `cf d1 migrations list <DATABASE_ID> --pattern migrations/*.sql`                   | keep Wrangler     | `remote-unverified`, `audit-sentinel-shape`, `local-mode-hang`                                       |
| `d1-migrations-apply` — D1 migration apply (production / preview) | `cf d1 migrations apply <DATABASE_ID> --dir migrations --pattern migrations/*.sql` | keep Wrangler     | `interactive-confirm-fail-open`, `remote-unverified`, `local-mode-hang`                              |
| `d1-export` — D1 export / operational SQL dump                    | (none)                                                                             | unsupported in cf | `no-cf-equivalent`                                                                                   |
| `preview-schema-preflight` — preview D1 schema preflight          | `cf d1 query <DATABASE_ID> --sql <SQL>`                                            | keep Wrangler     | `output-shape-differs`, `auth-error-text-differs`, `no-local-verification-path`, `remote-unverified` |

### `d1-migrations-list`

- current command: `wrangler d1 migrations list DB --remote` (`--env preview` for preview);
- cf equivalent: `cf d1 migrations list <DATABASE_ID> --pattern migrations/*.sql`;
- evidence: `cf d1 migrations list <DATABASE_ID> --local --dir migrations` (default pattern) and
  the same command with `--pattern "migrations/*.sql"`;
- observed: both forms listed the same 46 files, matching
  `wrangler d1 migrations list DB --local` over the same directory. Output is a JSON array of
  `{"Name":"<file>"}` objects, and the empty state prints `[]` with exit 0 — Wrangler instead
  prints `No migrations to apply!`;
- blocked by: `remote-unverified` (the JSON and exit-code behaviour above were only observed in
  local mode), `audit-sentinel-shape` (`.github/workflows/d1-migrate.yml` greps the Wrangler text
  sentinel, so the audit step has to be rewritten before the list command can change), and
  `local-mode-hang`.

### `d1-migrations-apply`

- current command: `wrangler d1 migrations apply DB --remote` (`--env preview` for preview);
- cf equivalent: `cf d1 migrations apply <DATABASE_ID> --dir migrations --pattern migrations/*.sql`;
- evidence: `cf d1 migrations apply <DATABASE_ID> --local --dir migrations --persist-to <dir>`
  against both a one-file directory and this repository's `migrations/` directory;
- observed: cf asks `? About to apply N migration(s) ... continue?` and then reports
  `Using fallback value in non-interactive context: yes` before applying, i.e. it auto-confirms
  when there is no TTY, where `wrangler d1 migrations apply` applies without a prompt. Discovery
  and failure behaviour otherwise match: files are applied in name order and the run stops at the
  first failing file, leaving earlier files applied (reproduced: this repository's migration set
  fails at `0037_add_overall_to_existing_tournaments.sql` with
  `no such column: publicModes at offset 60: SQLITE_ERROR` in both tools — see F5);
- blocked by: `interactive-confirm-fail-open`, `remote-unverified`, `local-mode-hang`.

### `d1-export`

- current command: `wrangler d1 export DB --remote --output <file>` (referenced by
  `docs/operation-tournament.md`, not wired into a package script);
- cf equivalent: none;
- evidence: `cf d1 --help`, `cf --help`, `cf d1 export --help`;
- observed: `cf d1` lists only create/delete/edit/get/list/migrations/query/raw/time-travel/update.
  `cf d1 export --help` falls back to the `cf d1` command list, and `cf --help` lists no export,
  import, dump, or backup command;
- blocked by: `no-cf-equivalent` — the Wrangler export command stays until Cloudflare ships one.
  `cf d1 time-travel get-bookmark` is a bookmark restore point, not a SQL export, and is not a
  substitute.

### `preview-schema-preflight`

- current command: `wrangler d1 execute DB --remote --env preview --json --command <SQL>`
  (`e2e/lib/preview-schema-preflight.js`);
- cf equivalent: `cf d1 query <DATABASE_ID> --sql <SQL>`;
- evidence: `cf d1 query <DATABASE_ID> --sql "select 1 as x" --dry-run`,
  `cf d1 query <DATABASE_ID> --sql "select 1 as x" --local`, `cf schema d1 query`;
- observed: the non-executing form prints the request it would send
  (`POST /accounts/<account-id>/d1/database/<database-id>/query`, body `{"sql": ...}`), so it is
  the same D1 query endpoint Wrangler's `d1 execute` uses. It documents neither `--remote` (remote
  is the default) nor `--json`, and returns the HTTP API result rather than the
  `[{ "results": [...] }]` array the preflight parses. `--local` fails closed with
  `This command has no local equivalent` and exit 1;
- blocked by: `output-shape-differs`, `auth-error-text-differs` (the preflight's fail-open
  auth/log detection matches Wrangler text such as `CLOUDFLARE_API_TOKEN`, `non-interactive
environment`, and error code `7403`; cf reports a boxed `APIError` with different text, so a
  naive switch would silently stop classifying credential failures),
  `no-local-verification-path`, `remote-unverified`.

## Blocking reasons

Every fallback below is one of these ids. The list is the same data
`scripts/cloudflare-cf-parity.cjs` exports, so a reason cannot be reworded in one place only.

- `remote-unverified` — no credentialed remote run has compared cf against Wrangler for this surface; only offline/local evidence exists
- `local-mode-hang` — cf local mode printed its result and then failed to exit on one run of `cf d1 migrations list --local` (killed by a timeout), so a switch needs an explicit timeout guard
- `audit-sentinel-shape` — `.github/workflows/d1-migrate.yml` greps the Wrangler text output for "No migrations to apply!"; cf prints `[]` for the same state, so the audit step must be rewritten and re-verified remotely first
- `interactive-confirm-fail-open` — cf apply answers its own "About to apply N migration(s) ... continue?" prompt with yes in a non-interactive context; `wrangler d1 migrations apply` has no prompt, so switching without a guard drops that confirmation step
- `no-cf-equivalent` — cf v1.0.0-beta.12 has no `d1 export`/`d1 import` command, so the Wrangler operational command is the only path
- `output-shape-differs` — the preview preflight parses `wrangler d1 execute --json` output; `cf d1 query` documents no `--json` flag and returns the D1 HTTP query API result instead
- `no-local-verification-path` — `cf d1 query --local` fails closed ("This command has no local equivalent"), so this surface cannot be verified without Cloudflare credentials
- `auth-error-text-differs` — the preflight keys its fail-open auth/log detection on Wrangler-specific text (CLOUDFLARE_API_TOKEN / non-interactive / code 7403); cf reports a boxed APIError, so detection would stop matching

## Findings

F1. `cf d1 migrations list/apply` are argument-compatible replacements for the migration
commands: they take the database ID directly, document `--dir`, `--pattern`, and `--table`
(`--pattern` defaults to `<dir>/*.sql`, `--table` to `d1_migrations`, matching the Wrangler
defaults), and treat remote as the default with `--local` as the opt-in. The repository-owned
fail-closed target resolver (`scripts/cloudflare-d1-target.cjs`) already supplies that database
ID, which is why the planner can emit these commands.

F2. `--pattern` does not merge with the default glob. With `--pattern "migrations/**/*.sql"` cf
listed only the nested files and none of the flat ones. A plan therefore states the discovery glob
explicitly (`migrations/*.sql`) instead of relying on whatever the current default is.
`scripts/cloudflare-d1-migration-plan.cjs` pins it in every list/apply plan.

F3. The migration audit in `.github/workflows/d1-migrate.yml` keys on Wrangler's text sentinel
(`No migrations to apply!`). cf prints `[]`. The audit must be rewritten to parse cf's JSON output
and re-verified against the real database before the list command changes.

F4. cf's apply confirms interactively and defaults to yes when it is not attached to a TTY. The
current Wrangler command does not prompt, so a switch must either keep an explicit confirmation in
the script/workflow or document that the confirmation is dropped deliberately.

F5. (repository issue, not a cf regression) `migrations/0004_tournament_is_public/migration.sql`
and `migrations/0005_add_public_modes/migration.sql` live in Drizzle-style subdirectories and are
discovered by neither tool's default glob. Applying this repository's `migrations/` directory to a
fresh database therefore fails, with `wrangler 4.144.0` and with `cf` alike, at
`0037_add_overall_to_existing_tournaments.sql`. The deployed databases are unaffected (they were
migrated while those files were still discoverable), but a fresh rebuild or a new environment
cannot be created from this directory as it stands. Fixing it changes migration history, so it is
out of scope here and should be handled as its own reviewed change.

F6. `cf` local mode is not reliable enough to serve as the verification surface: one run of
`cf d1 migrations list <id> --local` printed its full result and then never exited (killed at 45
seconds; the same command completed in 0.7 seconds on a repeat run). Any future switch has to add
an explicit timeout instead of relying on the command to terminate.

## What a switch requires

For each surface, all of the following must hold before its Wrangler fallback is replaced:

1. the blocking reasons above are resolved or explicitly accepted in the PR that switches it;
2. the relevant CI or workflow contract is updated in the same change (migration audit, preflight
   parser, export documentation);
3. a credentialed run against the preview database confirms the observed output and exit status,
   and the production path is reviewed with the same evidence;
4. `npm run cloudflare:cf-parity` reports no drift for the surface's `--help` contract.

Surfaces may be switched one at a time; bundling them would mix an unverified remote behaviour
with an unrelated one.

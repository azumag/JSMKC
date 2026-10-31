# Cloudflare D1: cf parity verification (issue #4201)

Issue [#4201](https://github.com/azumag/JSMKC/issues/4201) moves Cloudflare operations to the `cf` CLI surface by surface. Operational production and preview migration commands **still run on Wrangler** until each surface has credentialed evidence and its fail-closed contract is preserved.

## Current baseline

- `cf v1.0.0-beta.24` is the pinned beta used by the preview parity workflow.
- `wrangler 4.151.3` is the repository comparison point.
- PR #4239 removed the migration audit's Wrangler-only empty-state parser dependency.
- PR #4243 added `scripts/cloudflare-cf-runner.cjs`, which requires an explicit timeout, validates the exact repository-owned plan, uses `shell: false`, terminates a hung process group, returns structured status, and redacts credential values.
- PR #4224 already fixed the old nested `0004` / `0005` migration layout and verified a clean local D1 can apply the full migration set. The previous fresh-rebuild blocker is therefore resolved.
- `scripts/cloudflare-d1-remote-parity.cjs` is preview-only. It compares Wrangler and cf migration-list results against the same resolved preview D1 target and has no production mode.

## Surface verdicts

| Surface                    | cf equivalent                                                                      | Verdict           | Blocking reasons                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| `d1-migrations-list`       | `cf d1 migrations list <DATABASE_ID> --pattern migrations/*.sql`                   | keep Wrangler     | `remote-unverified`                                                                                  |
| `d1-migrations-apply`      | `cf d1 migrations apply <DATABASE_ID> --dir migrations --pattern migrations/*.sql` | keep Wrangler     | `interactive-confirm-fail-open`, `remote-unverified`                                                 |
| `d1-export`                | unsupported in cf                                                                  | unsupported in cf | `no-cf-equivalent`                                                                                   |
| `preview-schema-preflight` | `cf d1 query <DATABASE_ID> --sql <SQL>`                                            | keep Wrangler     | `output-shape-differs`, `auth-error-text-differs`, `no-local-verification-path`, `remote-unverified` |

### `d1-migrations-list`

Current operational commands are `wrangler d1 migrations list DB --remote` and `wrangler d1 migrations list DB --remote --env preview`.

The cf plan is `cf d1 migrations list <DATABASE_ID> --pattern migrations/*.sql`. Local verification showed the same discovery contract and cf represents the result as a JSON array of `{"Name":"<file>"}` entries, with `[]` for no pending migrations. PR #4239 made the audit accept either Wrangler's no-pending sentinel or a final cf `[]`, failing closed for unknown output.

The former `local-mode-hang` blocker is now mitigated by PR #4243: every future cf execution for this migration path must use the bounded repository-owned runner. It remains a historical finding and an execution requirement, not a reason to keep Wrangler by itself.

Phase B adds a credentialed **preview-only read-only** comparison. Wrangler runs first against `--env preview`; only if it succeeds does cf run against the preview database ID resolved from `wrangler.toml`. Both result sets are normalized to migration names and must match exactly. A timeout, auth failure, malformed output, duplicate/invalid migration name, or set mismatch fails closed.

### `d1-migrations-apply`

Current operational commands remain Wrangler. The candidate cf command is `cf d1 migrations apply <DATABASE_ID> --dir migrations --pattern migrations/*.sql`.

Apply is intentionally not exercised by Phase B. The older beta's non-interactive confirmation behaviour differed from the current Wrangler operational path, and newer betas changed destructive-command confirmation semantics. Apply must therefore be re-verified separately and wrapped in the repository-owned `list -> validate -> authorize -> apply -> list/audit` flow before any switch.

### `d1-export`

The current operational SQL dump remains `wrangler d1 export DB --remote --output <file>`. No cf replacement is assumed.

### `preview-schema-preflight`

The current preflight remains `wrangler d1 execute DB --remote --env preview --json --command <SQL>`. The candidate is `cf d1 query <DATABASE_ID> --sql <SQL>`, but its result and error shapes need an adapter and a credentialed preview query before switching.

## Blocking reasons

These strings are canonical and shared with `scripts/cloudflare-cf-parity.cjs`.

- `remote-unverified` — no credentialed remote run has compared cf against Wrangler for this surface; only offline/local evidence exists
- `interactive-confirm-fail-open` — cf apply confirmation semantics differ from the current Wrangler operational path, so apply needs a repository-owned authorization gate before switching
- `no-cf-equivalent` — cf v1.0.0-beta.24 has no `d1 export`/`d1 import` command, so the Wrangler operational command is the only path
- `output-shape-differs` — the preview preflight parses `wrangler d1 execute --json` output; `cf d1 query` documents no `--json` flag and returns the D1 HTTP query API result instead
- `no-local-verification-path` — `cf d1 query --local` fails closed ("This command has no local equivalent"), so this surface cannot be verified without Cloudflare credentials
- `auth-error-text-differs` — the preview preflight keys its fail-open auth/log detection on Wrangler-specific text (CLOUDFLARE_API_TOKEN / non-interactive / code 7403); cf reports a different API error shape, so detection would stop matching

## Findings and resolved prerequisites

### F1 — explicit target and glob

`cf d1 migrations list/apply` takes a database ID directly. `scripts/cloudflare-d1-target.cjs` resolves production and preview bindings independently and rejects identical IDs. `scripts/cloudflare-d1-migration-plan.cjs` pins `migrations/*.sql` rather than depending on an implicit glob.

### F2 — audit output normalization

PR #4239 added `scripts/d1-migration-audit.cjs`. The operational post-apply audit is no longer coupled to Wrangler's exact text format, but the command itself remains Wrangler until remote parity is established.

### F3 — fresh rebuild fixed

The old parity note said `0004_tournament_is_public/migration.sql` and `0005_add_public_modes/migration.sql` were hidden in nested directories and a clean D1 failed later at migration 0037. That was accurate before PR #4224. PR #4224 flattened them to `0004_tournament_is_public.sql` and `0005_add_public_modes.sql`, updated the migration-history guard for that reviewed one-time structural correction, and verified the full migration set on a clean local D1. #4220 is closed and is no longer a cf migration blocker.

### F4 — bounded execution fixed the hang prerequisite

A previous `cf d1 migrations list --local` run printed its result and failed to exit. PR #4243 introduced a repository-owned runner that requires a finite timeout and escalates process-group termination from SIGTERM to SIGKILL. Future cf migration execution must go through that boundary; an unbounded direct spawn is not switch-ready.

### F5 — beta surface is pinned

`cf` is still beta and changes between releases. The preview parity workflow installs the exact recorded version and runs the read-only help-surface check before any credentialed D1 read. A version or flag drift therefore stops the workflow before remote comparison.

## What a list switch requires

The `d1-migrations-list` surface may move to cf-first only after:

1. the pinned cf help surface passes;
2. the credentialed preview read-only comparison succeeds with identical pending migration names and success exit semantics;
3. that evidence is recorded here and `remote-unverified` is removed for list only;
4. CI and operator docs continue to require the bounded runner and preview/production target resolver;
5. the production path is reviewed separately before it is changed.

Phase B does **not** execute `cf d1 migrations apply`, does not modify D1 state, and does not change any production command.

# Repository-owned `cf` runner safety contract

Issue #4240 Phase A introduces `scripts/cloudflare-cf-runner.cjs` as the execution boundary for future `cf` D1 verification and migration work.

This does **not** switch any production or preview package script from Wrangler. The existing operational migration commands remain unchanged until the corresponding remote parity evidence is recorded under #4201.

## Responsibilities

The runner accepts only a plan produced in the shape defined by `scripts/cloudflare-d1-migration-plan.cjs` and validates it again before spawning a process.

It must:

- accept only the `cf` executable;
- accept only `d1 migrations list` or `d1 migrations apply` argument shapes;
- require an explicit `production` or `preview` environment;
- require a D1 UUID and an exact `<migrationsDir>/*.sql` pattern;
- use `shell: false` so arguments are never reinterpreted by a shell;
- require a finite positive timeout for every execution;
- spawn a detached process group on POSIX so timeout cleanup reaches descendants;
- send `SIGTERM` on timeout and `SIGKILL` after a bounded grace period;
- resolve with structured `stdout`, `stderr`, exit code, signal, timeout state, and spawn error information;
- redact values from token/secret/password/key/auth/credential environment variables before output is returned;
- never choose a different target, retry against another database, or fall back to Wrangler automatically.

The planner remains the source of command selection. The runner executes that exact plan; it does not reinterpret `production`/`preview` or invent missing arguments.

## Timeout contract

`runCfPlan(plan, { timeoutMs })` rejects an invalid or missing timeout before spawning `cf`.

On timeout:

1. the runner marks the result as timed out;
2. it sends `SIGTERM` to the process group on POSIX (or the child process on Windows);
3. it waits for the configured `killGraceMs`;
4. if the process has still not closed, it sends `SIGKILL` and resolves a failed structured result.

This bounds the previously observed `cf d1 migrations list --local` hang without treating a timeout as success.

## Failure semantics

A result is successful only when all of the following hold:

- no timeout occurred;
- no spawn error occurred;
- exit code is exactly `0`;
- no terminating signal was reported.

Non-zero exit, signal termination, timeout, and `ENOENT` remain distinct result states so later preview parity code can record them without parsing log text.

## Deliberately out of scope for Phase A

- no package script calls the runner yet;
- no credentialed Cloudflare command is executed;
- no preview or production D1 state is read or mutated;
- no Wrangler fallback is removed;
- no `cf d1 migrations apply` authorization policy is added yet.

The next consumer should be #4240 Phase B: credentialed **read-only preview** migration-list parity. That consumer must provide an explicit timeout and must not proceed to production mutation.

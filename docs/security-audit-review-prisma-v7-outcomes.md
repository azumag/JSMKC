# Prisma 7 advisory probe outcomes in the #3114 review

The manual `Security audit review` workflow collects three local Prisma 7 migration probes after the compatible and next-major upstream checks:

- `prisma-v7-readiness.cjs`
- `prisma-v7-support-surface.cjs`
- `prisma-v7-esm-surface.cjs`

These probes are deliberately advisory. Each step uses `continue-on-error: true`, because a parser or migration-surface failure must not silently change the meaning of the current-compatible Prisma remediation gate. The only automated gate remains `compatible_upstream_gate`, which evaluates the current manifest range.

The Job summary must still make advisory probe failures visible. The main check table therefore records the GitHub Actions outcome for all three Prisma 7 probes in addition to the lockfile, exception-status, canonical-audit, compatible-upstream, and next-major checks. This distinguishes two different situations that would otherwise look similar in a saved summary: a probe successfully reporting migration blockers, and a probe failing before it could produce trustworthy evidence.

A failed Prisma 7 advisory probe is not permission to upgrade Prisma, remove the #3114 exception, or weaken the audit policy. Review the failing probe, restore its evidence collection, and keep the explicit major-migration validation boundary documented in `prisma-v7-migration-readiness.md`.

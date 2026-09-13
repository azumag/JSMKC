# Prisma upstream evidence consistency probe

`smkc-score-app/scripts/security-audit-upstream-issue-consistency.js` is a read-only companion probe for Issue #3114.

The existing upstream evidence probe reads `prisma/orm#30052`, the merged fix PR `prisma/orm#30189`, and the latest issue-comment metadata. Those resources can change while a probe is running. A comment can be added, the issue can close or reopen, or metadata can be edited between requests. In that race window a single pass can combine values that never represented one stable upstream snapshot.

The consistency probe executes the existing bounded, redirect-rejecting upstream probe twice and compares the upstream-owned fields while intentionally ignoring the local `checkedAt` timestamp. It fails closed if the issue state, comment count, issue timestamps, latest-comment metadata, or fix-PR evidence differs between the two reads. Only the second snapshot is returned and published when both reads agree.

Run it from `smkc-score-app`:

```bash
node scripts/security-audit-upstream-issue-consistency.js
node scripts/security-audit-upstream-issue-consistency.js --json
```

This helper is advisory only. It does not change the compatible remediation gate, modify dependencies, remove the temporary GHSA-ggr8-5vv4-36mx exception, or authorize a Prisma major upgrade. A detected race should be retried later rather than interpreted as remediation evidence.

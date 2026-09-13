# Prisma upstream evidence consistency probe

`smkc-score-app/scripts/security-audit-upstream-issue.js` is the canonical read-only upstream evidence probe for Issue #3114. It now performs a two-pass consistency check before publishing evidence. The implementation that performs one bounded GitHub API pass lives in `security-audit-upstream-issue-single-pass.js` and is an internal building block.

The probe reads `prisma/orm#30052`, the merged fix PR `prisma/orm#30189`, and the latest issue-comment metadata. Those resources can change while a probe is running. A comment can be added, the issue can close or reopen, or metadata can be edited between requests. In that race window a single pass can combine values that never represented one stable upstream snapshot.

The consistency layer executes the existing bounded, redirect-rejecting single-pass probe twice and compares the upstream-owned fields while intentionally ignoring the local `checkedAt` timestamp. It fails closed if the issue state, comment count, issue timestamps, latest-comment metadata, or fix-PR evidence differs between the two reads. Only the second snapshot is returned and published when both reads agree.

Run the canonical command from `smkc-score-app`:

```bash
npm run security:audit:upstream-issue
npm run security:audit:upstream-issue:json
```

Direct execution remains equivalent:

```bash
node scripts/security-audit-upstream-issue.js
node scripts/security-audit-upstream-issue.js --json
```

This probe is advisory only. It does not change the compatible remediation gate, modify dependencies, remove the temporary GHSA-ggr8-5vv4-36mx exception, or authorize a Prisma major upgrade. A detected race should be retried later rather than interpreted as remediation evidence.
